import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, Query, Body
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func
from sqlalchemy.orm import selectinload

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
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    is_starred: bool | None = Query(None),
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
                Item.ai_title.ilike(f"%{q}%"),
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
    if date_from:
        filters.append(Item.created_at >= date_from)
    if date_to:
        filters.append(Item.created_at <= date_to)
    if is_starred is not None:
        filters.append(Item.is_starred == is_starred)

    total = (
        await db.execute(
            select(func.count()).select_from(Item).where(and_(*filters))
        )
    ).scalar_one()

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

    results = [
        SearchResult(
            id=item.id,
            title=item.title or item.ai_title,
            summary=item.summary,
            content_type=item.content_type,
            folder={"id": str(item.folder_id), "name": item.folder.name} if item.folder else None,
            tags=item.tags or [],
            score=1.0,
            created_at=item.created_at,
        )
        for item in rows
    ]

    return SearchResponse(total=total, page=page, results=results)


class SemanticSearchRequest(BaseModel):
    query: str
    content_type: str | None = None
    folder_id: uuid.UUID | None = None
    tags: list[str] = []
    limit: int = 20
    min_similarity: float = 0.3


@router.post("/semantic", response_model=SearchResponse)
async def semantic_search(
    payload: SemanticSearchRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Vector similarity search using pgvector cosine distance."""
    from app.ai.embeddings import embed_text

    query_embedding = await embed_text(payload.query)
    if query_embedding is None:
        return SearchResponse(total=0, page=1, results=[])

    filters = [
        Item.user_id == user_id,
        Item.deleted_at.is_(None),
        Item.embedding.is_not(None),
    ]
    if payload.content_type:
        filters.append(Item.content_type == payload.content_type)
    if payload.folder_id:
        filters.append(Item.folder_id == payload.folder_id)
    if payload.tags:
        filters.append(Item.tags.overlap(payload.tags))

    rows = (
        await db.execute(
            select(
                Item,
                (1 - Item.embedding.cosine_distance(query_embedding)).label("similarity"),
            )
            .options(selectinload(Item.folder))
            .where(and_(*filters))
            .order_by(Item.embedding.cosine_distance(query_embedding))
            .limit(payload.limit)
        )
    ).all()

    results = [
        SearchResult(
            id=item.id,
            title=item.title or item.ai_title,
            summary=item.summary,
            content_type=item.content_type,
            folder={"id": str(item.folder_id), "name": item.folder.name} if item.folder else None,
            tags=item.tags or [],
            score=round(float(similarity), 4),
            created_at=item.created_at,
        )
        for item, similarity in rows
        if float(similarity) >= payload.min_similarity
    ]

    return SearchResponse(total=len(results), page=1, results=results)
