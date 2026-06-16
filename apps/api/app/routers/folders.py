import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

from app.deps import get_current_user, get_db_session
from app.models.folder import Folder
from app.models.item import Item
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

    # Live item counts — one grouped query rather than a stale stored column.
    counts_q = (
        select(Item.folder_id, func.count(Item.id))
        .where(Item.user_id == user_id, Item.deleted_at.is_(None), Item.folder_id.is_not(None))
        .group_by(Item.folder_id)
    )
    counts = dict((await db.execute(counts_q)).all())

    return _build_tree(all_folders, counts)


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

    smart_filter_json = None
    if payload.is_smart and payload.smart_filter:
        # mode="json" serializes datetime -> ISO string so it's JSONB-safe.
        smart_filter_json = payload.smart_filter.model_dump(mode="json", exclude_none=True)

    folder = Folder(
        user_id=user_id,
        parent_id=payload.parent_id,
        name=payload.name,
        emoji=payload.emoji,
        color=payload.color,
        depth=depth,
        is_smart=payload.is_smart,
        smart_filter=smart_filter_json,
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

    # parent_id present in the payload means a move. We accept null (move to root).
    if "parent_id" in payload.model_fields_set:
        new_parent_id = payload.parent_id
        if new_parent_id == folder_id:
            raise HTTPException(status_code=400, detail="A folder cannot be its own parent")

        all_folders = (
            await db.execute(select(Folder).where(Folder.user_id == user_id))
        ).scalars().all()
        by_id = {f.id: f for f in all_folders}

        if new_parent_id is not None:
            if new_parent_id not in by_id:
                raise HTTPException(status_code=404, detail="Target folder not found")
            # Reject moving a folder into one of its own descendants (cycle).
            if _is_descendant(new_parent_id, folder_id, by_id):
                raise HTTPException(
                    status_code=400, detail="Cannot move a folder into its own subtree"
                )
            new_depth = by_id[new_parent_id].depth + 1
        else:
            new_depth = 0

        # Depth check including the moved subtree.
        subtree_height = _subtree_height(folder_id, by_id)
        if new_depth + subtree_height > 2:
            raise HTTPException(
                status_code=400, detail="Move would exceed the 3-level folder depth limit"
            )

        folder.parent_id = new_parent_id
        folder.depth = new_depth
        _recompute_descendant_depths(folder_id, new_depth, by_id)

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
    # Child folders cascade via FK (parent_id ON DELETE SET NULL -> they become roots),
    # and items' folder_id is set NULL by the FK, so they fall back to "All items".
    await db.delete(folder)
    await db.commit()


@router.get("/{folder_id}/items")
async def get_folder_items(
    folder_id: uuid.UUID,
    page: int = 1,
    page_size: int = 20,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List items in a folder. For smart folders, dynamically applies the saved filter."""
    from app.schemas.item import ItemResponse, ItemListResponse
    from sqlalchemy.orm import selectinload

    folder = await _get_folder_or_404(db, folder_id, user_id)

    if folder.is_smart and folder.smart_filter:
        sf = folder.smart_filter
        filters = [Item.user_id == user_id, Item.deleted_at.is_(None)]

        if sf.get("content_type"):
            filters.append(Item.content_type == sf["content_type"])
        if sf.get("tags"):
            filters.append(Item.tags.overlap(sf["tags"]))
        if sf.get("is_starred") is not None:
            filters.append(Item.is_starred == sf["is_starred"])
        if sf.get("date_from"):
            filters.append(Item.created_at >= _parse_iso(sf["date_from"]))
        if sf.get("date_to"):
            filters.append(Item.created_at <= _parse_iso(sf["date_to"]))
    else:
        filters = [
            Item.user_id == user_id,
            Item.folder_id == folder_id,
            Item.deleted_at.is_(None),
        ]

    total = (await db.execute(select(func.count()).select_from(Item).where(and_(*filters)))).scalar_one()
    rows = (
        await db.execute(
            select(Item)
            .options(selectinload(Item.folder))
            .where(and_(*filters))
            .order_by(Item.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    return ItemListResponse(
        total=total,
        page=page,
        page_size=page_size,
        results=[ItemResponse.model_validate(i) for i in rows],
    )


# ─── helpers ──────────────────────────────────────────────────────────────────

def _parse_iso(value):
    """Parse an ISO timestamp from a smart_filter; tolerate a trailing 'Z'
    (Python <3.11 fromisoformat rejects it) and already-parsed datetimes."""
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


async def _get_folder_or_404(db: AsyncSession, folder_id: uuid.UUID, user_id: uuid.UUID) -> Folder:
    q = select(Folder).where(Folder.id == folder_id, Folder.user_id == user_id)
    folder = (await db.execute(q)).scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


def _is_descendant(
    candidate_id: uuid.UUID, ancestor_id: uuid.UUID, by_id: dict[uuid.UUID, Folder]
) -> bool:
    """True if candidate_id is ancestor_id itself or sits anywhere below it."""
    node = by_id.get(candidate_id)
    while node is not None:
        if node.id == ancestor_id:
            return True
        node = by_id.get(node.parent_id) if node.parent_id else None
    return False


def _subtree_height(folder_id: uuid.UUID, by_id: dict[uuid.UUID, Folder]) -> int:
    """Number of levels below a folder (0 = no children)."""
    children = [f for f in by_id.values() if f.parent_id == folder_id]
    if not children:
        return 0
    return 1 + max(_subtree_height(c.id, by_id) for c in children)


def _recompute_descendant_depths(
    folder_id: uuid.UUID, folder_depth: int, by_id: dict[uuid.UUID, Folder]
) -> None:
    for child in (f for f in by_id.values() if f.parent_id == folder_id):
        child.depth = folder_depth + 1
        _recompute_descendant_depths(child.id, child.depth, by_id)


def _build_tree(
    folders: list[Folder], counts: dict[uuid.UUID, int]
) -> list[FolderTree]:
    folder_map: dict[uuid.UUID, FolderTree] = {}
    roots: list[FolderTree] = []

    # Build each node from explicit scalar columns — model_validate(f) would try
    # to read the `children` ORM relationship and trigger a lazy load, which is
    # illegal in the async session once the request has moved past it.
    for f in folders:
        node = FolderTree(
            id=f.id,
            user_id=f.user_id,
            parent_id=f.parent_id,
            name=f.name,
            emoji=f.emoji,
            color=f.color,
            is_smart=f.is_smart,
            ai_generated=f.ai_generated,
            depth=f.depth,
            item_count=counts.get(f.id, 0),
            created_at=f.created_at,
            children=[],
        )
        folder_map[f.id] = node

    for f in folders:
        node = folder_map[f.id]
        if f.parent_id and f.parent_id in folder_map:
            folder_map[f.parent_id].children.append(node)
        else:
            roots.append(node)

    return roots
