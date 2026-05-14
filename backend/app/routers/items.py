import uuid
import logging
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

log = logging.getLogger(__name__)

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

    # Index to Elasticsearch (initial - will be updated after AI processing)
    try:
        from app.search.es_client import index_item as es_index
        await es_index(
            user_id=str(user_id),
            item_id=str(item.id),
            title=title,
            summary=None,
            raw_text=raw_text,
            tags=manual_tags if manual_tags else None,
            content_type=content_type,
            folder_id=str(payload.hint_folder_id) if payload.hint_folder_id else None,
            entities=None,
            created_at=item.created_at.isoformat(),
            is_starred=False,
        )
    except Exception as exc:
        log.warning("Failed to index item to ES: %s", exc)

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
    from app.cache.redis_client import invalidate_graph_cache

    item = await _get_item_or_404(db, item_id, user_id)

    folder_changed = False
    tags_changed = False

    if payload.title is not None:
        item.title = payload.title
    if payload.folder_id is not None:
        item.folder_id = payload.folder_id
        folder_changed = True
    if payload.tags is not None:
        item.tags = payload.tags
        tags_changed = True
    if payload.is_starred is not None:
        item.is_starred = payload.is_starred

    item.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(item)

    # Sync changes to Neo4j and invalidate cache
    try:
        if folder_changed:
            # Get the new folder name for Neo4j sync
            folder_name = item.folder.name if item.folder else None
            from app.tasks.sync import update_item_folder
            update_item_folder.delay(str(item_id), folder_name or "Uncategorised", str(item.folder_id) if item.folder_id else None)

        if tags_changed:
            # Recompute edges since shared_tag and entity edges depend on tags
            from app.tasks.sync import recompute_edges
            recompute_edges.delay(str(item_id), str(user_id))

        # Invalidate cache on any update (affects graph rendering)
        await invalidate_graph_cache(str(user_id))
    except Exception:
        # Don't block the API response if Celery/Redis is unavailable
        pass

    # Re-index to Elasticsearch (non-blocking)
    try:
        from app.search.es_client import index_item as es_index
        await es_index(
            user_id=str(user_id),
            item_id=str(item_id),
            title=item.title,
            summary=item.summary,
            raw_text=item.raw_text,
            tags=item.tags,
            content_type=item.content_type,
            folder_id=str(item.folder_id) if item.folder_id else None,
            entities=item.entities,
            created_at=item.created_at.isoformat(),
            is_starred=item.is_starred,
        )
    except Exception as exc:
        log.warning("Failed to re-index item to ES: %s", exc)

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

    # Sync soft-delete to Neo4j via Celery (non-blocking)
    try:
        from app.tasks.sync import soft_delete_node
        soft_delete_node.delay(str(item_id), str(user_id))
    except Exception:
        # If Celery isn't available, don't block the delete
        pass

    # Delete from Elasticsearch
    try:
        from app.search.es_client import delete_item as es_delete
        await es_delete(str(user_id), str(item_id))
    except Exception as exc:
        log.warning("Failed to delete item from ES: %s", exc)


@router.post("/{item_id}/link", status_code=status.HTTP_201_CREATED)
async def link_items(
    item_id: uuid.UUID,
    target_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    from app.models.edge import Edge
    from app.config import settings
    from app.graph.neo4j_client import neo4j_client
    from app.cache.redis_client import invalidate_graph_cache

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

    # Sync to Neo4j and invalidate cache
    if settings.use_neo4j_graph:
        await neo4j_client.create_user_link(str(item_id), str(target_id))
    await invalidate_graph_cache(str(user_id))

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
