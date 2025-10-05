# tripy_agentcore.py
import os, json, time, uuid
from typing import Any, Dict, List, Optional

from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent, tool
from strands.models import BedrockModel

# =========================
# Bedrock / 基本設定
# =========================
MODEL_ID = os.environ.get("MODEL_ID", "global.anthropic.claude-sonnet-4-20250514-v1:0")
REGION   = os.environ.get("AWS_REGION", "us-west-2")
model = BedrockModel(model_id=MODEL_ID, region_name=REGION)

# =========================
# レジストリ & ヘルスチェック設定（S3一択）
# =========================
REGISTRY_S3 = os.environ.get("REGISTRY_S3")  # 例: s3://tripy-registry/stg/tools.json
if not REGISTRY_S3:
    print("[WARN] REGISTRY_S3 が未設定です。起動は続行しますが、モックツールのみ有効になります。")

HEALTH_TIMEOUT_MS     = int(os.environ.get("HEALTH_TIMEOUT_MS", "1500"))  # ヘルスプローブのタイムアウト
REGISTRY_REFRESH_SEC  = int(os.environ.get("REGISTRY_REFRESH_SEC", "60")) # 何秒ごとに疎通再評価するか
FALLBACK_TO_MOCK      = os.environ.get("FALLBACK_TO_MOCK", "1") == "1"   # 全NG時にモックへ落とすか

# =========================
# ショートタームメモリ（DynamoDB; 任意ON）
# =========================
DDB_TABLE = os.environ.get("DDB_TABLE_TRIPY_MEMORY")  # 例: TripyMemory
_dynamo_tbl = None
if DDB_TABLE:
    try:
        import boto3
        _dynamo_tbl = boto3.resource("dynamodb", region_name=REGION).Table(DDB_TABLE)
        print(f"[INFO] Memory enabled: DynamoDB table={DDB_TABLE}")
        # 参考: arn は arn:aws:dynamodb:us-west-2:047786098634:table/TripyMemory
    except Exception as e:
        print(f"[WARN] DynamoDB init failed (memory disabled): {e}")
        _dynamo_tbl = None
else:
    print("[INFO] Memory disabled: DDB_TABLE_TRIPY_MEMORY is not set")

def _mem_save(user_id: str, session_id: str, role: str, content: str,
              request_id: str = "", tool_name: Optional[str] = None):
    """会話ログを1行保存（失敗しても処理は継続）"""
    if not _dynamo_tbl:
        return
    try:
        ts = int(time.time() * 1000)
        item = {
            "user_id": user_id,
            "ts": ts,  # sort key
            "session_id": session_id,
            "role": role,  # "user" | "assistant" | "tool"
            "content": (content or "")[:4000],  # 暫定上限
        }
        if request_id: item["request_id"] = request_id
        if tool_name:  item["tool_name"]  = tool_name
        _dynamo_tbl.put_item(Item=item)
    except Exception as e:
        print(f"[WARN] memory save failed: {e}")

def _mem_load_recent(user_id: str, limit: int = 6) -> List[Dict[str, str]]:
    """直近 limit 件を古い→新しい順に返す（なければ空）"""
    if not _dynamo_tbl:
        return []
    try:
        from boto3.dynamodb.conditions import Key
        res = _dynamo_tbl.query(
            KeyConditionExpression=Key("user_id").eq(user_id),
            ScanIndexForward=False,  # 降順（新しい→古い）
            Limit=limit
        )
        items = res.get("Items", [])
        items.reverse()  # 古い→新しいへ
        history = []
        for it in items:
            history.append({
                "role": it.get("role", "user"),
                "content": it.get("content", "")
            })
        return history
    except Exception as e:
        print(f"[WARN] memory load failed: {e}")
        return []

def _prepend_history_to_prompt(prompt: str, history: List[Dict[str, str]]) -> str:
    if not history:
        return prompt
    # 軽量な前置き文（プロンプト長を増やしすぎない）
    prefix_lines = ["【直近の会話（最新が下）】"]
    for h in history:
        tag = "ユーザー" if h["role"] == "user" else ("アシスタント" if h["role"] == "assistant" else "ツール")
        # 各行は適度に切り詰め
        content = (h["content"] or "").strip()
        if len(content) > 200:
            content = content[:200] + "..."
        prefix_lines.append(f"- {tag}: {content}")
    prefix_lines.append("")  # 空行
    return "\n".join(prefix_lines) + prompt

# =========================
# 既存モック（必要に応じて削除可）
# =========================
@tool
def BookingTool(query: str) -> str:      return f"[MOCK] BookingTool: {query}"
@tool
def RecommendTool(query: str) -> str:    return f"[MOCK] RecommendTool: {query}"
@tool
def MapTool(query: str) -> str:          return f"[MOCK] MapTool: {query}"
@tool
def HelpdeskTool(query: str) -> str:     return f"[MOCK] HelpdeskTool: {query}"
@tool
def ItineraryTool(query: str) -> str:    return f"[MOCK] ItineraryTool: {query}"
@tool
def TodoTool(query: str) -> str:         return f"[MOCK] TodoTool: {query}"
@tool
def VisaCheckTool(query: str) -> str:    return f"[MOCK] VisaCheckTool: {query}"
@tool
def RateConvertTool(query: str) -> str:  return f"[MOCK] RateConvertTool: {query}"

MOCK_TOOLS = [
    BookingTool, RecommendTool, MapTool, HelpdeskTool,
    ItineraryTool, TodoTool, VisaCheckTool, RateConvertTool
]

# =========================
# S3 レジストリ読込 & 疎通チェック
# =========================
def _interp_env(value: str) -> str:
    """ ${FOO} を環境変数で置換（見つからなければ原文のまま） """
    if isinstance(value, str) and value.startswith("${") and value.endswith("}"):
        return os.getenv(value[2:-1], value)
    return value

def _load_registry_from_s3() -> List[Dict[str, Any]]:
    """ REGISTRY_S3 の JSON をロード（失敗時は空リスト） """
    if not REGISTRY_S3:
        return []
    try:
        import boto3
        uri = REGISTRY_S3
        assert uri.startswith("s3://"), "REGISTRY_S3 must start with s3://"
        _, rest = uri.split("s3://", 1)
        bucket, key = rest.split("/", 1)
        s3 = boto3.client("s3", region_name=REGION)
        obj = s3.get_object(Bucket=bucket, Key=key)
        data = obj["Body"].read()
        return json.loads(data)
    except Exception as e:
        print(f"[WARN] registry load failed from {REGISTRY_S3}: {e}")
        return []

def _probe_health(url: str, health_url: Optional[str], timeout_s: float) -> bool:
    """ ツールの疎通確認（health_urlがあれば優先、なければurlにHEAD/GET/OPTIONS） """
    import httpx
    target = _interp_env(health_url) if health_url else _interp_env(url)
    try:
        with httpx.Client(timeout=timeout_s) as client:
            for method in ("HEAD", "GET", "OPTIONS"):
                try:
                    r = client.request(method, target)
                    # 2xx〜4xx の応答があれば「生存」とみなす（厳密な判定は各APIに合わせて）
                    if 200 <= r.status_code < 500:
                        return True
                except Exception:
                    continue
    except Exception:
        return False
    return False

def _build_http_tool(cfg: Dict[str, Any]):
    """ レジストリエントリから HTTP ツールを生成 """
    import httpx
    name    = cfg["name"]
    method  = (cfg.get("method") or "POST").upper()
    url     = _interp_env(cfg["url"])
    headers = {k: _interp_env(v) for k, v in (cfg.get("headers") or {}).items()}
    timeout = (cfg.get("timeout_ms") or 5000) / 1000

    @tool(name=name, description=cfg.get("desc") or "")
    def _http_tool(query: str) -> str:
        payload = {"query": query}  # 必要に応じてスキーマ化
        with httpx.Client(timeout=timeout) as client:
            r = client.request(method, url, headers=headers, json=payload)
        r.raise_for_status()
        return r.text  # LLMが要約/結合
    return _http_tool

# =========================
# ツール・キャッシュ（TTLで再評価）
# =========================
_active_tools: List[Any] = []
_last_built_at = 0.0

def _rebuild_tools_if_needed():
    """ REGISTRY_REFRESH_SEC ごとにレジストリを読み直し、疎通OKのみ有効化 """
    global _active_tools, _last_built_at
    now = time.time()
    if _active_tools and (now - _last_built_at) < REGISTRY_REFRESH_SEC:
        return

    registry = _load_registry_from_s3()
    healthy_tools: List[Any] = []
    timeout_s = HEALTH_TIMEOUT_MS / 1000.0

    for cfg in registry:
        try:
            url = cfg["url"]
            health_url = cfg.get("health_url")
            if _probe_health(url, health_url, timeout_s):
                healthy_tools.append(_build_http_tool(cfg))
            else:
                print(f"[INFO] tool disabled (health NG): {cfg.get('name')} -> {url}")
        except Exception as e:
            print(f"[WARN] tool skipped (error): {cfg.get('name')}: {e}")

    if healthy_tools:
        _active_tools = healthy_tools
    else:
        if FALLBACK_TO_MOCK:
            print("[INFO] no healthy tools; fallback to MOCK_TOOLS")
            _active_tools = MOCK_TOOLS
        else:
            print("[INFO] no healthy tools; running with no tools")
            _active_tools = []

    _last_built_at = now

def _make_supervisor() -> Agent:
    _rebuild_tools_if_needed()
    return Agent(
        model=model,
        name="supervisor",
        system_prompt=(
            "あなたは監督エージェント。ユーザーの依頼を分解し、"
            "疎通OKなツール(API)のみを使用してよい。"
            "必要なときだけツールを使い、最後に要点を統合して回答する。"
        ),
        tools=_active_tools,
    )

# =========================
# AgentCore エントリポイント
# =========================
app = BedrockAgentCoreApp()

@app.entrypoint
def invoke(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    AgentCore Runtime から呼ばれる関数。
    payload 例: {"prompt": "...", "user_id": "...", "session_id": "...", "request_id": "..."}
    """
    prompt     = payload.get("prompt") or payload.get("message") or ""
    user_id    = payload.get("user_id") or "anon"
    session_id = payload.get("session_id") or user_id or "anon"
    request_id = payload.get("request_id") or str(uuid.uuid4())

    # 1) ユーザー発話を保存
    _mem_save(user_id, session_id, "user", prompt, request_id=request_id)

    # 2) 直近N件を軽く注入（長すぎない前置き）
    history = _mem_load_recent(user_id, limit=6)
    if history:
        prompt = _prepend_history_to_prompt(prompt, history)

    # 3) 監督エージェント
    supervisor = _make_supervisor()  # TTLに応じて最新の有効ツール群を注入
    result = supervisor(prompt, session_id=session_id)
    text = str(result)

    # 4) 応答を保存
    _mem_save(user_id, session_id, "assistant", text, request_id=request_id)

    return {
        "request_id": request_id,
        "result": text
    }

if __name__ == "__main__":
    app.run()
