"""
Edge generation — all 4 auto edge types.
Called from Celery tasks; uses asyncio.run() to bridge Celery's sync world.

Writes:
  1. PostgreSQL edges table (Phase 1 compat / fallback)
  2. Neo4j relationships (Phase 2 primary)
"""
from __future__ import annotations

import asyncio
import math
import logging
from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.tasks._db import task_session as AsyncSessionLocal
from app.graph.neo4j_client import neo4j_client

log = logging.getLogger(__name__)

SEMANTIC_THRESHOLD = 0.75
SEMANTIC_TOP_K = 5

SHARED_TAG_FREQUENCY_THRESHOLD = 0.15

BURST_WINDOW_MINUTES = 30
BURST_MIN_ITEMS = 3
TEMPORAL_MAX_EDGES = 3
TEMPORAL_MAX_DELTA_SECONDS = 3600

ENTITY_MATCH_WEIGHT = 0.7


# ── Semantic edges ────────────────────────────────────────────────────────────

async def generate_semantic_edges(
    item_id: str, user_id: str, embedding: list[float]
) -> None:
    emb_str = f"[{','.join(str(x) for x in embedding)}]"
    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            text("""
                SELECT CAST(id AS text) AS id,
                       1 - (embedding <=> CAST(:emb AS vector)) AS score
                FROM items
                WHERE user_id = :user_id
                  AND id != :item_id
                  AND deleted_at IS NULL
                  AND embedding IS NOT NULL
                  AND 1 - (embedding <=> CAST(:emb AS vector)) > :threshold
                ORDER BY embedding <=> CAST(:emb AS vector)
                LIMIT :k
            """),
            {
                "emb": emb_str,
                "user_id": user_id,
                "item_id": item_id,
                "threshold": SEMANTIC_THRESHOLD,
                "k": SEMANTIC_TOP_K,
            },
        )
        similar = rows.fetchall()

    for row in similar:
        target_id, score = str(row.id), float(row.score)
        # Phase 1 compat: persist to edges table
        await _upsert_pg_edge(item_id, target_id, user_id, "semantic", score)
        # Phase 2: Neo4j
        await neo4j_client.create_semantic_edge(item_id, target_id, score)

    log.debug("Semantic edges for %s: %d", item_id, len(similar))


# ── Shared-tag edges ──────────────────────────────────────────────────────────

async def generate_shared_tag_edges(
    item_id: str, user_id: str, tags: list[str]
) -> None:
    if not tags:
        return
    async with AsyncSessionLocal() as db:
        total_result = await db.execute(
            text("SELECT COUNT(*) FROM items WHERE user_id = :uid AND deleted_at IS NULL"),
            {"uid": user_id},
        )
        total_items: int = total_result.scalar_one()
        if total_items == 0:
            return

        # For small libraries the 15% rule excludes everything (e.g. 6 items → cap=1),
        # so use a floor of 50% of items (rounded up) but never fewer than 3.
        # Once the library grows past ~20 items, the 15% rule kicks in.
        max_tag_count = max(3, int(total_items * SHARED_TAG_FREQUENCY_THRESHOLD), int(total_items * 0.5))
        if total_items >= 20:
            max_tag_count = max(3, int(total_items * SHARED_TAG_FREQUENCY_THRESHOLD))

        for tag in tags:
            count_result = await db.execute(
                text("SELECT COUNT(*) FROM items WHERE user_id = :uid AND :tag = ANY(tags)"),
                {"uid": user_id, "tag": tag},
            )
            tag_count: int = count_result.scalar_one()
            if tag_count > max_tag_count:
                continue  # Too frequent — becomes cluster label, not edge

            rows = await db.execute(
                text("""
                    SELECT id::text FROM items
                    WHERE user_id = :uid
                      AND :tag = ANY(tags)
                      AND id != :item_id
                      AND deleted_at IS NULL
                """),
                {"uid": user_id, "tag": tag, "item_id": item_id},
            )
            for row in rows.fetchall():
                target_id = str(row.id)
                await _upsert_pg_edge(item_id, target_id, user_id, "shared_tag", 0.6)
                await neo4j_client.create_shared_tag_edge(item_id, target_id, tag)


# ── Temporal edges ────────────────────────────────────────────────────────────

def _temporal_weight(delta_seconds: int) -> float:
    """Exponential decay — 0.5 at 0s, ~0.25 at 30 min, ~0 at 60 min."""
    return 0.5 * math.exp(-delta_seconds / 1800)


async def generate_temporal_edges(
    item_id: str, user_id: str, created_at: datetime
) -> None:
    window_start = created_at - timedelta(minutes=BURST_WINDOW_MINUTES)
    window_end = created_at + timedelta(minutes=BURST_WINDOW_MINUTES)

    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            text("""
                SELECT id::text, created_at,
                  ABS(EXTRACT(EPOCH FROM (created_at - :ts))) AS delta_seconds
                FROM items
                WHERE user_id = :uid
                  AND id != :item_id
                  AND deleted_at IS NULL
                  AND created_at BETWEEN :start AND :end
                ORDER BY delta_seconds ASC
            """),
            {
                "uid": user_id,
                "item_id": item_id,
                "ts": created_at,
                "start": window_start,
                "end": window_end,
            },
        )
        burst_items = rows.fetchall()

    if len(burst_items) < BURST_MIN_ITEMS - 1:
        return  # Not a dense burst

    for row in burst_items[:TEMPORAL_MAX_EDGES]:
        delta = int(row.delta_seconds)
        if delta > TEMPORAL_MAX_DELTA_SECONDS:
            break
        weight = _temporal_weight(delta)
        if weight < 0.1:
            break
        target_id = str(row.id)
        await _upsert_pg_edge(item_id, target_id, user_id, "temporal", weight)
        await neo4j_client.create_temporal_edge(item_id, target_id, weight, delta)


# ── Entity-match edges ────────────────────────────────────────────────────────

async def generate_entity_edges(
    item_id: str, user_id: str, entities: dict
) -> None:
    all_entities = (
        [("people", e) for e in entities.get("people", [])]
        + [("organisations", e) for e in entities.get("organisations", [])]
        + [("concepts", e) for e in entities.get("concepts", [])]
    )
    if not all_entities:
        return

    async with AsyncSessionLocal() as db:
        for entity_type, entity in all_entities:
            rows = await db.execute(
                text("""
                    SELECT id::text FROM items
                    WHERE user_id = :uid
                      AND id != :item_id
                      AND deleted_at IS NULL
                      AND entities @> CAST(:eq AS jsonb)
                """),
                {
                    "uid": user_id,
                    "item_id": item_id,
                    "eq": f'{{"{entity_type}": ["{entity}"]}}',
                },
            )
            for row in rows.fetchall():
                target_id = str(row.id)
                await _upsert_pg_edge(item_id, target_id, user_id, "entity_match", ENTITY_MATCH_WEIGHT)
                await neo4j_client.create_entity_edge(
                    item_id, target_id, entity, entity_type, ENTITY_MATCH_WEIGHT
                )


# ── Combined task ─────────────────────────────────────────────────────────────

async def generate_all_edges_async(item_id: str, user_id: str) -> None:
    """Load item from PG and run all 4 edge generators in parallel."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text("""
                SELECT id::text, user_id::text, title, content_type, folder_id::text,
                       tags, entities, view_count, is_starred, created_at,
                       embedding::text
                FROM items
                WHERE id = :id AND user_id = :uid AND deleted_at IS NULL
            """),
            {"id": item_id, "uid": user_id},
        )
        row = result.fetchone()
        if not row:
            log.warning("generate_all_edges: item %s not found", item_id)
            return

    # Ensure Neo4j node exists
    folder_name = "Uncategorised"  # resolved later with folder join if needed
    await neo4j_client.merge_item(
        {
            "id": row.id,
            "userId": row.user_id,
            "label": row.title or "Untitled",
            "contentType": row.content_type,
            "folder": folder_name,
            "folderId": row.folder_id,
            "tags": row.tags or [],
            "viewCount": row.view_count,
            "isStarred": row.is_starred,
            "createdAt": row.created_at.isoformat(),
        }
    )

    embedding: list[float] = []
    if row.embedding:
        raw = row.embedding.strip("[]")
        embedding = [float(x) for x in raw.split(",") if x.strip()]

    generators = [
        ("semantic", generate_semantic_edges(item_id, user_id, embedding) if embedding else asyncio.sleep(0)),
        ("shared_tag", generate_shared_tag_edges(item_id, user_id, row.tags or [])),
        ("temporal", generate_temporal_edges(item_id, user_id, row.created_at)),
        ("entity", generate_entity_edges(item_id, user_id, row.entities or {})),
    ]
    results = await asyncio.gather(*(g for _, g in generators), return_exceptions=True)
    for (name, _), result in zip(generators, results):
        if isinstance(result, Exception):
            log.error("Edge generator %s failed for %s: %r", name, item_id, result)
    log.info("All edges generated for item %s", item_id)


# ── Helper ────────────────────────────────────────────────────────────────────

async def _upsert_pg_edge(
    source_id: str,
    target_id: str,
    user_id: str,
    edge_type: str,
    weight: float,
) -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(
            text("""
                INSERT INTO edges (user_id, source_id, target_id, edge_type, weight)
                VALUES (CAST(:uid AS uuid), CAST(:src AS uuid), CAST(:tgt AS uuid), :etype, :w)
                ON CONFLICT (source_id, target_id, edge_type) DO NOTHING
            """),
            {
                "uid": user_id,
                "src": source_id,
                "tgt": target_id,
                "etype": edge_type,
                "w": weight,
            },
        )
        await db.commit()
