# recommend_handler.py  -- London mock (chat+map) + fallback to original F&B flow
import os, json, unicodedata, boto3
from datetime import datetime, timezone
from botocore.config import Config

# ---------- DynamoDB ----------
DDB = boto3.resource('dynamodb')
TABLE_MSG = DDB.Table(os.environ.get('TABLE_TRIPY_MESSAGES', ''))
TABLE_UPF = DDB.Table(os.environ.get('TABLE_USER_PROFILE', ''))
AGENT_TOKEN = os.environ.get('RECO_TOKEN')

# ---------- Bedrock ----------
MODEL_ID = os.environ.get('MODEL_ID')   # e.g. anthropic.claude-sonnet-4-20250514-v1:0
REGION   = os.environ.get('AWS_REGION', 'us-west-2')
brt = boto3.client('bedrock-runtime', region_name=REGION) if MODEL_ID else None

# ---------- Amazon Location ----------
PLACE_INDEX = os.environ.get('PLACE_INDEX_NAME')
_loc = None

# ---------- Params ----------
MAX_PER_QUERY   = 10
MAX_CANDIDATES  = 80
DEFAULT_TOPK    = 10

# ---------- CORS ----------
CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Agent-Token,X-User-Id',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
}

# ==================================================
# Utils
# ==================================================
def _resp(code: int, body, ctype='application/json; charset=utf-8'):
    return {
        "statusCode": code,
        "headers": {"Content-Type": ctype, **CORS},
        "body": body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)
    }

def _safe_parse_body(event):
    body_raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        import base64; body_raw = base64.b64decode(body_raw)
    if isinstance(body_raw, bytes):
        body_raw = body_raw.decode("utf-8", errors="replace")
    try:
        obj = json.loads(body_raw)
    except Exception:
        print("[WARN] JSON decode failed. raw_head=", str(body_raw)[:120]); obj = {"_raw": body_raw}
    return obj, body_raw

def _put_log(item):
    if not TABLE_MSG.name:
        return
    try:
        TABLE_MSG.put_item(Item=item)
    except Exception as e:
        print("[WARN] put msg failed:", repr(e))

# ==================================================
# London MOCK (JSと同仕様)
# ==================================================
def _build_for_persona1_london():
    spots = [
        { "name": "King’s Cross Platform 9¾", "lat": 51.5323, "lon": -0.1240, "category": "harry_potter",        "why": "写真映え＆駅直結で行きやすい" },
        { "name": "Leadenhall Market",       "lat": 51.5124, "lon": -0.0830, "category": "harry_potter",        "why": "HPロケ地の雰囲気、昼〜夕方に◎" },
        { "name": "Millennium Bridge",       "lat": 51.5106, "lon": -0.0988, "category": "harry_potter",        "why": "テムズ川の映えスポット" },
        { "name": "House of MinaLima",       "lat": 51.5120, "lon": -0.1314, "category": "harry_potter_shop",   "why": "HPデザイングッズの聖地" },
        { "name": "Cecil Court",             "lat": 51.5103, "lon": -0.1278, "category": "street",              "why": "レトロな書店街で“世界観”散歩" },
        { "name": "Warner Bros. Studio Tour London", "lat": 51.6905, "lon": -0.4172, "category": "harry_potter_studio", "why": "本命体験。事前予約＆郊外移動" },
        { "name": "Peggy Porschen Belgravia","lat": 51.4939, "lon": -0.1507, "category": "cafe",                "why": "ピンクの外観が映える人気カフェ" },
        { "name": "EL&N Cafe (Park Lane)",   "lat": 51.5052, "lon": -0.1531, "category": "cafe",                "why": "店内デコがフォトジェニック" },
        { "name": "Sketch (Gallery)",        "lat": 51.5111, "lon": -0.1416, "category": "cafe_brunch",         "why": "特別感あるティー体験" },
        { "name": "Notting Hill – Farm Girl","lat": 51.5160, "lon": -0.2023, "category": "cafe",                "why": "ノッティングヒル散策とセット" }
    ]
    chat = "\n".join([
        "卒業旅行＆ハリポタ好き向けに、ロンドンの『映え×行きやすさ』優先で10スポットを選びました。",
        "中心地で回しやすい順で並べ、スタジオツアーだけは郊外枠として別途予約推奨です。",
        "・King’s Cross 9¾：まずは駅で写真！",
        "・Leadenhall Market／MinaLima／Cecil Court：HP世界観を街歩きで。",
        "・Millennium Bridge：テムズの定番映え橋。",
        "・Peggy Porschen／EL&N／Sketch／Farm Girl：カフェは写真重視でピック。",
        "・WB Studio Tour：半日〜1日枠、事前予約が安全です。",
        "希望があれば、午前/午後での回し方や地下鉄ルートも提案できます。"
    ])
    return {
        "chat": chat,
        "map": { "city": "London", "center": { "lat": 51.5074, "lon": -0.1278 }, "spots": spots }
    }

def _is_london_mock(city: str, persona_id: str) -> bool:
    c = (city or "").strip().lower()
    p = (persona_id or "").strip().lower()
    # personaは特定値でなくてもOKにする場合は p の条件を緩めてください
    return c in {"london", "ロンドン"} and (p in {"uni_female_hp_cafe_beginner", "", None} or True)

# ==================================================
# Bedrock (既存ロジック用)
# ==================================================
def _invoke_bedrock_messages(system, user):
    if not brt or not MODEL_ID:
        return ""
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1200,
        "temperature": 0.3,
        "top_p": 0.9,
        "system": system,
        "messages": [{"role": "user", "content": user}]
    }
    resp = brt.invoke_model(modelId=MODEL_ID, body=json.dumps(body))
    out = json.loads(resp["body"].read().decode("utf-8"))
    for c in out.get("content", []):
        if c.get("type") == "text":
            return c.get("text")
    return ""

# ==================================================
# Memory (User Profile)
# ==================================================
def _load_user_prefs(user_id: str, headers_lower: dict):
    if not TABLE_UPF.name:
        return {"likes": [], "dislikes": [], "visited_spots": []}
    resp = TABLE_UPF.get_item(Key={"userId": user_id})
    item = resp.get("Item") or {}
    preferences = item.get("preferences") or {}
    likes = preferences.get("likes", []) or (item.get("persona") or {}).get("likes", []) or []
    dislikes = preferences.get("dislikes", []) or []
    visited = preferences.get("visited_spots", []) or []
    return {"likes": [str(x).lower() for x in likes],
            "dislikes": [str(x).lower() for x in dislikes],
            "visited_spots": list(visited)}

# ==================================================
# Amazon Location（既存ロジック用）
# ==================================================
def _loc_client():
    global _loc, PLACE_INDEX
    if PLACE_INDEX is None:
        PLACE_INDEX = os.environ.get('PLACE_INDEX_NAME')
    if not PLACE_INDEX:
        raise RuntimeError("PLACE_INDEX_NAME not set")
    if _loc is None:
        _loc = boto3.client("location", region_name=REGION, config=Config(retries={"max_attempts": 3}))
    return _loc

def _geocode_city_center(text: str):
    r = _loc_client().search_place_index_for_text(IndexName=PLACE_INDEX, Text=text, MaxResults=1, Language="ja")
    if not r.get("Results"):
        raise ValueError("city not found")
    p = r["Results"][0]["Place"]; lon, lat = p["Geometry"]["Point"]
    return {"city": p.get("Label", text), "center": {"lat": lat, "lon": lon}}

def _search_pois(center, query: str, per_query=MAX_PER_QUERY):
    r = _loc_client().search_place_index_for_text(
        IndexName=PLACE_INDEX, Text=query, MaxResults=per_query,
        BiasPosition=[center["lon"], center["lat"]], Language="ja")
    out = []
    for it in r.get("Results", []):
        p = it.get("Place") or {}; geom = p.get("Geometry") or {}; pt = geom.get("Point")
        if not pt: continue
        lon, lat = pt
        out.append({
            "name": p.get("Name") or p.get("Label"),
            "lat": lat, "lon": lon,
            "address": (p.get("Address") or {}).get("Label"),
            "categories": p.get("Categories") or []
        })
    return out

def _dedup_candidates(cands):
    seen, uniq = set(), []
    for it in cands:
        k = (it["name"], round(it["lat"], 4), round(it["lon"], 4))
        if k in seen: continue
        seen.add(k); uniq.append(it)
    return uniq

# ==================================================
# LLM: anchor / queries / topK（既存ロジック）
# ==================================================
def _llm_resolve_geo(city_text: str, prefs: dict):
    system = (
        "あなたは地理解釈アシスタントです。"
        "入力の文章から、検索の中心に相応しい『単一の地名（駅/地区/施設）』を1つだけ選び、"
        "誰が見ても特定できる表記に正規化して返す。"
        "出力は JSON のみ: {\"anchor_text\":\"...\"}"
    )
    user = {"request": city_text, "persona": prefs}
    txt = _invoke_bedrock_messages(system, json.dumps(user, ensure_ascii=False))
    try:
        js = json.loads(txt); return {"anchor_text": str(js.get("anchor_text") or city_text)[:160]}
    except Exception:
        return {"anchor_text": city_text}

def _llm_plan_queries(city_text: str, prefs: dict, top_k: int):
    system = (
        "あなたはPOI検索のクエリプランナーです。"
        "目的は『依頼文の近傍で今すぐ行ける飲食系スポットを幅広く拾う』ことです。"
        "次を厳守して、検索語を6〜10個、JSONで返してください。"
        " - 地名/駅名/行政名などのトポニムは含めない。"
        " - “飲食系カテゴリ/業態/メニュー” を中心に、広く網羅。"
        " - 日本語と英語の混在可。重複は避ける。"
        "出力は {\"queries\":[\"...\", ...]} のみ。"
    )
    user = {"city_text": city_text, "preferences": prefs, "top_k": top_k}
    try:
        js = json.loads(_invoke_bedrock_messages(system, json.dumps(user, ensure_ascii=False)))
        qs = js.get("queries") or []
        if not isinstance(qs, list) or not qs:
            raise ValueError("empty")
        return list(dict.fromkeys([str(q)[:60] for q in qs]))[:8]
    except Exception as e:
        print("[WARN] _llm_plan_queries failed:", repr(e))
        return ["cafe","coffee shop","espresso bar","bakery cafe","restaurant","lunch","dinner","izakaya"][:8]

def _llm_pick_topk(city_text, center, prefs, candidates, top_k):
    system = (
        "あなたは旅程プランナーです。"
        "候補(candidates)から『旅行者が実際に訪問できる一点(POI)』のみを対象に、"
        "飲食系を広く採用して上位N件を選んでください。"
        "出力は JSON 配列のみ。各要素は {\"name\": str, \"lat\": number, \"lon\": number}。"
    )
    user = {"request": city_text, "center": center, "preferences": prefs,
            "top_k": top_k, "candidates": candidates[:MAX_CANDIDATES]}
    txt = _invoke_bedrock_messages(system, json.dumps(user, ensure_ascii=False))
    try:
        arr = json.loads(txt)
        if isinstance(arr, list):
            out = []
            for it in arr[:top_k]:
                if isinstance(it, dict) and {"name","lat","lon"} <= it.keys():
                    out.append({"name": it["name"], "lat": float(it["lat"]), "lon": float(it["lon"])})
            if out: return out[:top_k]
    except Exception as e:
        print("[WARN] _llm_pick_topk parse failed:", repr(e))
    return [{"name": c["name"], "lat": c["lat"], "lon": c["lon"]} for c in candidates[:top_k]]

# ==================================================
# Handler
# ==================================================
def handler(event, context):
    print("=== EVENT(v2) ===")
    print(json.dumps({"rawPath": event.get("rawPath"),
                      "routeKey": event.get("routeKey"),
                      "isBase64Encoded": event.get("isBase64Encoded")}, ensure_ascii=False))

    rc_http = (event.get("requestContext") or {}).get("http") or {}
    method = (rc_http.get("method") or event.get("httpMethod") or "").upper()
    raw_path = event.get("rawPath") or rc_http.get("path") or event.get("path") or ""
    last = ("/" + raw_path.replace("/","/").rstrip("/").split("/")[-1]) if raw_path else ""

    # CORS / Preflight
    if method == "OPTIONS":
        return _resp(200, "")

    # Health
    if method == "GET" and last == "/health":
        return _resp(200, {"status": "ok"})

    headers = event.get("headers") or {}
    headers_lower = {(k or "").lower(): v for k, v in headers.items()}

    # Auth
    received_token = headers_lower.get("x-agent-token")
    if AGENT_TOKEN and received_token != AGENT_TOKEN:
        print(f"[WARN] unauthorized: received={received_token}")
        return _resp(401, "unauthorized", "text/plain; charset=utf-8")

    # Body
    body_json, _ = _safe_parse_body(event)
    user_id = headers_lower.get("x-user-id") or body_json.get("user_id") or "anon"
    now = datetime.now(timezone.utc).isoformat()

    # ===== Route: /recommend（新：モック優先） =====
    if method == "POST" and last in {"/recommend", "/spots", "/trips", "/trips_recommend"}:
        city = (body_json.get("city") or body_json.get("city_text") or body_json.get("query") or "").strip()
        persona_id = (body_json.get("persona_id") or "").strip()
        top_k = int(body_json.get("top_k", DEFAULT_TOPK))

        if not city:
            return _resp(400, {"error": "city (or city_text/query) is required"})

        # London mock: JSと同じ形式（chat / map）
        if _is_london_mock(city, persona_id):
            result = _build_for_persona1_london()
            _put_log({"userId": user_id, "ts": now, "role": "agent",
                      "content": json.dumps(result, ensure_ascii=False),
                      "source": "mock_london"})
            return _resp(200, result)

        # 以外は既存F&Bフローにフォールバック
        city_text = unicodedata.normalize("NFKC", city)
        _put_log({"userId": user_id, "ts": now, "role": "user",
                  "content": city_text, "source": "orchestrator"})

        prefs = _load_user_prefs(user_id, headers_lower)
        anchor_js = _llm_resolve_geo(city_text, prefs)
        anchor = anchor_js["anchor_text"]
        try:
            center_info = _geocode_city_center(anchor)
        except Exception as e:
            return _resp(404, {"error": f"anchor not found for '{anchor}'", "detail": str(e)})
        center = center_info["center"]

        queries = _llm_plan_queries(city_text, prefs, top_k)
        candidates = []
        for q in queries:
            candidates.extend(_search_pois(center, q, per_query=MAX_PER_QUERY))
        candidates = _dedup_candidates(candidates)

        spots = _llm_pick_topk(city_text, center, prefs, candidates, top_k)
        payload = {"chat": "", "map": {"city": center_info["city"], "center": center, "spots": spots}}
        _put_log({"userId": user_id, "ts": datetime.now(timezone.utc).isoformat(),
                  "role": "agent", "content": json.dumps(payload, ensure_ascii=False),
                  "source": "reco_llm_topk"})
        return _resp(200, payload)

    # ===== 互換: 既存 /invoke（壊さない） =====
    if method == "POST" and last == "/invoke":
        city_text = (body_json.get("city_text") or body_json.get("query") or "").strip()
        city_text = unicodedata.normalize("NFKC", city_text)
        top_k = int(body_json.get("top_k", DEFAULT_TOPK))
        if not city_text:
            return _resp(400, {"error": "city_text (or query) is required"})

        _put_log({"userId": user_id, "ts": now, "role": "user",
                  "content": city_text, "source": "orchestrator"})

        prefs = _load_user_prefs(user_id, headers_lower)
        anchor_js = _llm_resolve_geo(city_text, prefs)
        anchor = anchor_js["anchor_text"]
        try:
            center_info = _geocode_city_center(anchor)
        except Exception as e:
            return _resp(404, {"error": f"anchor not found for '{anchor}'", "detail": str(e)})
        center = center_info["center"]

        queries = _llm_plan_queries(city_text, prefs, top_k)
        candidates = []
        for q in queries:
            candidates.extend(_search_pois(center, q, per_query=MAX_PER_QUERY))
        candidates = _dedup_candidates(candidates)

        spots = _llm_pick_topk(city_text, center, prefs, candidates, top_k)
        payload = {"city": center_info["city"], "center": center, "spots": spots}
        _put_log({"userId": user_id, "ts": datetime.now(timezone.utc).isoformat(),
                  "role": "agent", "content": json.dumps(payload, ensure_ascii=False),
                  "source": "reco_llm_topk"})
        return _resp(200, payload)

    # その他
    return _resp(404, "not found", "text/plain; charset=utf-8")
