"""
Celery tasks for keeping Neo4j in sync with PostgreSQL.

PostgreSQL is always the source of truth. Neo4j is an eventually-consistent
derived view used exclusively for graph traversal.

The WebSocket `item.ready` event fires AFTER sync completes so the frontend
only renders a node once it exists in Neo4j.
"""
from __future__ import annotations

import asyncio
import logging

from celery import shared_task
from neo4j.exceptions import ServiceUnavailable

from app.tasks.celery_app import celery_app
from app.graph.neo4j_client import neo4j_client
from app.tasks.edge_generation import generate_all_edges_async
from app.cache.redis_client import invalidate_graph_cache

log = logging.getLogger(__name__)


# ── Main ingestion sync ───────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    max_retries=5,
    default_retry_delay=30,
    name="app.tasks.sync.sync_item_to_neo4j",
)
def sync_item_to_neo4j(self, item_id: str, user_id: str) -> None:
    """
    Full Neo4j sync for a newly ingested item:
    1. Merge Item node
    2. Generate all 4 edge types
    3. Invalidate Redis graph cache
    """
    try:
        asyncio.run(_sync(item_id, user_id))
    except ServiceUnavailable as exc:
        # Exponential back-off: 30s, 60s, 120s, 240s, 480s
        countdown = 30 * (2 ** self.request.retries)
        log.warning("Neo4j unavailable, retrying in %ds: %s", countdown, exc)
        raise self.retry(exc=exc, countdown=countdown)
    except Exception as exc:
        log.error("sync_item_to_neo4j failed for %s: %s", item_id, exc)
        raise self.retry(exc=exc, countdown=30 * (2 ** self.request.retries))


async def _sync(item_id: str, user_id: str) -> None:
    await generate_all_edges_async(item_id, user_id)
    await invalidate_graph_cache(user_id)
    log.info("Neo4j sync complete for item %s", item_id)


# ── Edge recomputation (after item edit) ──────────────────────────────────────

@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=15,
    name="app.tasks.sync.recompute_edges",
)
def recompute_edges(self, item_id: str, user_id: str) -> None:
    """
    Called when a user edits tags or notes on an item.
    Deletes stale auto-edges from Neo4j then re-generates them.
    USER_LINK edges are preserved.
    """
    try:
        asyncio.run(_recompute(item_id, user_id))
    except Exception as exc:
        raise self.retry(exc=exc)


async def _recompute(item_id: str, user_id: str) -> None:
    await neo4j_client.delete_auto_edges(item_id)
    await generate_all_edges_async(item_id, user_id)
    await invalidate_graph_cache(user_id)


# ── Folder change sync ────────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    max_retries=3,
    name="app.tasks.sync.update_item_folder",
)
def update_item_folder(self, item_id: str, folder_name: str, folder_id: str | None) -> None:
    try:
        asyncio.run(
            neo4j_client.update_item_node(item_id, folder=folder_name, folderId=folder_id)
        )
    except Exception as exc:
        raise self.retry(exc=exc)


# ── Soft / hard delete sync ───────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    max_retries=3,
    name="app.tasks.sync.soft_delete_node",
)
def soft_delete_node(self, item_id: str, user_id: str) -> None:
    try:
        asyncio.run(_soft_delete(item_id, user_id))
    except Exception as exc:
        raise self.retry(exc=exc)


async def _soft_delete(item_id: str, user_id: str) -> None:
    await neo4j_client.soft_delete_node(item_id)
    await invalidate_graph_cache(user_id)


@celery_app.task(
    bind=True,
    max_retries=3,
    name="app.tasks.sync.delete_node_from_neo4j",
)
def delete_node_from_neo4j(self, item_id: str, user_id: str) -> None:
    try:
        asyncio.run(_delete_node(item_id, user_id))
    except Exception as exc:
        raise self.retry(exc=exc)


async def _delete_node(item_id: str, user_id: str) -> None:
    await neo4j_client.delete_node(item_id)
    await invalidate_graph_cache(user_id)


# ── GDPR erasure ──────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.sync.delete_user_graph")
def delete_user_graph(user_id: str) -> None:
    asyncio.run(neo4j_client.delete_user_graph(user_id))


# ── Nightly drift check ───────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.sync.check_neo4j_drift")
def check_neo4j_drift() -> None:
    asyncio.run(_check_drift())


async def _check_drift() -> None:
    from sqlalchemy import text
    from app.tasks._db import task_session

    async with task_session() as db:
        result = await db.execute(
            text("SELECT COUNT(*) FROM items WHERE deleted_at IS NULL")
        )
        pg_count: int = result.scalar_one()

    # We check total across ALL users here; per-user check can be added later
    rows = await neo4j_client.run(
        "MATCH (n:Item) WHERE n.deleted IS NULL OR n.deleted = false RETURN count(n) AS c"
    )
    neo_count: int = rows[0]["c"] if rows else 0
    drift = abs(pg_count - neo_count)

    log.info("Neo4j drift check — PG: %d, Neo4j: %d, drift: %d", pg_count, neo_count, drift)

    if drift > 50:
        log.error(
            "Neo4j drift exceeded threshold: %d items out of sync. "
            "Run scripts/rebuild_neo4j.py to recover.",
            drift,
        )
