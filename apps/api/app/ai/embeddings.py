"""
Embedding generation — provider-aware.

Two backends, selected by `settings.embedding_provider`:

  github  → Azure AI Inference SDK (openai/text-embedding-3-large, 1536-dim,
            supports the `dimensions` reduce param).
  nebius  → OpenAI-compatible /embeddings endpoint over httpx
  /custom   (e.g. Nebius Token Factory: Qwen/Qwen3-Embedding-8B, 4096-dim).

The vector dimension is `settings.embedding_dim` and MUST match the pgvector
column (`items.embedding`). Changing the model/dim requires a DB migration and a
re-embed of all existing items — see app.tasks.reembed.
"""
from __future__ import annotations

import logging

import httpx
from azure.ai.inference.aio import EmbeddingsClient
from azure.core.credentials import AzureKeyCredential

from app.config import settings

log = logging.getLogger(__name__)


def _embed_dim() -> int:
    return int(settings.embedding_dim)


def _is_github() -> bool:
    return settings.embedding_provider.lower() == "github"


# ── GitHub (Azure SDK) path ─────────────────────────────────────────────────

def _github_client() -> EmbeddingsClient:
    # Per-call clients — caching at module level keeps a dead event loop after
    # asyncio.run() returns, breaking subsequent Celery tasks in the same worker.
    return EmbeddingsClient(
        endpoint=settings.github_models_endpoint,
        credential=AzureKeyCredential(settings.github_token),
    )


async def _github_embed(texts: list[str]) -> list[list[float]]:
    async with _github_client() as client:
        response = await client.embed(
            input=texts,
            model=settings.embedding_model,
            dimensions=_embed_dim(),
        )
    return [d.embedding for d in response.data]


# ── Nebius / custom (OpenAI-compatible) path ────────────────────────────────

async def _openai_compatible_embed(texts: list[str]) -> list[list[float]]:
    base = settings.embedding_base_url.rstrip("/")
    key = settings.embedding_api_key or settings.github_token
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            f"{base}/embeddings",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            # No `dimensions` param — Qwen3-Embedding-8B is natively 4096-dim and
            # most OpenAI-compatible providers reject the reduce param.
            json={"model": settings.embedding_model, "input": texts},
        )
        res.raise_for_status()
        data = res.json()["data"]
    # Preserve input order (providers return an `index` field).
    data.sort(key=lambda d: d.get("index", 0))
    return [d["embedding"] for d in data]


# ── Public API ──────────────────────────────────────────────────────────────

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


async def _embed(texts: list[str]) -> list[list[float]]:
    if _is_github():
        return await _github_embed(texts)
    return await _openai_compatible_embed(texts)


async def embed_text(text: str) -> list[float]:
    """Embed a single string. Returns an `embedding_dim`-length vector."""
    vectors = await _embed([text])
    return vectors[0]


async def embed_item(item: dict) -> list[float]:
    text = _build_embedding_input(item)
    if not text.strip():
        return [0.0] * _embed_dim()
    return await embed_text(text)


async def embed_batch(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    return await _embed(texts)
