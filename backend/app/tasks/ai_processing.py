"""
Phase 1 AI pipeline. Orchestrates the per-item processing:

  raw_text / fetched_url_body
        │
        ▼
  classify_item (gpt-4o)   →   title, summary, tags, entities, confidence, folder
  summarise (gpt-4o-mini)  →   richer summary if classification one was sparse
  embed_item               →   1536-dim vector
        │
        ▼
  UPDATE items SET ...
        │
        ▼
  sync_item_to_neo4j.delay   (existing task — generates edges)

GitHub Models rate limits apply (10–15 RPM on free tier), so we run sequentially
within a single task rather than fanning out parallel calls.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

import httpx
from bs4 import BeautifulSoup
from celery import shared_task
from sqlalchemy import update, select

from app.tasks.celery_app import celery_app
from app.tasks._db import task_session
from app.models.item import Item
from app.ai.llm import classify_item, summarise
from app.ai.embeddings import embed_item

log = logging.getLogger(__name__)

MAX_TEXT_FOR_AI = 8000   # chars sent to classifier
URL_TIMEOUT = 15


# ── Content extraction ────────────────────────────────────────────────────────

async def _fetch_url_text(url: str) -> str:
    """Fetch a URL and return its main body text (rough — strips tags only)."""
    try:
        async with httpx.AsyncClient(timeout=URL_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 SecondBrain/1.0"})
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")
            for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
                tag.decompose()
            text = soup.get_text(" ", strip=True)
            return text[:MAX_TEXT_FOR_AI]
    except Exception as exc:
        log.warning("URL fetch failed for %s: %s", url, exc)
        return ""


def _pick_content(item: Item, fetched: str) -> str:
    """Choose the best text representation of an item for AI processing."""
    if item.raw_text:
        return item.raw_text[:MAX_TEXT_FOR_AI]
    if fetched:
        return fetched
    if item.title:
        return item.title
    return ""


# ── Main task ─────────────────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    name="app.tasks.ai_processing.process_item",
)
def process_item(self, item_id: str, user_id: str) -> None:
    """Full AI pipeline for one item, then trigger Neo4j sync."""
    try:
        asyncio.run(_process(item_id, user_id))
    except Exception as exc:
        log.error("process_item failed for %s: %s", item_id, exc, exc_info=True)
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


async def _process(item_id: str, user_id: str) -> None:
    async with task_session() as db:
        item = (
            await db.execute(select(Item).where(Item.id == item_id))
        ).scalar_one_or_none()
        if not item:
            log.warning("process_item: %s not found", item_id)
            return

        fetched = ""
        if item.content_type == "url" and item.source_url:
            fetched = await _fetch_url_text(item.source_url)

        content = _pick_content(item, fetched)
        if not content.strip():
            log.info("process_item: %s has no content, skipping AI", item_id)
            await _trigger_sync(item_id, user_id)
            return

        classification = await classify_item(
            content_type=item.content_type,
            content_text=content,
        )

        summary = classification.get("summary") or ""
        if not summary:
            summary = await summarise(content)

        embedding = await embed_item({
            "title": classification.get("title") or item.title,
            "summary": summary,
            "raw_text": content,
            "tags": classification.get("tags") or [],
        })

        confidence = float(classification.get("confidence") or 0.0)
        await db.execute(
            update(Item)
            .where(Item.id == item_id)
            .values(
                ai_title=classification.get("title") or None,
                summary=summary or None,
                tags=classification.get("tags") or [],
                entities=classification.get("entities") or {},
                confidence=confidence,
                needs_review=confidence < 0.5,
                embedding=embedding,
                indexed_at=datetime.utcnow(),
                raw_text=content if not item.raw_text else item.raw_text,
            )
        )
        await db.commit()
        log.info("AI processing complete for %s (conf=%.2f)", item_id, confidence)

    # Re-index to Elasticsearch with AI-enriched data
    try:
        from app.search.es_client import index_item as es_index
        await es_index(
            user_id=user_id,
            item_id=item_id,
            title=classification.get("title") or item.title,
            summary=summary,
            raw_text=content if not item.raw_text else item.raw_text,
            tags=classification.get("tags") or [],
            content_type=item.content_type,
            folder_id=str(item.folder_id) if item.folder_id else None,
            entities=classification.get("entities") or {},
            created_at=item.created_at.isoformat(),
            is_starred=item.is_starred,
        )
        log.info("Re-indexed item %s to ES after AI processing", item_id)
    except Exception as exc:
        log.warning("Failed to re-index item %s to ES: %s", item_id, exc)

    await _trigger_sync(item_id, user_id)


async def _trigger_sync(item_id: str, user_id: str) -> None:
    """Hand off to the existing Neo4j sync + edge generation task."""
    from app.tasks.sync import sync_item_to_neo4j
    sync_item_to_neo4j.delay(item_id, user_id)
