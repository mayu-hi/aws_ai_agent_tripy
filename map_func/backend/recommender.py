import json
from pathlib import Path
from typing import List

from .models import Place

DATA_DIR = Path(__file__).parent / "data"
HISTORY_FILE = DATA_DIR / "history.json"
LLM_NOTES_FILE = DATA_DIR / "llm_notes.json"

# 超簡易: 履歴 + LLMメモからジャンル/エリアを抽出して候補を返すダミー関数
# 実運用では、ここでRDS/ATHENA/S3の履歴分析、Bedrock/AzureOpenAIなどLLM呼び出しを行う


def load_history():
    if HISTORY_FILE.exists():
        return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    return {"visited": [], "favorites": []}


def load_llm_notes():
    if LLM_NOTES_FILE.exists():
        return json.loads(LLM_NOTES_FILE.read_text(encoding="utf-8"))
    return {"preferences": {}}


def recommend() -> List[Place]:
    history = load_history()
    notes = load_llm_notes()

    # 最も単純なヒューリスティクス例：
    # - 履歴のお気に入りに多いカテゴリ/エリアを重視
    # - LLMノートの"preferences"（例: {"coffee": true, "running": true}）に合うスポットを追加

    favorites = history.get("favorites", [])
    visited = history.get("visited", [])

    # ダミーのおすすめ候補（現実はPlace Indexや自前DBからスコアリング）
    candidates = [
        {"name": "Blue Bottle Coffee Aoyama", "lat": 35.665, "lon": 139.712, "tag": "coffee"},
        {
            "name": "Meiji Jingu Gaien Ginkgo Avenue",
            "lat": 35.672,
            "lon": 139.717,
            "tag": "running",
        },
        {"name": "Tsukiji Outer Market", "lat": 35.6655, "lon": 139.769, "tag": "food"},
        {"name": "TeamLab Planets", "lat": 35.643, "lon": 139.786, "tag": "art"},
        {
            "name": "MONZ COFFEE",
            "lat": 35.6722720906654,
            "lon": 139.79786184853572,
            "tag": "coffee",
        },
        {
            "name": "Kiba Park",
            "lat": 35.67711508579263,
            "lon": 139.8078381099808,
            "tag": "running",
        },
    ]

    prefs = notes.get("preferences", {})
    picked = []
    for c in candidates:
        tag = c.get("tag")
        if tag and prefs.get(tag):
            picked.append(c)

    # もし何もヒットしなければ人気順ダミーを返す
    if not picked:
        picked = candidates[:2]

    # 既訪/お気に入りと重複名は除外
    used_names = {p.get("name") for p in visited + favorites}
    results = []
    for p in picked:
        if p["name"] in used_names:
            continue
        results.append(
            Place(
                name=p["name"],
                category="recommended",
                lat=p["lat"],
                lon=p["lon"],
                note=p.get("tag"),
            )
        )

    return results
