# recommend_handler.py  -- F&B-focused simple baseline (LLM-led)
import os, json, unicodedata, boto3
from datetime import datetime, timezone
from botocore.config import Config

# ---------- DynamoDB ----------
DDB = boto3.resource('dynamodb')
TABLE_MSG = DDB.Table(os.environ['TABLE_TRIPY_MESSAGES'])
TABLE_UPF = DDB.Table(os.environ['TABLE_USER_PROFILE'])
AGENT_TOKEN = os.environ.get('RECO_TOKEN')

# ---------- Bedrock ----------
MODEL_ID = os.environ.get('MODEL_ID')   # e.g. anthropic.claude-sonnet-4-20250514-v1:0
REGION   = os.environ.get('AWS_REGION', 'us-west-2')
brt = boto3.client('bedrock-runtime', region_name=REGION)

# ---------- Amazon Location ----------
PLACE_INDEX = os.environ.get('PLACE_INDEX_NAME')
_loc = None

# ---------- Params ----------
MAX_PER_QUERY   = 10
MAX_CANDIDATES  = 80
DEFAULT_TOPK    = 10

# ==================================================
# Utils
# ==================================================
def _resp(code: int, body, ctype='application/json; charset=utf-8'):
    return {"statusCode": code, "headers": {"Content-Type": ctype},
            "body": body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)}

def _safe_parse_body(event):
    body_raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        import base64; body_raw = base64.b64decode(body_raw)
    if isinstance(body_raw, bytes):
        body_raw = body_raw.decode("utf-8", errors="replace")
    try: obj = json.loads(body_raw)
    except Exception:
        print("[WARN] JSON decode failed. raw_head=", str(body_raw)[:120]); obj = {"_raw": body_raw}
    return obj, body_raw

def _put_log(item):
    try: TABLE_MSG.put_item(Item=item)
    except Exception as e: print("[WARN] put msg failed:", repr(e))

# ==================================================
# Bedrock
# ==================================================
def _invoke_bedrock_messages(system, user):
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
        if c.get("type") == "text": return c.get("text")
    return ""

# ==================================================
# Memory (User Profile)
# ==================================================
def _load_user_prefs(user_id: str, headers_lower: dict):
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
# Amazon Location
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
    if not r.get("Results"): raise ValueError("city not found")
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
# LLM: anchor / queries / topK
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
    # ★ 飲食系に全振り（地名は禁止）
    system = (
        "あなたはPOI検索のクエリプランナーです。"
        "目的は『依頼文の近傍で今すぐ行ける飲食系スポットを幅広く拾う』ことです。"
        "次を厳守して、検索語を6〜10個、JSONで返してください。"
        " - 地名/駅名/行政名などのトポニムは含めない。"
        " - “飲食系カテゴリ/業態/メニュー” を中心に、広く網羅（例: "
        "   cafe, coffee shop, espresso bar, bakery cafe, restaurant, lunch, dinner, "
        "   izakaya, ramen, sushi, curry, tempura, yakitori, steak, Italian, Chinese, "
        "   bar, sweets, dessert, pancake, parfait, burger, pizza, pasta）。"
        " - 日本語と英語の混在可。重複は避ける。"
        "出力は {\"queries\":[\"...\", ...]} のみ。説明や他のキーは不要。"
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
        # フォールバックは飲食系に全振り
        return [
            "cafe","coffee shop","espresso bar","bakery cafe",
            "restaurant","lunch","dinner","izakaya","ramen","sushi",
            "curry","yakitori","bar","dessert","sweets"
        ][:8]

def _llm_pick_topk(city_text, center, prefs, candidates, top_k):
    # ★ “訪問できる一点”前提で飲食系を広く採用（チェーン可）
    system = (
        "あなたは旅程プランナーです。"
        "候補(candidates)から『旅行者が実際に訪問できる一点(POI)』のみを対象に、"
        "飲食系（カフェ/チェーン/個人店/居酒屋/各国料理/甘味/バー含む）を広く採用して上位N件を選んでください。"
        "除外：行政区/地区/駅/町名などの“地名ラベル”のみ、道路・川など広域、系列名だけで店舗が特定できないもの。"
        "判断は candidates の name/address/categories の文字情報のみで行い、数値距離や半径は用いない。"
        "出力は JSON 配列のみ。各要素は {\"name\": str, \"lat\": number, \"lon\": number}。他のキーは不要。"
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
    # フォールバック：形式が崩れたら先頭からK件だけ薄く返す
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
    method = (rc_http.get("method") or "").upper()
    raw_path = event.get("rawPath") or rc_http.get("path") or ""
    path = ("/" + raw_path.rsplit("/", 1)[-1]) if raw_path else raw_path
    print(f"[INFO] method={method} path={path}")

    headers = event.get("headers") or {}
    headers_lower = {(k or "").lower(): v for k, v in headers.items()}

    if not (method == "POST" and path == "/invoke"):
        return _resp(404, "not found", "text/plain; charset=utf-8")

    # token
    received_token = headers_lower.get("x-agent-token")
    if AGENT_TOKEN and received_token != AGENT_TOKEN:
        print(f"[WARN] unauthorized: received={received_token}")
        return _resp(401, "unauthorized", "text/plain; charset=utf-8")

    # body
    body_json, _ = _safe_parse_body(event)
    city_text = body_json.get("city_text") or body_json.get("query") or ""
    city_text = unicodedata.normalize("NFKC", city_text)
    top_k = int(body_json.get("top_k", DEFAULT_TOPK))
    user_id = headers_lower.get("x-user-id") or body_json.get("user_id") or "anon"
    now = datetime.now(timezone.utc).isoformat()

    if not city_text:
        return _resp(400, {"error": "city_text (or query) is required"})

    print(f"[INFO] user={user_id}, city_text={city_text}, top_k={top_k}")
    _put_log({"userId": user_id, "ts": now, "role": "user",
              "content": city_text, "source": "orchestrator"})

    # prefs
    prefs = _load_user_prefs(user_id, headers_lower)

    # anchor -> center
    anchor_js = _llm_resolve_geo(city_text, prefs)
    anchor = anchor_js["anchor_text"]
    try:
        center_info = _geocode_city_center(anchor)
    except Exception as e:
        return _resp(404, {"error": f"anchor not found for '{anchor}'",
                           "detail": str(e)})
    center = center_info["center"]

    # LLM queries (F&B focused, no toponym)
    queries = _llm_plan_queries(city_text, prefs, top_k)

    # gather candidates
    candidates = []
    for q in queries:
        candidates.extend(_search_pois(center, q, per_query=MAX_PER_QUERY))
    candidates = _dedup_candidates(candidates)

    # pick topK by LLM (F&B wide adoption)
    spots = _llm_pick_topk(city_text, center, prefs, candidates, top_k)

    payload = {"city": center_info["city"], "center": center, "spots": spots}

    _put_log({"userId": user_id, "ts": datetime.now(timezone.utc).isoformat(),
              "role": "agent", "content": json.dumps(payload, ensure_ascii=False),
              "source": "reco_llm_topk"})
    return _resp(200, payload)
