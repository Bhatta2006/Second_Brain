import uuid
from datetime import datetime
from pydantic import BaseModel


class FolderCreate(BaseModel):
    name: str
    parent_id: uuid.UUID | None = None
    emoji: str | None = None
    color: str | None = None


class FolderUpdate(BaseModel):
    name: str | None = None
    emoji: str | None = None
    color: str | None = None
    parent_id: uuid.UUID | None = None


class FolderResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    name: str
    emoji: str | None = None
    color: str | None = None
    is_smart: bool = False
    ai_generated: bool = False
    depth: int = 0
    item_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class FolderTree(FolderResponse):
    children: list["FolderTree"] = []

    model_config = {"from_attributes": True}
