---
title: pgvector — Edge Generation
tags: [secondbrain, pgvector, embeddings, edge-generation, celery]
status: in-progress
created: 2026-05-11
related:
  - "[[Knowledge-Graph-Implementation]]"
  - "[[Neo4j-Setup-and-Schema]]"
  - "[[Dual-DB-Sync-Strategy]]"
---

# pgvector — Edge Generation

## Table of Contents

- [[#1. Role of pgvector|Role of pgvector]]
- [[#2. Embedding Strategy|Embedding Strategy]]
- [[#3. Semantic Edge Generation|Semantic Edge Generation]]
- [[#4. Shared Tag Edge Logic|Shared Tag Edge Logic]]
- [[#5. Temporal Edge Logic|Temporal Edge Logic]]
- [[#6. Entity Match Edge Logic|Entity Match Edge Logic]]
- [[#7. Full Celery Task|Full Celery Task]]
- [[#8. Re-computation on Item Edit|Re-computation on Item Edit]]
- [[#9. References|References]]

---

## 1. Role of pgvector

pgvector is a PostgreSQL extension that adds a `vector` column type and approximate nearest-neighbour (ANN) search via `ivfflat` or `hnsw` indexes. In SecondBrain it has one job: **find the most semantically similar items to a newly ingested item**, so those pairs can become `SEMANTIC` edges in Neo4j.

pgvector does not talk to Neo4j. The Celery worker queries pgvector, receives similar item IDs with scores, and then writes both to the `edges` table (Phase 1 compatibility) and to Neo4j relationships (Phase 2).

---

## 2. Embedding Strategy

| Field | Value |
|---|---|
| Model | `text-embedding-3-large` (OpenAI) |
| Dimensions | 1536 |
| Index type | `ivfflat` with `vector_cosine_ops` |
| Index lists | 100 (rule of thumb: `sqrt(row_count)`) |
| Input to embed | `title + summary + raw_text[:2000] + tags joined` |
| Re-embed trigger | User edits tags or manual notes |

```sql
-- Column definition on items table
embedding vector(1536)

-- Index
CREATE INDEX idx_items_embedding ON items
  USING ivfflat(embedding vector_cosine_ops)
  WITH (lists = 100);
```

**Why ivfflat over hnsw?** ivfflat is faster to build and uses less memory. hnsw has better recall but significantly higher memory usage. At the item counts SecondBrain targets in Phase 2 (< 100k items per user), ivfflat is sufficient. Revisit hnsw at 1M+ items.

---

## 3. Semantic Edge Generation

Runs inside the Celery `ingest_item` task, after the embedding is stored.

```python
# packages/ai/tasks/edge_generation.py
from app.db import get_pg_session
from app.graph.neo4j_client import neo4j_client

SEMANTIC_THRESHOLD = 0.75
SEMANTIC_TOP_K = 5

async def generate_semantic_edges(item_id: str, user_id: str, embedding: list[float]):
    async with get_pg_session() as db:
        # Find top-K similar items above threshold
        rows = await db.execute("""
            SELECT id, 1 - (embedding <=> :emb) AS score
            FROM items
            WHERE user_id = :user_id
              AND id != :item_id
              AND 1 - (embedding <=> :emb) > :threshold
            ORDER BY embedding <=> :emb
            LIMIT :k
        """, {
            "emb": str(embedding),
            "user_id": user_id,
            "item_id": item_id,
            "threshold": SEMANTIC_THRESHOLD,
            "k": SEMANTIC_TOP_K,
        })
        similar = rows.fetchall()

    for row in similar:
        target_id, score = row.id, row.score

        # Phase 1 compat: write to PostgreSQL edges table
        await db.execute("""
            INSERT INTO edges (user_id, source_id, target_id, edge_type, weight)
            VALUES (:uid, :src, :tgt, 'semantic', :w)
            ON CONFLICT DO NOTHING
        """, {"uid": user_id, "src": item_id, "tgt": target_id, "w": score})

        # Phase 2: write to Neo4j
        await neo4j_client.create_semantic_edge(item_id, target_id, score)
```

### Why cap at top-5?

Without a cap, popular-topic items (e.g. anything about "machine learning") become gravity wells — every new item links to them, and the graph collapses into a star topology. Five edges per item keeps the graph structure interesting and avoids layout degeneration.

### Why 0.75 threshold?

At 0.75 cosine similarity on `text-embedding-3-large`, items are genuinely topically related — not just using overlapping vocabulary. Below 0.60 you get noise. Between 0.60–0.75 is a grey zone worth revisiting after you have real user data.

---

## 4. Shared Tag Edge Logic

Tag edges are only created for **rare tags** — tags that appear on fewer than 15% of the user's total items. Frequent tags like "programming" or "ai" don't generate individual edges; they instead become cluster labels used for the convex hull overlay in the frontend.

```python
SHARED_TAG_FREQUENCY_THRESHOLD = 0.15  # skip tags on >15% of user's items

async def generate_shared_tag_edges(item_id: str, user_id: str, tags: list[str]):
    async with get_pg_session() as db:
        total_items = await db.scalar(
            "SELECT COUNT(*) FROM items WHERE user_id = :uid", {"uid": user_id}
        )
        max_tag_count = int(total_items * SHARED_TAG_FREQUENCY_THRESHOLD)

        for tag in tags:
            # Count how many items have this tag
            tag_count = await db.scalar("""
                SELECT COUNT(*) FROM items
                WHERE user_id = :uid AND :tag = ANY(tags)
            """, {"uid": user_id, "tag": tag})

            if tag_count > max_tag_count:
                continue  # Too frequent — skip

            # Find other items with this tag
            rows = await db.execute("""
                SELECT id FROM items
                WHERE user_id = :uid
                  AND :tag = ANY(tags)
                  AND id != :item_id
            """, {"uid": user_id, "tag": tag, "item_id": item_id})

            for row in rows.fetchall():
                await neo4j_client.create_shared_tag_edge(item_id, row.id, tag)
```

---

## 5. Temporal Edge Logic

Temporal edges link items that were saved close together in time **and** are part of a dense save burst. Isolated pairs (two items saved 20 minutes apart, nothing else that day) do not get temporal edges — the signal is too weak.

### Burst detection

```python
import math
from datetime import timedelta

BURST_WINDOW_MINUTES = 30
BURST_MIN_ITEMS = 3
TEMPORAL_MAX_EDGES = 3
TEMPORAL_MAX_DELTA_SECONDS = 3600  # 1 hour hard cap

def temporal_weight(delta_seconds: int) -> float:
    """Exponential decay — weight 0.5 at 0s, ~0.25 at 30min, ~0 at 60min."""
    return 0.5 * math.exp(-delta_seconds / 1800)

async def generate_temporal_edges(item_id: str, user_id: str, created_at: datetime):
    async with get_pg_session() as db:
        window_start = created_at - timedelta(minutes=BURST_WINDOW_MINUTES)
        window_end   = created_at + timedelta(minutes=BURST_WINDOW_MINUTES)

        # Find items in the burst window
        rows = await db.execute("""
            SELECT id, created_at,
              ABS(EXTRACT(EPOCH FROM (created_at - :ts))) AS delta_seconds
            FROM items
            WHERE user_id = :uid
              AND id != :item_id
              AND created_at BETWEEN :start AND :end
            ORDER BY delta_seconds ASC
        """, {
            "uid": user_id, "item_id": item_id,
            "ts": created_at, "start": window_start, "end": window_end,
        })
        burst_items = rows.fetchall()

        # Only proceed if burst is dense enough
        if len(burst_items) < BURST_MIN_ITEMS - 1:
            return  # Not enough items in window

        # Link to TEMPORAL_MAX_EDGES nearest neighbours in burst
        for row in burst_items[:TEMPORAL_MAX_EDGES]:
            delta = int(row.delta_seconds)
            if delta > TEMPORAL_MAX_DELTA_SECONDS:
                break
            weight = temporal_weight(delta)
            if weight < 0.1:
                break
            await neo4j_client.create_temporal_edge(item_id, row.id, weight, delta)
```

---

## 6. Entity Match Edge Logic

Items sharing named entities (extracted by Claude during classification) get connected. Entity data lives in the `entities` JSONB column: `{people: [], places: [], organisations: [], concepts: []}`.

```python
ENTITY_MATCH_WEIGHT = 0.7

async def generate_entity_edges(item_id: str, user_id: str, entities: dict):
    all_entities = (
        entities.get("people", []) +
        entities.get("organisations", []) +
        entities.get("concepts", [])
    )
    # Skip generic concepts that would create too many edges
    # e.g. "software", "technology", "research" — apply same frequency filter as tags

    async with get_pg_session() as db:
        for entity in all_entities:
            rows = await db.execute("""
                SELECT id FROM items
                WHERE user_id = :uid
                  AND id != :item_id
                  AND entities @> :entity_query
            """, {
                "uid": user_id,
                "item_id": item_id,
                "entity_query": json.dumps({"concepts": [entity]}),
            })
            for row in rows.fetchall():
                await neo4j_client.create_entity_edge(item_id, row.id, entity, ENTITY_MATCH_WEIGHT)
```

---

## 7. Full Celery Task

```python
# packages/ai/tasks/ingest.py (Step 5 — graph edges)

@celery_app.task(bind=True, max_retries=3)
async def generate_all_edges(self, item_id: str, user_id: str):
    try:
        async with get_pg_session() as db:
            item = await db.get(Item, item_id)

        # Ensure Neo4j node exists for this item
        await neo4j_client.merge_item({
            "id": item.id,
            "userId": item.user_id,
            "label": item.title,
            "contentType": item.content_type,
            "folder": item.folder.name if item.folder else "Uncategorised",
            "folderId": str(item.folder_id) if item.folder_id else None,
            "tags": item.tags or [],
            "viewCount": item.view_count,
            "isStarred": item.is_starred,
            "createdAt": item.created_at.isoformat(),
        })

        # Generate all edge types in parallel
        await asyncio.gather(
            generate_semantic_edges(item.id, user_id, item.embedding),
            generate_shared_tag_edges(item.id, user_id, item.tags),
            generate_temporal_edges(item.id, user_id, item.created_at),
            generate_entity_edges(item.id, user_id, item.entities or {}),
        )

    except Exception as exc:
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
```

---

## 8. Re-computation on Item Edit

When a user edits tags or notes on an item, existing edges may be stale. A lightweight Celery task handles this:

```python
@celery_app.task
async def recompute_edges(item_id: str, user_id: str):
    """Re-runs edge generation after item update. Deletes stale edges first."""
    # Delete existing non-user-link edges for this item in Neo4j
    await neo4j_client.run("""
        MATCH (n:Item {id: $itemId})-[r]-(m:Item)
        WHERE type(r) IN ['SEMANTIC', 'SHARED_TAG', 'TEMPORAL', 'ENTITY_MATCH']
        DELETE r
    """, itemId=item_id)

    # Re-run generation
    await generate_all_edges(item_id, user_id)
```

**Triggers for `recompute_edges`:**
- User edits tags on an item (`PATCH /items/:id`)
- User edits manual notes (which re-embeds the item)
- User moves item to a different folder (updates `folder` property on Neo4j node)

---

## 9. References

- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [pgvector — Choosing index type](https://github.com/pgvector/pgvector#ivfflat-vs-hnsw)
- [OpenAI text-embedding-3-large](https://platform.openai.com/docs/guides/embeddings)
- [Celery task retry strategies](https://docs.celeryq.dev/en/stable/userguide/tasks.html#retrying)

---

*Related notes: [[Knowledge-Graph-Implementation]] · [[Neo4j-Setup-and-Schema]] · [[Dual-DB-Sync-Strategy]]*
