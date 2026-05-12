import asyncio
import json
import redis.asyncio as aioredis
from app.config import settings

# Per-event-loop pool. asyncio Redis stores Futures tied to the loop that
# created them, so a single module-level pool breaks when reused across
# loops (e.g. Celery's asyncio.run() per task).
_redis: aioredis.Redis | None = None
_loop = None


def get_redis() -> aioredis.Redis:
    global _redis, _loop
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None
    if _redis is None or _loop is not current_loop:
        _redis = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=20,
        )
        _loop = current_loop
    return _redis


# ── Cache keys ────────────────────────────────────────────────────────────────

def full_graph_key(user_id: str, min_weight: float) -> str:
    return f"graph:{user_id}:full:{min_weight}"


def ego_graph_key(user_id: str, item_id: str, depth: int, min_weight: float) -> str:
    return f"graph:{user_id}:{item_id}:{depth}:{min_weight}"


# ── Get / set helpers ─────────────────────────────────────────────────────────

async def cache_get(key: str) -> dict | None:
    raw = await get_redis().get(key)
    return json.loads(raw) if raw else None


async def cache_set(key: str, value: dict, ttl: int) -> None:
    await get_redis().setex(key, ttl, json.dumps(value))


# ── Invalidation ──────────────────────────────────────────────────────────────

async def invalidate_graph_cache(user_id: str) -> None:
    """Delete all graph cache entries for a user (called on item.ready)."""
    redis = get_redis()
    # Scan-based delete — safe for production (non-blocking, batched)
    cursor = 0
    pattern = f"graph:{user_id}:*"
    while True:
        cursor, keys = await redis.scan(cursor, match=pattern, count=100)
        if keys:
            await redis.delete(*keys)
        if cursor == 0:
            break
