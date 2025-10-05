import json
import os
from pathlib import Path
from typing import List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .models import Place, RecInput
from .recommender import load_history, recommend

load_dotenv("backend/.env")

# 簡易ピン永続化
DATA_DIR = Path(__file__).parent / "data"
PINS_FILE = DATA_DIR / "pins.json"
PINS_FILE.parent.mkdir(parents=True, exist_ok=True)

GOOGLE_PLACES_API_KEY = os.getenv("GOOGLE_PLACES_API_KEY")
SERPAPI_KEY = os.getenv("SERPAPI_KEY")

app = FastAPI(title="ALS Travel App API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------
# Models
# ----------------------
class PinIn(BaseModel):
    name: str
    category: str  # visited | favorite | recommended | custom
    lat: float
    lon: float
    note: Optional[str] = None


class WebQuery(BaseModel):
    q: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    max_results: int = 6


# ----------------------
# Helpers
# ----------------------


def load_pins() -> List[Place]:
    if PINS_FILE.exists():
        try:
            raw = json.loads(PINS_FILE.read_text(encoding="utf-8"))
            return [Place(**p) for p in raw]
        except Exception:
            return []
    return []


def save_pins(items: List[Place]):
    PINS_FILE.write_text(
        json.dumps([p.model_dump() for p in items], ensure_ascii=False, indent=2), encoding="utf-8"
    )


async def provider_search(q: str, lat: Optional[float], lon: Optional[float], max_results: int = 6):
    """レビュー点数・営業時間を含むWeb情報取得。
    優先順位: Google Places → SerpAPI(Google Maps) → ダミー
    戻り値: { results: [ {title,url,snippet,image,review:{rating,count,open_now,weekday_text}, position:{lat,lon}} ], provider }
    """
    # 1) Google Places
    if GOOGLE_PLACES_API_KEY:
        params = {
            "key": GOOGLE_PLACES_API_KEY,
            "query": q,
            "language": "ja",
        }
        if lat is not None and lon is not None:
            params.update({"location": f"{lat},{lon}", "radius": 5000})
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                "https://maps.googleapis.com/maps/api/place/textsearch/json", params=params
            )
            r.raise_for_status()
            data = r.json()
            candidates = (data.get("results") or [])[:max_results]

            # place details を並列取得
            async def fetch_detail(place_id: str):
                d_params = {
                    "key": GOOGLE_PLACES_API_KEY,
                    "place_id": place_id,
                    "language": "ja",
                    "fields": ",".join(
                        [
                            "name",
                            "url",
                            "website",
                            "formatted_address",
                            "geometry",
                            "opening_hours",
                            "rating",
                            "user_ratings_total",
                            "photos",
                            "formatted_phone_number",
                        ]
                    ),
                }
                dr = await client.get(
                    "https://maps.googleapis.com/maps/api/place/details/json", params=d_params
                )
                dr.raise_for_status()
                return dr.json().get("result", {})

            details = (
                await httpx.AsyncClient.gather(
                    *[fetch_detail(c.get("place_id")) for c in candidates if c.get("place_id")]
                )
                if candidates
                else []
            )
            # httpx.AsyncClient.gather が無い環境向けフォールバック（逐次）
            if not details and candidates:
                details = []
                for c in candidates:
                    if not c.get("place_id"):
                        continue
                    d_params = {
                        "key": GOOGLE_PLACES_API_KEY,
                        "place_id": c["place_id"],
                        "language": "ja",
                        "fields": ",".join(
                            [
                                "name",
                                "url",
                                "website",
                                "formatted_address",
                                "geometry",
                                "opening_hours",
                                "rating",
                                "user_ratings_total",
                                "photos",
                                "formatted_phone_number",
                            ]
                        ),
                    }
                    dr = await client.get(
                        "https://maps.googleapis.com/maps/api/place/details/json", params=d_params
                    )
                    dr.raise_for_status()
                    details.append(dr.json().get("result", {}))

            items = []
            for d in details:
                name = d.get("name")
                addr = d.get("formatted_address")
                url = d.get("url") or d.get("website")
                photo_ref = (
                    (d.get("photos") or [{}])[0].get("photo_reference") if d.get("photos") else None
                )
                image = (
                    f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference={photo_ref}&key={GOOGLE_PLACES_API_KEY}"
                    if photo_ref
                    else None
                )
                opening = d.get("opening_hours") or {}
                pos = (d.get("geometry") or {}).get("location") or {}
                items.append(
                    {
                        "title": name,
                        "url": url,
                        "snippet": addr,
                        "image": image,
                        "review": {
                            "rating": d.get("rating"),
                            "count": d.get("user_ratings_total"),
                            "open_now": opening.get("open_now"),
                            "weekday_text": opening.get("weekday_text"),
                            "phone": d.get("formatted_phone_number"),
                        },
                        "position": {"lat": pos.get("lat"), "lon": pos.get("lng")},
                    }
                )
            return {"results": items, "provider": "google_places"}

    # 2) SerpAPI (Google Maps)
    if SERPAPI_KEY:
        params = {
            "engine": "google_maps",
            "q": q,
            "type": "search",
            "hl": "ja",
            "api_key": SERPAPI_KEY,
        }
        if lat is not None and lon is not None:
            params["ll"] = f"@{lat},{lon},15z"
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get("https://serpapi.com/search.json", params=params)
            r.raise_for_status()
            data = r.json()
            locals_ = (data.get("local_results") or [])[:max_results]

            async def fetch_place(data_id: str):
                prms = {
                    "engine": "google_maps_place",
                    "data_id": data_id,
                    "hl": "ja",
                    "api_key": SERPAPI_KEY,
                }
                rr = await client.get("https://serpapi.com/search.json", params=prms)
                rr.raise_for_status()
                return rr.json()

            details = []
            for it in locals_:
                data_id = it.get("data_id")
                if not data_id:
                    continue
                try:
                    details.append(await fetch_place(data_id))
                except Exception:
                    details.append(
                        {
                            "place_results": {
                                "title": it.get("title"),
                                "rating": it.get("rating"),
                                "user_ratings_total": it.get("reviews"),
                                "address": it.get("address"),
                            }
                        }
                    )

            items = []
            for d in details:
                pr = d.get("place_results") or {}
                hours = pr.get("opening_hours") or {}
                pos = pr.get("gps_coordinates") or {}
                items.append(
                    {
                        "title": pr.get("title"),
                        "url": pr.get("place_link")
                        or pr.get("website")
                        or pr.get("google_maps_url"),
                        "snippet": pr.get("address"),
                        "image": (
                            pr.get("thumbnail")
                            or (
                                pr.get("thumbnail_link")
                                if isinstance(pr.get("thumbnail_link"), str)
                                else None
                            )
                        ),
                        "review": {
                            "rating": pr.get("rating"),
                            "count": pr.get("user_ratings_total") or pr.get("reviews"),
                            "open_now": (
                                hours.get("open_now") if isinstance(hours, dict) else None
                            ),
                            "weekday_text": (
                                hours.get("weekday_text") if isinstance(hours, dict) else None
                            ),
                            "phone": pr.get("phone"),
                        },
                        "position": {
                            "lat": (pos.get("latitude") if isinstance(pos, dict) else None),
                            "lon": (pos.get("longitude") if isinstance(pos, dict) else None),
                        },
                    }
                )
            return {"results": items, "provider": "serpapi"}

    # 3) フォールバック: ダミー
    items = [
        {
            "title": f"{q} の関連情報（ダミー）",
            "url": "https://example.com",
            "snippet": "実データを取得するには .env に GOOGLE_PLACES_API_KEY または SERPAPI_KEY を設定してください。",
            "image": None,
            "review": {"rating": None, "count": None, "open_now": None, "weekday_text": None},
            "position": {"lat": lat, "lon": lon},
        }
        for _ in range(max_results)
    ]
    return {"results": items, "provider": "dummy"}


# ----------------------
# API
# ----------------------
@app.get("/api/history", response_model=List[Place])
def get_history():
    h = load_history()
    places: List[Place] = []
    for p in h.get("visited", []):
        places.append(Place(name=p["name"], category="visited", lat=p["lat"], lon=p["lon"]))
    for p in h.get("favorites", []):
        places.append(Place(name=p["name"], category="favorite", lat=p["lat"], lon=p["lon"]))
    user_pins = load_pins()
    places.extend(user_pins)
    return places


@app.post("/api/recommendations", response_model=List[Place])
def get_recommendations(_: RecInput):
    return recommend()


@app.get("/api/pins", response_model=List[Place])
def api_get_pins():
    return load_pins()


@app.post("/api/pins", response_model=Place)
def api_add_pin(pin: PinIn):
    pins = load_pins()
    pins.append(Place(**pin.model_dump()))
    save_pins(pins)
    return pin


@app.delete("/api/pins")
def api_delete_pin(name: str, lat: float, lon: float):
    pins = load_pins()
    before = len(pins)
    pins = [
        p
        for p in pins
        if not (p.name == name and abs(p.lat - lat) < 1e-6 and abs(p.lon - lon) < 1e-6)
    ]
    save_pins(pins)
    return {"deleted": before - len(pins)}


@app.post("/api/meta_search")
async def api_meta_search(q: WebQuery):
    return await provider_search(q.q, q.lat, q.lon, q.max_results)


# 起動例: uvicorn backend.app:app --reload --port 8000
