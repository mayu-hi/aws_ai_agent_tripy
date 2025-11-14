import os, json, boto3

# ====== Config ======
REGION = os.environ.get("AWS_REGION", "ap-northeast-1")
KB_ID = os.environ["BEDROCK_KB_ID"]
MODEL_ID = os.environ.get("MODEL_ID", "anthropic.claude-sonnet-4-20250514-v1:0")

brt = boto3.client("bedrock-agent-runtime", region_name=REGION)
brm = boto3.client("bedrock-runtime", region_name=REGION)

# ====== ルールベース (MVP用) ======
VISA_MASTER = {
    ("JPN", "USA", "tourism"): {"max_days_without_visa": 90, "note": "ESTA申請必要"},
    ("JPN", "GBR", "tourism"): {"max_days_without_visa": 180, "note": ""},
    ("JPN", "THA", "tourism"): {"max_days_without_visa": 30, "note": ""},
}

def _normalize_country(x: str) -> str:
    m = {"日本":"JPN","JP":"JPN","アメリカ":"USA","US":"USA","USA":"USA",
         "イギリス":"GBR","UK":"GBR","タイ":"THA","Thailand":"THA"}
    return m.get(x.strip(), x.strip().upper())

def _normalize_purpose(x: str) -> str:
    m = {"観光":"tourism","tourism":"tourism","商用":"business","business":"business"}
    return m.get(x.strip().lower(), "tourism")

def _ok(body, code=200):
    return {"statusCode": code, "headers": {"Content-Type": "application/json"}, "body": json.dumps(body, ensure_ascii=False)}

def health(event, context):
    return _ok({"status": "ok"})

def handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
        q = body.get("query") or "{}"
        params = json.loads(q) if isinstance(q, str) else q
    except Exception:
        return _ok({"error": "invalid_input"}, 400)

    dep = "JPN"  # 日本前提
    dest = _normalize_country(params.get("destination",""))
    purpose = _normalize_purpose(params.get("purpose","tourism"))
    days = int(params.get("days", 0))

    # --- 国内は即不要 ---
    if dest in ("JPN",""):
        return _ok({"visa_required": False, "reason": "国内旅行のため不要"})

    # --- ルールベース ---
    rule = VISA_MASTER.get((dep, dest, purpose))
    if rule:
        if days <= rule["max_days_without_visa"]:
            return _ok({"visa_required": False, "reason": f"{rule['max_days_without_visa']}日以内は不要", "note": rule["note"]})
        else:
            return _ok({"visa_required": True, "reason": "長期滞在のため必要", "note": rule["note"]})

    # --- KBフォールバック ---
    query = f"日本国籍、{dest}へ{purpose}目的で{days}日滞在。ビザ要否を教えて。"
    kb = brt.retrieve(
        knowledgeBaseId=KB_ID,
        retrievalQuery={"text": query},
        retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": 3}}
    )

    docs = "\n\n".join([r["content"]["text"] for r in kb["retrievalResults"]])

    messages = [
        {"role":"system","content":"あなたはビザアシスタント。JSONで返答してください。"},
        {"role":"user","content":f"{query}\n\nKBからの情報:\n{docs}"}
    ]
    resp = brm.invoke_model(
        modelId=MODEL_ID,
        body=json.dumps({"messages": messages})
    )

    result = json.loads(resp["body"].read())
    return _ok(result)
