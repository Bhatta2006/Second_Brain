import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func
from sqlalchemy.dialects.postgresql import array

from app.deps import get_current_user, get_db_session
from app.models.item import Item
from app.schemas.search import SearchResponse, SearchResult

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResponse)
async def search_items(
    q: str = Query(""),
    content_type: str | None = Query(None),
    folder_id: uuid.UUID | None = Query(None),
    tags: list[str] = Query([]),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    filters = [Item.user_id == user_id, Item.deleted_at.is_(None)]

    if q:
        filters.append(
            or_(
                Item.title.ilike(f"%{q}%"),
                Item.summary.ilike(f"%{q}%"),
                Item.raw_text.ilike(f"%{q}%"),
            )
        )
    if content_type:
        filters.append(Item.content_type == content_type)
    if folder_id:
        filters.append(Item.folder_id == folder_id)
    if tags:
        filters.append(Item.tags.overlap(tags))

    total = (
        await db.execute(
            select(func.count()).select_from(Item).where(and_(*filters))
        )
    ).scalar_one()

    rows = (
        await db.execute(
            select(Item)
            .where(and_(*filters))
            .order_by(Item.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    results = [
        SearchResult(
            id=item.id,
            title=item.title or item.ai_title,
            summary=item.summary,
            content_type=item.content_type,
            folder={"id": str(item.folder_id)} if item.folder_id else None,
            tags=item.tags or [],
            score=1.0,
            created_at=item.created_at,
        )
        for item in rows
    ]

    return SearchResponse(total=total, page=page, results=results)
