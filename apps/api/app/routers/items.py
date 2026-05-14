import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload

from app.deps import get_current_user, get_db_session
from app.models.item import Item
from app.models.folder import Folder
from app.schemas.item import (
    IngestRequest, IngestResponse, ItemUpdate, ItemResponse, ItemListResponse
)

router = APIRouter(prefix="/items", tags=["items"])


@router.post("/ingest", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_item(
    payload: IngestRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    content_type = _detect_content_type(payload)
    meta = payload.metadata or {}
    title = meta.get("custom_name") or meta.get("filename") or None
    
    # Store file size if available
    file_size = meta.get("size")
    mime_type = meta.get("mime_type")
    
    # Pick up manual tags from metadata if provided
    manual_tags = meta.get("tags") or []
    
    # Only store raw_text for actual text content, not base64-encoded files
    raw_text = None
    if payload.type == "text":
        raw_text = payload.text
    
    item = Item(
        user_id=user_id,
        folder_id=payload.hint_folder_id,
        title=title,
        content_type=content_type,
        source_url=payload.url,
        storage_key=payload.file_key,
        file_size=file_size,
        mime_type=mime_type,
        raw_text=raw_text,
        metadata_=meta,
        tags=manual_tags if manual_tags else None,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    # Fire async AI processing (non-blocking)
    try:
        from app.tasks.ai_processing import process_item
        process_item.delay(str(item.id), str(user_id))
    except Exception:
        # If Celery/Redis isn't running, don't block the save
        pass

    return IngestResponse(item_id=item.id)


@router.get("", response_model=ItemListResponse)
async def list_items(
    folder_id: uuid.UUID | None = Query(None),
    content_type: str | None = Query(None),
    is_starred: bool | None = Query(None),
    needs_review: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    filters = [Item.user_id == user_id, Item.deleted_at.is_(None)]
    if folder_id is not None:
        filters.append(Item.folder_id == folder_id)
    if content_type is not None:
        filters.append(Item.content_type == content_type)
    if is_starred is not None:
        filters.append(Item.is_starred == is_starred)
    if needs_review is not None:
        filters.append(Item.needs_review == needs_review)

    count_q = select(func.count()).select_from(Item).where(and_(*filters))
    total = (await db.execute(count_q)).scalar_one()

    q = (
        select(Item)
        .options(selectinload(Item.folder))
        .where(and_(*filters))
        .order_by(Item.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = (await db.execute(q)).scalars().all()

    return ItemListResponse(
        total=total,
        page=page,
        page_size=page_size,
        results=[ItemResponse.model_validate(i) for i in items],
    )


@router.get("/{item_id}", response_model=ItemResponse)
async def get_item(
    item_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    item = await _get_item_or_404(db, item_id, user_id)
    item.view_count += 1
    await db.commit()
    await db.refresh(item)
    return ItemResponse.model_validate(item)


@router.patch("/{item_id}", response_model=ItemResponse)
async def update_item(
    item_id: uuid.UUID,
    payload: ItemUpdate,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    item = await _get_item_or_404(db, item_id, user_id)

    if payload.title is not None:
        item.title = payload.title
    if payload.folder_id is not None:
        item.folder_id = payload.folder_id
    if payload.tags is not None:
        item.tags = payload.tags
    if payload.is_starred is not None:
        item.is_starred = payload.is_starred

    item.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(item)
    return ItemResponse.model_validate(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    item = await _get_item_or_404(db, item_id, user_id)
    item.deleted_at = datetime.utcnow()
    await db.commit()


@router.post("/{item_id}/link", status_code=status.HTTP_201_CREATED)
async def link_items(
    item_id: uuid.UUID,
    target_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    from app.models.edge import Edge
    await _get_item_or_404(db, item_id, user_id)
    await _get_item_or_404(db, target_id, user_id)

    edge = Edge(
        user_id=user_id,
        source_id=item_id,
        target_id=target_id,
        edge_type="user_link",
        weight=1.0,
    )
    db.add(edge)
    await db.commit()
    return {"status": "linked"}


# ─── helpers ──────────────────────────────────────────────────────────────────

async def _get_item_or_404(db: AsyncSession, item_id: uuid.UUID, user_id: uuid.UUID) -> Item:
    q = (
        select(Item)
        .options(selectinload(Item.folder))
        .where(Item.id == item_id, Item.user_id == user_id, Item.deleted_at.is_(None))
    )
    item = (await db.execute(q)).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


def _detect_content_type(payload: IngestRequest) -> str:
    if payload.type == "text":
        return "text"
    if payload.type == "url":
        return "url"
    if payload.file_key:
        return _detect_content_type_from_filename(payload.file_key)
    return "text"


def _detect_content_type_from_filename(filename: str) -> str:
    """Detect content type from file extension."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    type_map = {
        "pdf": "pdf", "docx": "doc", "xlsx": "doc", "pptx": "doc",
        "jpg": "image", "jpeg": "image", "png": "image", "webp": "image", "heic": "image", "gif": "image",
        "mp3": "audio", "mp4": "video", "wav": "audio", "m4a": "audio",
        "txt": "text", "md": "text", "csv": "text",
    }
    return type_map.get(ext, "file")
