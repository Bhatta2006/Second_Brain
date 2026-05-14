"""
Search API with hybrid search (Elasticsearch + pgvector).

Endpoints:
- GET /search : Hybrid search (BM25 + Semantic with RRF fusion)
- POST /search/semantic : Pure semantic search using pgvector
- GET /search/suggestions : Query autocomplete from user's tags/titles
"""
import uuid
import logging
from typing import Literal
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.deps import get_current_user, get_db_session
from app.models.item import Item
from app.models.folder import Folder
from app.schemas.search import SearchResponse, SearchResult
from app.search.es_client import search_items as es_search
from app.search.semantic import semantic_search, hybrid_search_rrf

log = logging.getLogger(__name__)
router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResponse)
async def search_items(
    q: str = Query("", description="Search query"),
    mode: Literal["keyword", "semantic", "hybrid"] = Query(
        "hybrid",
        description="Search mode: keyword (ES BM25), semantic (pgvector), hybrid (RRF fusion)"
    ),
    content_type: str | None = Query(None, description="Filter by content type"),
    folder_id: uuid.UUID | None = Query(None, description="Filter by folder"),
    tags: list[str] = Query([], description="Filter by tags (any match)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Hybrid search combining Elasticsearch (BM25) + pgvector (semantic) with RRF.

    Modes:
    - keyword: Full-text search with BM25 scoring (fast, exact matches)
    - semantic: Vector similarity using pgvector (finds related concepts)
    - hybrid: Reciprocal Rank Fusion of both (default, best results)
    """
    uid = str(user_id)

    if not q.strip():
        # Empty query - return recent items
        return await _list_recent(db, user_id, page, page_size)

    try:
        if mode == "keyword":
            # Elasticsearch BM25 only
            es_response = await es_search(
                user_id=uid,
                query=q,
                content_type=content_type,
                folder_id=str(folder_id) if folder_id else None,
                tags=tags if tags else None,
                page=page,
                page_size=page_size,
            )
            results = await _enrich_es_results(db, es_response["results"])
            return SearchResponse(
                total=es_response["total"],
                page=page,
                results=results,
            )

        elif mode == "semantic":
            # pgvector semantic only
            semantic_results = await semantic_search(
                user_id=uid,
                query=q,
                content_type=content_type,
                folder_id=str(folder_id) if folder_id else None,
                tags=tags if tags else None,
                top_k=page_size * page,  # Get enough for pagination
            )
            # Manual pagination
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            paginated = semantic_results[start_idx:end_idx]
            results = await _enrich_semantic_results(db, paginated)
            return SearchResponse(
                total=len(semantic_results),
                page=page,
                results=results,
            )

        else:  # hybrid (default)
            # Reciprocal Rank Fusion of both
            hybrid_response = await hybrid_search_rrf(
                user_id=uid,
                query=q,
                content_type=content_type,
                folder_id=str(folder_id) if folder_id else None,
                tags=tags if tags else None,
                page=page,
                page_size=page_size,
            )
            results = await _enrich_hybrid_results(db, hybrid_response["results"])
            return SearchResponse(
                total=hybrid_response["total"],
                page=page,
                results=results,
            )

    except Exception as exc:
        log.error("Search failed (mode=%s): %s", mode, exc)
        # Fallback to basic PostgreSQL search
        return await _fallback_pg_search(
            db, user_id, q, content_type, folder_id, tags, page, page_size
        )


@router.post("/semantic", response_model=SearchResponse)
async def semantic_search_endpoint(
    query: str,
    content_type: str | None = None,
    folder_id: uuid.UUID | None = None,
    tags: list[str] = Query([]),
    top_k: int = Query(20, ge=1, le=100),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Pure semantic search using pgvector cosine similarity.

    Use this when you want conceptually related items, not just keyword matches.
    Example: "machine learning" finds items about "AI", "neural networks", etc.
    """
    results = await semantic_search(
        user_id=str(user_id),
        query=query,
        content_type=content_type,
        folder_id=str(folder_id) if folder_id else None,
        tags=tags if tags else None,
        top_k=top_k,
    )
    enriched = await _enrich_semantic_results(db, results)
    return SearchResponse(
        total=len(enriched),
        page=1,
        results=enriched,
    )


@router.get("/suggestions")
async def search_suggestions(
    q: str = Query("", min_length=1),
    limit: int = Query(5, ge=1, le=10),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Query suggestions from user's own titles and tags.
    """
    if not q or len(q) < 2:
        return {"suggestions": []}

    pattern = f"%{q}%"

    # Get matching titles
    title_result = await db.execute(
        select(Item.title)
        .where(
            Item.user_id == user_id,
            Item.deleted_at.is_(None),
            Item.title.ilike(pattern),
        )
        .distinct()
        .limit(limit)
    )
    titles = [r[0] for r in title_result.fetchall() if r[0]]

    # Get matching tags
    tag_result = await db.execute(
        select(Item.tags)
        .where(
            Item.user_id == user_id,
            Item.deleted_at.is_(None),
        )
        .distinct()
    )
    all_tags = set()
    for row in tag_result.fetchall():
        if row[0]:
            for tag in row[0]:
                if q.lower() in tag.lower():
                    all_tags.add(tag)

    suggestions = titles + list(all_tags)
    suggestions = suggestions[:limit]

    return {"suggestions": suggestions, "query": q}


# ─── Helper functions ─────────────────────────────────────────────────────────

async def _list_recent(
    db: AsyncSession,
    user_id: uuid.UUID,
    page: int,
    page_size: int,
) -> SearchResponse:
    """Return recent items when no query provided."""
    total_result = await db.execute(
        select(func.count())
        .select_from(Item)
        .where(Item.user_id == user_id, Item.deleted_at.is_(None))
    )
    total = total_result.scalar_one()

    rows = (
        await db.execute(
            select(Item)
            .options(selectinload(Item.folder))
            .where(Item.user_id == user_id, Item.deleted_at.is_(None))
            .order_by(Item.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    results = [_item_to_search_result(item) for item in rows]
    return SearchResponse(total=total, page=page, results=results)


async def _enrich_es_results(db: AsyncSession, es_results: list[dict]) -> list[SearchResult]:
    """Enrich Elasticsearch results with folder data from PostgreSQL."""
    if not es_results:
        return []

    item_ids = [r["id"] for r in es_results]

    rows = await db.execute(
        select(Item)
        .options(selectinload(Item.folder))
        .where(Item.id.in_(item_ids), Item.deleted_at.is_(None))
    )
    items = {str(item.id): item for item in rows.scalars().all()}

    results = []
    for es_hit in es_results:
        item_id = es_hit["id"]
        item = items.get(item_id)
        if not item:
            continue

        folder = None
        if item.folder:
            folder = {"id": str(item.folder.id), "name": item.folder.name}
        elif es_hit.get("folder_id"):
            folder = {"id": es_hit["folder_id"]}

        results.append(SearchResult(
            id=item.id,
            title=item.title or item.ai_title or es_hit.get("title"),
            summary=item.summary or es_hit.get("summary"),
            content_type=item.content_type,
            folder=folder,
            tags=item.tags or es_hit.get("tags") or [],
            score=es_hit.get("score", 0.0),
            created_at=item.created_at,
        ))

    return results


async def _enrich_semantic_results(
    db: AsyncSession, semantic_results: list[dict]
) -> list[SearchResult]:
    """Enrich semantic search results with full item data."""
    if not semantic_results:
        return []

    item_ids = [r["id"] for r in semantic_results]

    rows = await db.execute(
        select(Item)
        .options(selectinload(Item.folder))
        .where(Item.id.in_(item_ids), Item.deleted_at.is_(None))
    )
    items = {str(item.id): item for item in rows.scalars().all()}

    results = []
    for sem_result in semantic_results:
        item_id = sem_result["id"]
        item = items.get(item_id)
        if not item:
            continue

        folder = None
        if item.folder:
            folder = {"id": str(item.folder.id), "name": item.folder.name}
        elif sem_result.get("folder_id"):
            folder = {"id": sem_result["folder_id"]}

        results.append(SearchResult(
            id=item.id,
            title=item.title or item.ai_title or sem_result.get("title"),
            summary=item.summary or sem_result.get("summary"),
            content_type=item.content_type,
            folder=folder,
            tags=item.tags or sem_result.get("tags") or [],
            score=sem_result.get("similarity", 0.0),
            created_at=item.created_at,
        ))

    return results


async def _enrich_hybrid_results(
    db: AsyncSession, hybrid_results: list[dict]
) -> list[SearchResult]:
    """Enrich hybrid search (RRF) results with full item data."""
    if not hybrid_results:
        return []

    item_ids = [r["id"] for r in hybrid_results]

    rows = await db.execute(
        select(Item)
        .options(selectinload(Item.folder))
        .where(Item.id.in_(item_ids), Item.deleted_at.is_(None))
    )
    items = {str(item.id): item for item in rows.scalars().all()}

    results = []
    for hybrid_result in hybrid_results:
        item_id = hybrid_result["id"]
        item = items.get(item_id)
        if not item:
            continue

        folder = None
        if item.folder:
            folder = {"id": str(item.folder.id), "name": item.folder.name}
        elif hybrid_result.get("folder_id"):
            folder = {"id": hybrid_result["folder_id"]}

        # RRF score is the fused ranking score
        rrf_score = hybrid_result.get("rrf_score", 0.0)

        results.append(SearchResult(
            id=item.id,
            title=item.title or item.ai_title or hybrid_result.get("title"),
            summary=item.summary or hybrid_result.get("summary"),
            content_type=item.content_type,
            folder=folder,
            tags=item.tags or hybrid_result.get("tags") or [],
            score=rrf_score,  # RRF fused score
            created_at=item.created_at,
        ))

    return results


async def _fallback_pg_search(
    db: AsyncSession,
    user_id: uuid.UUID,
    q: str,
    content_type: str | None,
    folder_id: uuid.UUID | None,
    tags: list[str],
    page: int,
    page_size: int,
) -> SearchResponse:
    """Fallback to PostgreSQL ILIKE search if ES/vector fails."""
    from sqlalchemy import or_, and_

    filters = [Item.user_id == user_id, Item.deleted_at.is_(None)]

    search_pattern = f"%{q}%"
    filters.append(
        or_(
            Item.title.ilike(search_pattern),
            Item.ai_title.ilike(search_pattern),
            Item.summary.ilike(search_pattern),
            Item.raw_text.ilike(search_pattern),
            Item.tags.overlap([q]),
        )
    )

    if content_type:
        filters.append(Item.content_type == content_type)
    if folder_id:
        filters.append(Item.folder_id == folder_id)
    if tags:
        filters.append(Item.tags.overlap(tags))

    total_result = await db.execute(
        select(func.count()).select_from(Item).where(and_(*filters))
    )
    total = total_result.scalar_one()

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

    results = [_item_to_search_result(item, score=1.0) for item in rows]
    return SearchResponse(total=total, page=page, results=results)


def _item_to_search_result(item: Item, score: float = 1.0) -> SearchResult:
    """Convert Item model to SearchResult schema."""
    folder = None
    if item.folder:
        folder = {"id": str(item.folder.id), "name": item.folder.name}
    elif item.folder_id:
        folder = {"id": str(item.folder_id)}

    return SearchResult(
        id=item.id,
        title=item.title or item.ai_title or "Untitled",
        summary=item.summary,
        content_type=item.content_type,
        folder=folder,
        tags=item.tags or [],
        score=score,
        created_at=item.created_at,
    )

