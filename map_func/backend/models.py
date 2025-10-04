from typing import Optional

from pydantic import BaseModel


class Place(BaseModel):
    name: str
    category: str  # "visited" | "favorite" | "recommended"
    lat: float
    lon: float
    note: Optional[str] = None


class RecInput(BaseModel):
    user_id: str = "default"


class SearchQuery(BaseModel):
    q: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    max_results: int = 10
