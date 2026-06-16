"""
Graph API — Phase 2: Neo4j Cypher queries with Redis caching.

Feature flag USE_NEO4J_GRAPH (default True) routes to Neo4j.
Set to False to fall back to the PostgreSQL edges table (Phase 0 behaviour).

Cache TTLs (from docs):
  Full graph  → 1 hour  (graph:{uid}:full:{minWeight})
  Ego graph   → 5 min   (graph:{uid}:{item_id}:{depth}:{minWeight})
  Neighbours  → no cache (real-time)

Invalidation: called by sync.py after item.ready
"""
from __future__ import annotations

import uuid
import logging
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.config import settings
from app.deps import get_current_user, get_db_session
from app.graph.neo4j_client import neo4j_client
from app.cache.redis_client import (
    cache_get,
    cache_set,
    full_graph_key,
    ego_graph_key,
)
from app.schemas.graph import GraphResponse, GraphNode, GraphEdge, GraphMeta

# Phase 0 fallback imports
from app.models.item import Item
from app.models.edge import Edge

log = logging.getLogger(__name__)
router = APIRouter(prefix="/graph", tags=["graph"])

# ─── Full / ego graph ──────────────────────────────────────────────────────────

@router.get("", response_model=GraphResponse)
async def get_graph(
    item_id: uuid.UUID | None = Query(None, description="If set, returns ego graph for this node"),
    depth: int = Query(2, ge=1, le=3, description="Hop depth for ego graph"),
    min_weight: float = Query(0.6, ge=0.0, le=1.0),
    limit: int = Query(500, le=1000),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    uid = str(user_id)

    if settings.use_neo4j_graph:
        return await _graph_neo4j(uid, item_id, depth, min_weight, limit)
    return await _graph_postgres(user_id, item_id, min_weight, limit, db)


async def _graph_neo4j(
    user_id: str,
    item_id: uuid.UUID | None,
    depth: int,
    min_weight: float,
    limit: int,
) -> GraphResponse:
    if item_id:
        # Ego graph
        iid = str(item_id)
        key = ego_graph_key(user_id, iid, depth, min_weight)
        cached = await cache_get(key)
        if cached:
            return _dict_to_response(cached, min_weight)

        raw = await neo4j_client.get_ego_graph(iid, user_id, depth, min_weight)
        await cache_set(key, raw, ttl=300)  # 5 min
    else:
        # Full graph
        key = full_graph_key(user_id, min_weight)
        cached = await cache_get(key)
        if cached:
            return _dict_to_response(cached, min_weight)

        raw = await neo4j_client.get_full_graph(user_id, min_weight, limit)
        await cache_set(key, raw, ttl=3600)  # 1 hour

    return _dict_to_response(raw, min_weight)


def _dict_to_response(raw: dict, min_weight: float) -> GraphResponse:
    nodes = [
        GraphNode(
            id=n["id"],
            label=n.get("label") or "Untitled",
            type=n.get("type") or "text",
            folder=n.get("folder"),
            folder_id=n.get("folderId"),
            tags=n.get("tags") or [],
            view_count=n.get("viewCount") or 0,
            is_starred=n.get("isStarred") or False,
        )
        for n in raw.get("nodes") or []
    ]
    edges = [
        GraphEdge(
            source=e["source"],
            target=e["target"],
            type=e.get("type") or "semantic",
            weight=e.get("weight") or 0.0,
        )
        for e in raw.get("edges") or []
    ]
    return GraphResponse(
        nodes=nodes,
        edges=edges,
        meta=GraphMeta(
            total_nodes=len(nodes),
            total_edges=len(edges),
            truncated=len(nodes) >= 500,
            min_weight=min_weight,
        ),
    )


# ── PostgreSQL fallback (Phase 0 path) ────────────────────────────────────────

async def _graph_postgres(
    user_id: uuid.UUID,
    item_id: uuid.UUID | None,
    min_weight: float,
    limit: int,
    db: AsyncSession,
) -> GraphResponse:
    edge_rows = (
        await db.execute(
            select(Edge)
            .where(Edge.user_id == user_id, Edge.weight >= min_weight)
            .limit(limit * 4)
        )
    ).scalars().all()

    item_ids: set[uuid.UUID] = set()
    for e in edge_rows:
        item_ids.add(e.source_id)
        item_ids.add(e.target_id)

    if item_id:
        neighbourhood: set[uuid.UUID] = {item_id}
        for e in edge_rows:
            if e.source_id == item_id:
                neighbourhood.add(e.target_id)
            elif e.target_id == item_id:
                neighbourhood.add(e.source_id)
        item_ids &= neighbourhood

    item_ids = set(list(item_ids)[:limit])
    items = (
        await db.execute(
            select(Item)
            .options(selectinload(Item.folder))
            .where(
                Item.id.in_(item_ids),
                Item.user_id == user_id,
                Item.deleted_at.is_(None),
            )
        )
    ).scalars().all()

    item_map = {i.id: i for i in items}
    nodes = [
        GraphNode(
            id=i.id,
            label=i.title or i.ai_title or "Untitled",
            type=i.content_type,
            folder=i.folder.name if i.folder else None,
            folder_id=i.folder_id,
            tags=i.tags or [],
            view_count=i.view_count,
            is_starred=i.is_starred,
        )
        for i in items
    ]
    edges = [
        GraphEdge(source=e.source_id, target=e.target_id, type=e.edge_type, weight=e.weight)
        for e in edge_rows
        if e.source_id in item_map and e.target_id in item_map
    ]
    return GraphResponse(
        nodes=nodes,
        edges=edges,
        meta=GraphMeta(
            total_nodes=len(nodes),
            total_edges=len(edges),
            truncated=len(item_ids) >= limit,
            min_weight=min_weight,
        ),
    )


# ── Neighbours ────────────────────────────────────────────────────────────────

@router.get("/item/{item_id}/neighbours")
async def get_neighbours(
    item_id: uuid.UUID,
    edge_types: list[str] = Query(default=["semantic", "user_link"]),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """1-hop neighbours — used by the item detail panel and incremental graph update."""
    if settings.use_neo4j_graph:
        neighbours = await neo4j_client.get_neighbours(
            str(item_id), str(user_id), edge_types
        )
        return {"neighbours": neighbours}

    # Fallback
    edge_rows = (
        await db.execute(
            select(Edge).where(
                Edge.user_id == user_id,
                Edge.edge_type.in_(edge_types),
                (Edge.source_id == item_id) | (Edge.target_id == item_id),
            )
        )
    ).scalars().all()

    neighbour_ids = {
        e.target_id if e.source_id == item_id else e.source_id
        for e in edge_rows
    }
    neighbours_db = (
        await db.execute(
            select(Item)
            .options(selectinload(Item.folder))
            .where(
                Item.id.in_(neighbour_ids),
                Item.user_id == user_id,
                Item.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    edge_map = {(e.source_id, e.target_id): e for e in edge_rows}

    return {
        "neighbours": [
            {
                "id": str(n.id),
                "label": n.title or n.ai_title or "Untitled",
                "type": n.content_type,
                "folder": n.folder.name if n.folder else None,
                "tags": n.tags or [],
                "edge_type": (
                    edge_map.get((item_id, n.id)) or edge_map.get((n.id, item_id))
                ).edge_type,
                "weight": (
                    edge_map.get((item_id, n.id)) or edge_map.get((n.id, item_id))
                ).weight,
            }
            for n in neighbours_db
        ]
    }


# ── Manual USER_LINK edges ────────────────────────────────────────────────────

@router.delete("/item/{item_id}/link/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_user_link(
    item_id: uuid.UUID,
    target_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
):
    if settings.use_neo4j_graph:
        await neo4j_client.delete_user_link(str(item_id), str(target_id))
    from app.cache.redis_client import invalidate_graph_cache
    await invalidate_graph_cache(str(user_id))
