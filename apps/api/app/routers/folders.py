import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.deps import get_current_user, get_db_session
from app.models.folder import Folder
from app.schemas.folder import FolderCreate, FolderUpdate, FolderResponse, FolderTree

router = APIRouter(prefix="/folders", tags=["folders"])


@router.get("", response_model=list[FolderTree])
async def get_folder_tree(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    q = (
        select(Folder)
        .where(Folder.user_id == user_id)
        .order_by(Folder.depth, Folder.name)
    )
    all_folders = (await db.execute(q)).scalars().all()
    return _build_tree(all_folders)


@router.post("", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    payload: FolderCreate,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    depth = 0
    if payload.parent_id:
        parent = await _get_folder_or_404(db, payload.parent_id, user_id)
        depth = parent.depth + 1
        if depth > 2:
            raise HTTPException(
                status_code=400, detail="Maximum folder depth is 3 levels"
            )

    folder = Folder(
        user_id=user_id,
        parent_id=payload.parent_id,
        name=payload.name,
        emoji=payload.emoji,
        color=payload.color,
        depth=depth,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return FolderResponse.model_validate(folder)


@router.patch("/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: uuid.UUID,
    payload: FolderUpdate,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    folder = await _get_folder_or_404(db, folder_id, user_id)

    if payload.name is not None:
        folder.name = payload.name
    if payload.emoji is not None:
        folder.emoji = payload.emoji
    if payload.color is not None:
        folder.color = payload.color
    if payload.parent_id is not None:
        parent = await _get_folder_or_404(db, payload.parent_id, user_id)
        folder.parent_id = payload.parent_id
        folder.depth = parent.depth + 1

    folder.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(folder)
    return FolderResponse.model_validate(folder)


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    folder = await _get_folder_or_404(db, folder_id, user_id)
    await db.delete(folder)
    await db.commit()


# ─── helpers ──────────────────────────────────────────────────────────────────

async def _get_folder_or_404(db: AsyncSession, folder_id: uuid.UUID, user_id: uuid.UUID) -> Folder:
    q = select(Folder).where(Folder.id == folder_id, Folder.user_id == user_id)
    folder = (await db.execute(q)).scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


def _build_tree(folders: list[Folder]) -> list[FolderTree]:
    folder_map: dict[uuid.UUID, FolderTree] = {}
    roots: list[FolderTree] = []

    for f in folders:
        # Validate base attributes first so Pydantic doesn't try to lazy-load 'children'
        base = FolderResponse.model_validate(f)
        node = FolderTree(**base.model_dump(), children=[])
        folder_map[f.id] = node

    for f in folders:
        node = folder_map[f.id]
        if f.parent_id and f.parent_id in folder_map:
            folder_map[f.parent_id].children.append(node)
        else:
            roots.append(node)

    return roots
