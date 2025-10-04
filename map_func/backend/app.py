from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .models import Place, RecInput
from .recommender import load_history, recommend

load_dotenv()


app = FastAPI(title="ALS Travel App API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/history", response_model=List[Place])
def get_history():
    h = load_history()
    places: List[Place] = []
    for p in h.get("visited", []):
        places.append(Place(name=p["name"], category="visited", lat=p["lat"], lon=p["lon"]))
    for p in h.get("favorites", []):
        places.append(Place(name=p["name"], category="favorite", lat=p["lat"], lon=p["lon"]))
    return places


@app.post("/api/recommendations", response_model=List[Place])
def get_recommendations(_: RecInput):
    return recommend()


# 起動例: uvicorn backend.app:app --reload --port 8000
