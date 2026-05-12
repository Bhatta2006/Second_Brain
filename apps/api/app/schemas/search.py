import uuid
from datetime import datetime
from pydantic import BaseModel


class SearchResult(BaseModel):
    id: uuid.UUID
    title: str | None = None
    summary: str | None = None
    content_type: str
    folder: dict | None = None
    tags: list[str] = []
    score: float
    created_at: datetime


class SearchResponse(BaseModel):
    total: int
    page: int
    results: list[SearchResult]
