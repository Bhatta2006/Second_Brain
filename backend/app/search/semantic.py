"""
Semantic search using pgvector cosine similarity.
Hybrid search with Reciprocal Rank Fusion (RRF).
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.search.es_client import search_items as es_search
from app.ai.embeddings import embed_text

log = logging.getLogger(__name__)

# RRF constant - higher = more weight to top ranks
RRF_K = 60

# Minimum similarity threshold for semantic results
SEMANTIC_THRESHOLD = 0.30


async def semantic_search(
    user_id: str,
    query: str,
    db: AsyncSession,
    content_type: str | None = None,
    folder_id: str | None = None,
    tags: list[str] | None = None,
    top_k: int = 20,
) -> list[dict[str, Any]]:
    """
    Semantic search using pgvector cosine similarity.
    Returns top_k results sorted by similarity score.
    """
    # Generate embedding for query
    query_embedding = await embed_text(query)
    emb_str = f"[{','.join(str(x) for x in query_embedding)}]"

    # Build filter conditions
    filter_conditions = ["user_id = :user_id", "deleted_at IS NULL", "embedding IS NOT NULL"]
    params: dict[str, Any] = {
        "user_id": user_id,
        "emb": emb_str,
        "threshold": SEMANTIC_THRESHOLD,
        "limit": top_k,
    }

    if content_type:
        filter_conditions.append("content_type = :content_type")
        params["content_type"] = content_type

    if folder_id:
        filter_conditions.append("folder_id = :folder_id")
        params["folder_id"] = folder_id

    if tags:
        filter_conditions.append("tags && :tags")
        params["tags"] = tags

    where_clause = " AND ".join(filter_conditions)

    sql = f"""
        SELECT
            id::text AS id,
            COALESCE(title, ai_title, 'Untitled') AS title,
            summary,
            content_type,
            folder_id::text AS folder_id,
            tags,
            is_starred,
            created_at,
            1 - (embedding <=> CAST(:emb AS vector)) AS similarity
        FROM items
        WHERE {where_clause}
          AND 1 - (embedding <=> CAST(:emb AS vector)) >= :threshold
        ORDER BY embedding <=> CAST(:emb AS vector)
        LIMIT :limit
    """

    result = await db.execute(text(sql), params)
    rows = result.fetchall()

    results = []
    for row in rows:
        results.append({
            "id": row.id,
            "title": row.title,
            "summary": row.summary,
            "content_type": row.content_type,
            "folder_id": row.folder_id,
            "tags": row.tags or [],
            "created_at": row.created_at,
            "is_starred": row.is_starred,
            "similarity": float(row.similarity),
        })

    return results


def _reciprocal_rank_fusion(
    keyword_results: list[dict],
    semantic_results: list[dict],
    k: int = RRF_K,
) -> list[dict]:
    """
    Reciprocal Rank Fusion: combine keyword (BM25) and semantic rankings.

    Score = Σ 1 / (k + rank) for each list where item appears

    As per PRD: Combined score = weighted fusion of both result sets
    """
    # Build score map: item_id -> RRF score
    rrf_scores: dict[str, float] = {}
    item_data: dict[str, dict] = {}

    # Process keyword results (ES/BM25)
    for rank, item in enumerate(keyword_results, start=1):
        item_id = item["id"]
        rrf_scores[item_id] = rrf_scores.get(item_id, 0.0) + 1.0 / (k + rank)
        # Store data from keyword result as base
        item_data[item_id] = {
            **item,
            "bm25_score": item.get("score", 0.0),
            "semantic_score": 0.0,
        }

    # Process semantic results
    for rank, item in enumerate(semantic_results, start=1):
        item_id = item["id"]
        rrf_scores[item_id] = rrf_scores.get(item_id, 0.0) + 1.0 / (k + rank)

        if item_id in item_data:
            # Item exists in both - update semantic score
            item_data[item_id]["semantic_score"] = item.get("similarity", 0.0)
        else:
            # Item only in semantic - add to data
            item_data[item_id] = {
                **item,
                "bm25_score": 0.0,
                "semantic_score": item.get("similarity", 0.0),
            }

    # Sort by RRF score descending
    fused = []
    for item_id in sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x], reverse=True):
        data = item_data[item_id]
        fused.append({
            **data,
            "rrf_score": rrf_scores[item_id],
        })

    return fused


async def hybrid_search_rrf(
    user_id: str,
    query: str,
    db: AsyncSession,
    content_type: str | None = None,
    folder_id: str | None = None,
    tags: list[str] | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    """
    Hybrid search combining Elasticsearch (BM25) + pgvector (semantic) with RRF.

    As per PRD Section 13:
    - Dual retrieval: BM25 (top-20) + Semantic (top-20)
    - Re-ranking: Reciprocal Rank Fusion
    - Returns fused results
    """
    # Get keyword results from Elasticsearch
    es_response = await es_search(
        user_id=user_id,
        query=query,
        content_type=content_type,
        folder_id=folder_id,
        tags=tags,
        page=1,  # Get top results for fusion
        page_size=20,
    )
    keyword_results = es_response.get("results", [])

    # Get semantic results from pgvector
    semantic_results = await semantic_search(
        user_id=user_id,
        query=query,
        db=db,
        content_type=content_type,
        folder_id=folder_id,
        tags=tags,
        top_k=20,
    )

    # Fuse rankings
    fused_results = _reciprocal_rank_fusion(keyword_results, semantic_results)

    # Apply pagination
    total = len(fused_results)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated = fused_results[start_idx:end_idx]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "results": paginated,
    }
