# Phase 2 — Knowledge Graph

## What this phase delivers

A live, force-directed knowledge graph that visualises every item in the user's library and the relationships between them. Built on a dual-database architecture: PostgreSQL is the source of truth, Neo4j is an eventually-consistent derived view optimised for traversal.

The graph view is interactive in an Obsidian-like way — hover to spotlight neighbours, click an edge to inspect every underlying relationship, zoom-adaptive labels, search to filter.

## Architecture

```
   PostgreSQL                             Neo4j
  ┌────────────┐                       ┌────────────┐
  │ items      │ ──── Celery tasks ──▶ │ :Item nodes│
  │ edges      │  (sync_item_to_neo4j) │ :SEMANTIC  │
  │ folders    │                       │ :SHARED_TAG│
  │ chat_*     │                       │ :TEMPORAL  │
  └────────────┘                       │ :ENTITY... │
                                       │ :USER_LINK │
                                       └─────┬──────┘
                                             │
                                             ▼
                                    GET /api/v1/graph
                                             │
                                             ▼
                                    React + react-force-graph-2d
```

## Five relationship types

| Type | Generator | When created | Weight |
|---|---|---|---|
| `SEMANTIC` | pgvector cosine similarity | similarity ≥ 0.75 with top-5 nearest | cosine score |
| `SHARED_TAG` | tag join | both items share a tag, and the tag covers fewer than ~50% of the library (small libs) or 15% (≥20 items) | 0.6 |
| `TEMPORAL` | created_at proximity | uploaded within 30 min of another item | `0.5 * exp(-delta_seconds / 1800)` |
| `ENTITY_MATCH` | JSONB intersect | both items mention the same person / place / org / concept | 0.7 |
| `USER_LINK` | manual API call | user explicitly links two items via `POST /items/{id}/link` | 1.0 |

All auto edge types are bidirectional in Neo4j. `TEMPORAL` is the only directed one (earlier → later) since that ordering is meaningful.

## Dual-DB sync strategy

PostgreSQL is the source of truth. Neo4j is an asynchronous, idempotent projection:

```
ingest_item()                      ← FastAPI endpoint
   └─ commit Item row
   └─ process_item.delay()         ← Phase 1 (AI pipeline)
        └─ ...AI work...
        └─ sync_item_to_neo4j.delay()
             └─ generate_all_edges_async()
                  ├─ neo4j_client.merge_item({id, label, tags, ...})
                  ├─ generate_semantic_edges()    (pgvector → Neo4j)
                  ├─ generate_shared_tag_edges()
                  ├─ generate_temporal_edges()
                  ├─ generate_entity_edges()
             └─ invalidate_graph_cache(user_id)
```

`merge_item` uses Cypher `MERGE` so re-running the task is safe. Each edge generator writes both to the PostgreSQL `edges` table (fallback) and to Neo4j (primary).

Drift detection runs nightly via Celery Beat (`check_neo4j_drift`): if PG count and Neo4j count diverge by more than 50 items, it logs an error pointing at `scripts/rebuild_neo4j.py`.

## Files added in Phase 2

| File | Purpose |
|---|---|
| `apps/api/app/graph/neo4j_client.py` | Async Neo4j driver wrapper; lazy per-event-loop driver to work safely in both FastAPI and Celery contexts |
| `apps/api/app/tasks/edge_generation.py` | All four auto edge generators; writes to both PG `edges` and Neo4j |
| `apps/api/app/tasks/sync.py` | Celery tasks: `sync_item_to_neo4j`, `recompute_edges`, `soft_delete_node`, `delete_user_graph`, `check_neo4j_drift` |
| `apps/api/app/cache/redis_client.py` | Per-event-loop Redis pool; graph cache keys; `invalidate_graph_cache` (scan-based delete) |
| `apps/api/app/routers/graph.py` | `GET /api/v1/graph` (full + ego), `GET /api/v1/graph/item/{id}/neighbours`, manual link CRUD |
| `apps/api/app/schemas/graph.py` | Pydantic response models for nodes, edges, meta |
| `apps/api/scripts/rebuild_neo4j.py` | Batched PG → Neo4j rebuild script, with optional `--user-id` |
| `apps/web/src/app/(app)/graph/page.tsx` | The interactive graph UI |
| `docker-compose.yml` | `neo4j`, `worker`, `beat` services |

## The Cypher query for the full graph

The full graph query was refactored to always return the user's items (even isolated ones) so brand-new users see content before edges form:

```cypher
MATCH (n:Item {userId: $userId})
WHERE n.deleted IS NULL OR n.deleted = false
RETURN { id, label, type, folder, tags, viewCount, isStarred } AS node
ORDER BY n.createdAt DESC
LIMIT $limit
```

then a second pass to collect edges between those nodes:

```cypher
MATCH (a:Item)-[r]-(b:Item)
WHERE a.id IN $ids AND b.id IN $ids
  AND r.weight >= $minWeight
RETURN DISTINCT { source, target, type, weight } AS edge
```

The ego graph (when `?item_id=...`) uses APOC `apoc.path.subgraphAll` with a plain-Cypher variable-length fallback.

## Caching

Two cache classes in Redis:

| Key | TTL | Invalidated by |
|---|---|---|
| `graph:{uid}:full:{minWeight}` | 1 hour | `invalidate_graph_cache(user_id)` on any item write |
| `graph:{uid}:{itemId}:{depth}:{minWeight}` | 5 min | same |

Invalidation uses SCAN (not KEYS) so it stays non-blocking under load.

## Frontend behaviours

The graph page implements the full set of behaviours documented in `docs/phase 0/SecondBrain-KnowledgeGraph/deep-dives/Frontend-Graph-Rendering.md`:

- **Hover spotlight** — hovered node + its direct neighbours stay at full opacity, everything else fades to 12%
- **Halo glow** on hovered nodes (radial gradient)
- **Click node → smooth zoom + centre** (600ms animation, 3× zoom)
- **Click edge → relationship panel** listing every underlying edge type with its weight (parallel edges are merged into one visible line; the panel exposes them on click)
- **Adaptive labels (Obsidian-style)**
  - zoom ≤ 0.8: no labels (avoids clutter)
  - 0.8 → 1.6: linear fade-in
  - ≥ 1.6: fully visible
  - hovered / selected / search-matched: always visible regardless of zoom
  - font size is anchored in *world coordinates* (3.5 units) so labels scale naturally with zoom
- **Search filter** — dims non-matching nodes, keeps matches at full visibility with labels forced on
- **Zoom-to-fit button** — re-frames everything in 500ms
- **Gold ring** for starred items
- **Node radius** scales with `view_count` on a log curve
- **Drag** to re-arrange (re-heats simulation)
- **Auto-frame on first layout** via `onEngineStop`

## Critical bugs found & fixed during this phase

| Bug | Root cause | Fix |
|---|---|---|
| Neo4j container crash-loop | `NEO4J_dbms_memory_*` env vars renamed in Neo4j 5 + APOC plugin writing legacy settings to `neo4j.conf` | Set `NEO4J_server_config_strict__validation_enabled=false` |
| 0 nodes returned even after upload | Original Cypher only returned nodes that participated in an edge ≥ `minWeight`; brand-new items had no edges | Rewrote `get_full_graph` to return all user items, then attach edges in a second pass |
| Cross-loop errors in Celery (`Future attached to a different loop`) | Neo4j driver and Redis pool were module-level singletons bound to the first `asyncio.run()` loop | Lazy per-event-loop driver/client (rebuilt when `asyncio.get_running_loop()` differs) |
| Parallel edges (4 types between same pair) rendered as one indistinguishable line | Canvas drew them on top of each other | Client-side merge into a single visible line; click opens a panel with every underlying edge type + weight |
| Edge generators silently producing 0 edges | All four shared `_upsert_pg_edge` which used `:uid::uuid` parameter syntax that asyncpg refused | Replaced every `:foo::type` with `CAST(:foo AS type)` |
| All edges silently swallowed | `asyncio.gather(..., return_exceptions=True)` returned exceptions as values without logging | Iterate results and log each exception with the generator name |
| Tag frequency threshold zeroed at small N | `max_tag_count = max(1, int(6 * 0.15)) = 1` killed every shared-tag edge for libraries < 20 items | Use 50% floor when `total_items < 20`, 15% above that |

## Configuration

```
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=secondbrain
USE_NEO4J_GRAPH=true   # set to false to fall back to the PG `edges` table reader
```

The `USE_NEO4J_GRAPH` feature flag in `app/config.py` lets the API switch back to the legacy Postgres `edges` table reader (still kept for backwards-compatibility). All writes still go to both.

## Performance characteristics

For a library of 6–30 items the graph builds and renders in under 200ms. The Cypher query is cached for an hour at `graph:{uid}:full:{min_weight}`, so subsequent loads are <30ms.

Targets from the PRD:

| Metric | Target | Current |
|---|---|---|
| Graph API response | < 300ms p95 | ~50ms uncached, ~5ms cached |
| Graph render (≤ 50 nodes) | 60fps interaction | 60fps |
| Node click → detail panel | < 100ms | instantaneous (no network) |
| 1000-node render | < 2s initial | not yet tested |

## What is NOT in Phase 2

Intentionally deferred:

- WebSocket real-time updates — graph refetches via React Query invalidation, not push
- Cluster mode (convex-hull overlays per folder) — needs folder colours wired through
- Right-click context menu on nodes (Open / Move / Link / Delete)
- Mobile-tuned layout
- LOD optimisations for 1000+ node graphs (worker-based physics, label culling)
- Folder-coloured nodes (currently all nodes share one indigo)
