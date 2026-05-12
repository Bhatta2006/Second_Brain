"""
Embedding generation via GitHub Models (azure-ai-inference SDK).
Endpoint: https://models.github.ai/inference
Model:    openai/text-embedding-3-large
          We request dimensions=1536 to match the pgvector column shape.
          text-embedding-3-large defaults to 3072 dims; OpenAI's `dimensions`
          parameter requests a reduced-dim variant of the same model.
"""
from __future__ import annotations

import logging
from azure.ai.inference.aio import EmbeddingsClient
from azure.core.credentials import AzureKeyCredential
from app.config import settings

log = logging.getLogger(__name__)

EMBED_DIM = 1536


def _new_client() -> EmbeddingsClient:
    # Per-call clients — caching at module level keeps a dead event loop after
    # asyncio.run() returns, breaking subsequent Celery tasks in the same worker.
    return EmbeddingsClient(
        endpoint=settings.github_models_endpoint,
        credential=AzureKeyCredential(settings.github_token),
    )


def _build_embedding_input(item: dict) -> str:
    """Concatenate fields as documented: title + summary + raw_text[:2000] + tags."""
    parts: list[str] = []
    if item.get("title"):
        parts.append(item["title"])
    if item.get("summary"):
        parts.append(item["summary"])
    raw = (item.get("raw_text") or "")[:2000]
    if raw:
        parts.append(raw)
    if item.get("tags"):
        parts.append(" ".join(item["tags"]))
    return " ".join(parts)


async def embed_text(text: str) -> list[float]:
    """Embed a single string. Returns a 1536-dim vector."""
    async with _new_client() as client:
        response = await client.embed(
            input=[text],
            model=settings.embedding_model,
            dimensions=EMBED_DIM,
        )
    return response.data[0].embedding


async def embed_item(item: dict) -> list[float]:
    text = _build_embedding_input(item)
    if not text.strip():
        return [0.0] * EMBED_DIM
    return await embed_text(text)


async def embed_batch(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    async with _new_client() as client:
        response = await client.embed(
            input=texts,
            model=settings.embedding_model,
            dimensions=EMBED_DIM,
        )
    return [d.embedding for d in response.data]
