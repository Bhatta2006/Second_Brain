import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from fastapi.responses import RedirectResponse, Response as PlainResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, update as sa_update
from sqlalchemy.orm import selectinload

from app.config import settings
from app.deps import get_current_user, get_db_session
from app.models.item import Item
from app.models.folder import Folder
from app.models.user import User
from app.graph.neo4j_client import neo4j_client
from app.cache.redis_client import invalidate_graph_cache
from app import storage
from app.schemas.item import (
    IngestRequest, IngestResponse, ItemUpdate, ItemResponse, ItemListResponse
)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB cap for the local-volume store

router = APIRouter(prefix="/items", tags=["items"])


@router.post("/ingest", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_item(
    payload: IngestRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    content_type = _detect_content_type(payload)
    meta = payload.metadata or {}
    user_title = (meta.get("title") or "").strip() or meta.get("filename") or None
    user_tags: list[str] = meta.get("tags") or []
    user_set_tags = bool(user_tags)

    item = Item(
        user_id=user_id,
        folder_id=payload.hint_folder_id,
        title=user_title,
        content_type=content_type,
        source_url=payload.url,
        storage_key=payload.file_key,
        raw_text=payload.text if payload.type == "text" else None,
        tags=user_tags,
        metadata_={**meta, "user_set_tags": user_set_tags},
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    from app.tasks.ai_processing import process_item
    process_item.delay(str(item.id), str(user_id))

    return IngestResponse(item_id=item.id)


@router.post("/upload", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_file(
    file: UploadFile = File(...),
    folder_id: uuid.UUID | None = Form(None),
    title_override: str | None = Form(None),
    tags_override: str | None = Form(None),   # JSON-encoded list[str]
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Binary file upload. Stores the file in the local volume, records the
    storage_key on the Item, then fires the AI pipeline (which extracts text
    from PDFs / reads text files for classification)."""
    import json as _json

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 25 MB limit")
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    if folder_id is not None:
        await _get_folder_or_404(db, folder_id, user_id)

    filename = file.filename or "upload"
    content_type = _content_type_from_filename(filename)

    user_tags: list[str] = []
    if tags_override:
        try:
            user_tags = _json.loads(tags_override)
        except Exception:
            pass

    effective_title = (title_override or "").strip() or filename

    item = Item(
        user_id=user_id,
        folder_id=folder_id,
        title=effective_title,
        content_type=content_type,
        file_size=len(content),
        mime_type=file.content_type,
        tags=user_tags,
        metadata_={
            "filename": filename,
            "user_set_title": bool((title_override or "").strip()),
            "user_set_tags": bool(user_tags),
        },
    )
    db.add(item)
    await db.flush()  # assign item.id before we name the file

    storage_key = storage.build_storage_key(str(user_id), str(item.id), filename)
    storage.save_file(storage_key, content)
    item.storage_key = storage_key

    # Track storage usage for the user
    await db.execute(
        sa_update(User)
        .where(User.id == user_id)
        .values(storage_used=User.storage_used + len(content))
    )

    await db.commit()
    await db.refresh(item)

    from app.tasks.ai_processing import process_item
    process_item.delay(str(item.id), str(user_id))

    return IngestResponse(item_id=item.id)


@router.get("/{item_id}/file")
async def get_item_file(
    item_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Stream the stored binary for an item, or serve raw_text for text/url items."""
    from fastapi.responses import Response as PlainResponse

    item = await _get_item_or_404(db, item_id, user_id)

    if item.storage_key and storage.file_exists(item.storage_key):
        # Redirect to a short-lived pre-signed URL so the file streams directly
        # from the storage provider — the API server is not in the data path.
        url = storage.get_presigned_url(item.storage_key)
        return RedirectResponse(url, status_code=307)

    # For text/url items with no stored binary, serve the extracted raw_text
    if item.raw_text:
        return PlainResponse(
            content=item.raw_text.encode("utf-8"),
            media_type="text/plain; charset=utf-8",
        )

    raise HTTPException(status_code=404, detail="No file stored for this item")


@router.get("", response_model=ItemListResponse)
async def list_items(
    folder_id: uuid.UUID | None = Query(None),
    content_type: str | None = Query(None),
    is_starred: bool | None = Query(None),
    needs_review: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
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

    folder_changed = False
    if payload.title is not None:
        item.title = payload.title
    # folder_id present in the payload = a move (null is valid -> "uncategorised").
    if "folder_id" in payload.model_fields_set:
        if payload.folder_id is not None:
            await _get_folder_or_404(db, payload.folder_id, user_id)
        item.folder_id = payload.folder_id
        folder_changed = True
    if payload.tags is not None:
        item.tags = payload.tags
    if payload.is_starred is not None:
        item.is_starred = payload.is_starred

    item.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(item)

    # Keep the Neo4j node's folder metadata in sync (cosmetic — used by cluster mode).
    if folder_changed:
        folder_name = None
        if item.folder_id:
            folder = await db.get(Folder, item.folder_id)
            folder_name = folder.name if folder else None
        from app.tasks.sync import update_item_folder
        update_item_folder.delay(
            str(item.id), folder_name or "", str(item.folder_id) if item.folder_id else None
        )

    return ItemResponse.model_validate(item)


@router.post("/{item_id}/copy", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
async def copy_item(
    item_id: uuid.UUID,
    folder_id: uuid.UUID | None = Query(None, description="Destination folder; null = uncategorised"),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Duplicate an item (with all AI metadata) into a folder. The copy is a new
    graph node and re-uses the original's embedding, so edge generation runs
    without another AI call."""
    original = await _get_item_or_404(db, item_id, user_id)
    if folder_id is not None:
        await _get_folder_or_404(db, folder_id, user_id)

    copy = Item(
        user_id=user_id,
        folder_id=folder_id,
        title=original.title,
        content_type=original.content_type,
        source_url=original.source_url,
        storage_key=original.storage_key,
        file_size=original.file_size,
        mime_type=original.mime_type,
        raw_text=original.raw_text,
        summary=original.summary,
        ai_title=original.ai_title,
        tags=original.tags,
        entities=original.entities,
        embedding=original.embedding,
        confidence=original.confidence,
        needs_review=original.needs_review,
        metadata_=original.metadata_ or {},
        indexed_at=datetime.utcnow() if original.embedding is not None else None,
    )
    db.add(copy)
    await db.commit()
    await db.refresh(copy)

    # Re-use the original's embedding/tags/entities — sync straight to Neo4j,
    # skipping the AI pipeline. If the original was never processed, run the full one.
    if original.embedding is not None:
        from app.tasks.sync import sync_item_to_neo4j
        sync_item_to_neo4j.delay(str(copy.id), str(user_id))
    else:
        from app.tasks.ai_processing import process_item
        process_item.delay(str(copy.id), str(user_id))

    return ItemResponse.model_validate(copy)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    item = await _get_item_or_404(db, item_id, user_id)
    file_size = item.file_size or 0
    item.deleted_at = datetime.utcnow()
    # Reclaim storage for this user
    if file_size > 0:
        await db.execute(
            sa_update(User)
            .where(User.id == user_id)
            .values(storage_used=func.greatest(0, User.storage_used - file_size))
        )
    await db.commit()


@router.post("/{item_id}/link", status_code=status.HTTP_201_CREATED)
async def link_items(
    item_id: uuid.UUID,
    target_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a manual USER_LINK edge. Writes to both Postgres and Neo4j so the
    link shows up in the graph alongside the auto-generated relationships."""
    from app.models.edge import Edge
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    if item_id == target_id:
        raise HTTPException(status_code=400, detail="Cannot link an item to itself")

    await _get_item_or_404(db, item_id, user_id)
    await _get_item_or_404(db, target_id, user_id)

    # Idempotent — re-linking the same pair is a no-op (unique constraint on
    # source_id/target_id/edge_type).
    stmt = (
        pg_insert(Edge)
        .values(
            user_id=user_id,
            source_id=item_id,
            target_id=target_id,
            edge_type="user_link",
            weight=1.0,
        )
        .on_conflict_do_nothing(constraint="uq_edge")
    )
    await db.execute(stmt)
    await db.commit()

    if settings.use_neo4j_graph:
        await neo4j_client.create_user_link(str(item_id), str(target_id))
        await invalidate_graph_cache(str(user_id))

    return {"status": "linked"}


@router.delete("/{item_id}/link/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_items(
    item_id: uuid.UUID,
    target_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Remove a manual USER_LINK edge from both Postgres and Neo4j."""
    from sqlalchemy import delete as sa_delete
    from app.models.edge import Edge

    await db.execute(
        sa_delete(Edge).where(
            Edge.user_id == user_id,
            Edge.edge_type == "user_link",
            (
                ((Edge.source_id == item_id) & (Edge.target_id == target_id))
                | ((Edge.source_id == target_id) & (Edge.target_id == item_id))
            ),
        )
    )
    await db.commit()

    if settings.use_neo4j_graph:
        await neo4j_client.delete_user_link(str(item_id), str(target_id))
        await neo4j_client.delete_user_link(str(target_id), str(item_id))
        await invalidate_graph_cache(str(user_id))


@router.get("/{item_id}/similar", response_model=ItemListResponse)
async def get_similar_items(
    item_id: uuid.UUID,
    limit: int = Query(10, ge=1, le=50),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Return items most semantically similar to this one via pgvector cosine distance."""
    item = await _get_item_or_404(db, item_id, user_id)
    if item.embedding is None:
        return ItemListResponse(total=0, page=1, page_size=limit, results=[])

    q = (
        select(Item)
        .options(selectinload(Item.folder))
        .where(
            Item.user_id == user_id,
            Item.deleted_at.is_(None),
            Item.id != item_id,
            Item.embedding.is_not(None),
        )
        .order_by(Item.embedding.cosine_distance(item.embedding))
        .limit(limit)
    )
    items = (await db.execute(q)).scalars().all()
    return ItemListResponse(
        total=len(items),
        page=1,
        page_size=limit,
        results=[ItemResponse.model_validate(i) for i in items],
    )


@router.get("/{item_id}/backlinks", response_model=ItemListResponse)
async def get_item_backlinks(
    item_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Return items that have edges pointing to this item."""
    await _get_item_or_404(db, item_id, user_id)

    from app.models.edge import Edge

    edge_rows = (
        await db.execute(
            select(Edge).where(
                Edge.user_id == user_id,
                Edge.target_id == item_id,
            )
        )
    ).scalars().all()

    source_ids = {e.source_id for e in edge_rows}
    if not source_ids:
        return ItemListResponse(total=0, page=1, page_size=50, results=[])

    items = (
        await db.execute(
            select(Item)
            .options(selectinload(Item.folder))
            .where(
                Item.id.in_(source_ids),
                Item.user_id == user_id,
                Item.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    return ItemListResponse(
        total=len(items),
        page=1,
        page_size=50,
        results=[ItemResponse.model_validate(i) for i in items],
    )


@router.get("/{item_id}/links", response_model=list[ItemResponse])
async def get_item_links(
    item_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List the items manually linked to this one (either direction)."""
    from app.models.edge import Edge

    await _get_item_or_404(db, item_id, user_id)

    edge_rows = (
        await db.execute(
            select(Edge).where(
                Edge.user_id == user_id,
                Edge.edge_type == "user_link",
                (Edge.source_id == item_id) | (Edge.target_id == item_id),
            )
        )
    ).scalars().all()

    linked_ids = {
        e.target_id if e.source_id == item_id else e.source_id for e in edge_rows
    }
    if not linked_ids:
        return []

    linked = (
        await db.execute(
            select(Item)
            .options(selectinload(Item.folder))
            .where(
                Item.id.in_(linked_ids),
                Item.user_id == user_id,
                Item.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    return [ItemResponse.model_validate(i) for i in linked]


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


async def _get_folder_or_404(db: AsyncSession, folder_id: uuid.UUID, user_id: uuid.UUID) -> Folder:
    q = select(Folder).where(Folder.id == folder_id, Folder.user_id == user_id)
    folder = (await db.execute(q)).scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


_EXT_TYPE_MAP = {
    "pdf": "pdf", "docx": "doc", "xlsx": "doc", "pptx": "doc",
    "jpg": "image", "jpeg": "image", "png": "image", "webp": "image",
    "gif": "image", "svg": "image", "heic": "image",
    "mp3": "audio", "wav": "audio", "m4a": "audio",
    "mp4": "video", "mov": "video", "webm": "video",
    "txt": "text", "md": "text", "csv": "text", "json": "text",
}


def _content_type_from_filename(filename: str) -> str:
    """Map a filename's extension to one of our content_type buckets."""
    if "." not in filename:
        return "text"
    ext = filename.rsplit(".", 1)[-1].lower()
    return _EXT_TYPE_MAP.get(ext, "doc")


def _detect_content_type(payload: IngestRequest) -> str:
    if payload.type == "text":
        return "text"
    if payload.type == "url":
        return "url"
    if payload.file_key:
        ext = payload.file_key.rsplit(".", 1)[-1].lower()
        type_map = {
            "pdf": "pdf", "docx": "doc", "xlsx": "doc", "pptx": "doc",
            "jpg": "image", "jpeg": "image", "png": "image", "webp": "image", "heic": "image",
            "mp3": "audio", "mp4": "video", "wav": "audio",
            "txt": "text", "md": "text",
        }
        return type_map.get(ext, "text")
    return "text"
