"""
Export user knowledge base as JSON or ZIP archive.
GET /export        → JSON (all items + folders)
GET /export/zip    → ZIP with JSON manifest + file attachments
"""
import uuid
import json
import io
import zipfile
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.deps import get_current_user, get_db_session
from app.models.item import Item
from app.models.folder import Folder
from app import storage

router = APIRouter(prefix="/export", tags=["export"])


def _folder_to_dict(f: Folder) -> dict:
    return {
        "id": str(f.id),
        "parent_id": str(f.parent_id) if f.parent_id else None,
        "name": f.name,
        "emoji": f.emoji,
        "color": f.color,
        "is_smart": f.is_smart,
        "depth": f.depth,
        "created_at": f.created_at.isoformat(),
    }


def _item_to_dict(i: Item) -> dict:
    return {
        "id": str(i.id),
        "folder_id": str(i.folder_id) if i.folder_id else None,
        "title": i.title,
        "ai_title": i.ai_title,
        "content_type": i.content_type,
        "source_url": i.source_url,
        "storage_key": i.storage_key,
        "file_size": i.file_size,
        "mime_type": i.mime_type,
        "summary": i.summary,
        "raw_text": i.raw_text,
        "tags": i.tags or [],
        "entities": i.entities,
        "confidence": i.confidence,
        "is_starred": i.is_starred,
        "view_count": i.view_count,
        "created_at": i.created_at.isoformat(),
        "updated_at": i.updated_at.isoformat(),
    }


@router.get("")
async def export_json(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    folders = (
        await db.execute(
            select(Folder).where(Folder.user_id == user_id).order_by(Folder.depth, Folder.name)
        )
    ).scalars().all()

    items = (
        await db.execute(
            select(Item)
            .where(Item.user_id == user_id, Item.deleted_at.is_(None))
            .order_by(Item.created_at.desc())
        )
    ).scalars().all()

    payload = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "user_id": str(user_id),
        "folders": [_folder_to_dict(f) for f in folders],
        "items": [_item_to_dict(i) for i in items],
    }

    return StreamingResponse(
        iter([json.dumps(payload, indent=2)]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=secondbrain_export_{datetime.utcnow().strftime('%Y%m%d')}.json"},
    )


@router.get("/zip")
async def export_zip(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    folders = (
        await db.execute(
            select(Folder).where(Folder.user_id == user_id).order_by(Folder.depth, Folder.name)
        )
    ).scalars().all()

    items = (
        await db.execute(
            select(Item)
            .where(Item.user_id == user_id, Item.deleted_at.is_(None))
            .order_by(Item.created_at.desc())
        )
    ).scalars().all()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        manifest = {
            "exported_at": datetime.utcnow().isoformat() + "Z",
            "user_id": str(user_id),
            "folders": [_folder_to_dict(f) for f in folders],
            "items": [_item_to_dict(i) for i in items],
        }
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))

        for item in items:
            if item.storage_key and storage.file_exists(item.storage_key):
                try:
                    raw = storage.read_file(item.storage_key)
                    ext = item.storage_key.rsplit(".", 1)[-1] if "." in item.storage_key else "bin"
                    safe_title = (item.title or item.ai_title or str(item.id))[:50].replace("/", "_")
                    zf.writestr(f"files/{item.id}_{safe_title}.{ext}", raw)
                except Exception:
                    pass

    buf.seek(0)
    date_str = datetime.utcnow().strftime("%Y%m%d")
    return StreamingResponse(
        iter([buf.read()]),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=secondbrain_export_{date_str}.zip"},
    )
