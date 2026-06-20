"""
Re-embed all of a user's items with the currently-configured embedding model.

Needed after switching the embedding provider/model/dimension (e.g. GitHub
text-embedding-3-large 1536-dim → Nebius Qwen3-Embedding-8B 4096-dim). The DB
migration clears old vectors; this task regenerates them so semantic search and
graph edge generation work again.

Runs sequentially with a short pause to respect provider rate limits.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from sqlalchemy import select, update

from app.tasks.celery_app import celery_app
from app.tasks._db import task_session
from app.models.item import Item
from app.ai.embeddings import embed_item

log = logging.getLogger(__name__)

PAUSE_BETWEEN = 0.3   # seconds between items — gentle on rate limits


@celery_app.task(name="app.tasks.reembed.reembed_all", bind=True)
def reembed_all(self, user_id: str) -> dict:
    """Re-embed every (non-deleted) item for one user. Returns a small summary."""
    return asyncio.run(_reembed(user_id))


async def _reembed(user_id: str) -> dict:
    done = 0
    failed = 0
    async with task_session() as db:
        rows = (
            await db.execute(
                select(Item).where(Item.user_id == user_id, Item.deleted_at.is_(None))
            )
        ).scalars().all()
        total = len(rows)
        log.info("reembed_all: %d items for user %s", total, user_id)

        for item in rows:
            try:
                vector = await embed_item({
                    "title": item.ai_title or item.title,
                    "summary": item.summary,
                    "raw_text": item.raw_text,
                    "tags": item.tags or [],
                })
                await db.execute(
                    update(Item)
                    .where(Item.id == item.id)
                    .values(embedding=vector, indexed_at=datetime.utcnow())
                )
                await db.commit()
                done += 1
            except Exception as exc:
                failed += 1
                log.warning("reembed failed for %s: %s", item.id, exc)
            await asyncio.sleep(PAUSE_BETWEEN)

    log.info("reembed_all complete: %d ok, %d failed of %d", done, failed, total)
    return {"total": total, "reembedded": done, "failed": failed}
