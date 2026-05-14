import uuid
from datetime import datetime
from pydantic import BaseModel, field_validator
from typing import Literal


CONTENT_TYPES = Literal["image", "pdf", "url", "text", "audio", "doc", "video"]


class IngestRequest(BaseModel):
    type: Literal["file", "url", "text"]
    url: str | None = None
    text: str | None = None
    file_key: str | None = None
    hint_folder_id: uuid.UUID | None = None
    metadata: dict = {}

    @field_validator("url")
    @classmethod
    def url_required_for_url_type(cls, v, info):
        if info.data.get("type") == "url" and not v:
            raise ValueError("url is required when type=url")
        return v


class IngestResponse(BaseModel):
    item_id: uuid.UUID
    status: str = "processing"
    estimated_seconds: int = 4


class ItemCreate(BaseModel):
    title: str | None = None
    content_type: str
    source_url: str | None = None
    storage_key: str | None = None
    folder_id: uuid.UUID | None = None
    tags: list[str] = []
    metadata: dict = {}


class ItemUpdate(BaseModel):
    title: str | None = None
    folder_id: uuid.UUID | None = None
    tags: list[str] | None = None
    is_starred: bool | None = None


class FolderBrief(BaseModel):
    id: uuid.UUID
    name: str
    emoji: str | None = None
    color: str | None = None

    model_config = {"from_attributes": True}


class ItemResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    folder_id: uuid.UUID | None = None
    folder: FolderBrief | None = None
    title: str | None = None
    content_type: str
    source_url: str | None = None
    storage_key: str | None = None
    file_size: int | None = None
    mime_type: str | None = None
    summary: str | None = None
    ai_title: str | None = None
    tags: list[str] = []
    entities: dict | None = None

    @field_validator("tags", mode="before")
    @classmethod
    def coerce_tags(cls, v):
        return v if v is not None else []
    confidence: float | None = None
    needs_review: bool = False
    is_starred: bool = False
    view_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ItemListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[ItemResponse]
