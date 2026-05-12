---
title: Graph API Design
tags: [secondbrain, fastapi, graph-api, neo4j, redis, caching]
status: in-progress
created: 2026-05-11
related:
  - "[[Knowledge-Graph-Implementation]]"
  - "[[Neo4j-Setup-and-Schema]]"
  - "[[Frontend-Graph-Rendering]]"
---

# Graph API Design

## Table of Contents

- [[#1. Routes|Routes]]
- [[#2. Response Shape|Response Shape]]
- [[#3. Full Graph Endpoint|Full Graph Endpoint]]
- [[#4. Ego Graph Endpoint|Ego Graph Endpoint]]
- [[#5. Neighbours Endpoint|Neighbours Endpoint]]
- [[#6. Caching Strategy|Caching Strategy]]
- [[#7. Node Ranking|Node Ranking]]
- [[#8. Weight Filtering|Weight Filtering]]
- [[#9. References|References]]

---

## 1. Routes

All routes prefixed `/api/v1`. JWT auth required on all.

```
GET  /graph                             Full graph for authenticated user
GET  /graph?item_id=&depth=2            Ego graph — neighbourhood of one item
GET  /graph/item/:id/neighbours         Immediate (1-hop) neighbours only
POST /items/:id/link                    Create a USER_LINK edge
DELETE /items/:id/link/:target_id       Remove a USER_LINK edge
```

---

## 2. Response Shape

All graph endpoints return the same JSON shape. The frontend (`react-force-graph`) consumes this directly.

```json
{
  "nodes": [
    {
      "id": "uuid",
      "label": "React Hooks Deep Dive",
      "type": "url",
      "folder": "Programming",
      "folderId": "uuid",
      "tags": ["react", "hooks"],
      "viewCount": 12,
      "isStarred": false,
      "thumbnailUrl": "https://cdn.secondbrain.app/..."
    }
  ],
  "edges": [
    {
      "source": "uuid1",
      "target": "uuid2",
      "type": "semantic",
      "weight": 0.87
    }
  ],
  "meta": {
    "totalNodes": 500,
    "totalEdges": 1240,
    "truncated": true,
    "minWeight": 0.6
  }
}
```

---

## 3. Full Graph Endpoint

Returns the top-500 most connected nodes and all edges between them above the weight threshold.

```python
# packages/api/routers/graph.py

@router.get("/graph")
async def get_full_graph(
    user_id: UUID = Depends(get_current_user),
    min_weight: float = Query(default=0.6, ge=0.0, le=1.0),
    limit: int = Query(default=500, le=1000),
):
    cache_key = f"graph:{user_id}:full:{min_weight}"

    # Check Redis cache first
    cached = await redis.get(cache_key)
    if cached:
        return JSONResponse(json.loads(cached))

    # Query Neo4j
    result = await neo4j_client.run("""
        MATCH (n:Item {userId: $userId})-[r]-(m:Item {userId: $userId})
          WHERE r.weight >= $minWeight AND n.deleted IS NULL AND m.deleted IS NULL
        WITH n, count(r) AS degree
        ORDER BY degree DESC
        LIMIT $limit
        MATCH (n)-[r]-(m:Item {userId: $userId})
          WHERE r.weight >= $minWeight
        RETURN
          collect(DISTINCT {
            id: n.id, label: n.label, type: n.contentType,
            folder: n.folder, folderId: n.folderId,
            tags: n.tags, viewCount: n.viewCount, isStarred: n.isStarred
          }) AS nodes,
          collect(DISTINCT {
            source: startNode(r).id, target: endNode(r).id,
            type: toLower(type(r)), weight: r.weight
          }) AS edges
    """, userId=str(user_id), minWeight=min_weight, limit=limit)

    response = {
        "nodes": result[0]["nodes"],
        "edges": result[0]["edges"],
        "meta": {
            "totalNodes": len(result[0]["nodes"]),
            "totalEdges": len(result[0]["edges"]),
            "truncated": len(result[0]["nodes"]) >= limit,
            "minWeight": min_weight,
        }
    }

    # Cache for 1 hour
    await redis.setex(cache_key, 3600, json.dumps(response))
    return response
```

---

## 4. Ego Graph Endpoint

Used for "Focus mode" — shows the 1–2 hop neighbourhood of a specific item. Also used when a user double-clicks a node in the frontend.

```python
@router.get("/graph")
async def get_ego_graph(
    item_id: UUID = Query(...),
    depth: int = Query(default=2, ge=1, le=3),
    user_id: UUID = Depends(get_current_user),
    min_weight: float = Query(default=0.5),
):
    cache_key = f"graph:{user_id}:{item_id}:{depth}:{min_weight}"

    cached = await redis.get(cache_key)
    if cached:
        return JSONResponse(json.loads(cached))

    result = await neo4j_client.run("""
        MATCH (start:Item {id: $itemId, userId: $userId})
          WHERE start.deleted IS NULL
        MATCH path = (start)-[r*1..$depth]-(neighbour:Item {userId: $userId})
          WHERE ALL(rel IN relationships(path) WHERE rel.weight >= $minWeight)
            AND neighbour.deleted IS NULL
        RETURN
          collect(DISTINCT {
            id: neighbour.id, label: neighbour.label, type: neighbour.contentType,
            folder: neighbour.folder, tags: neighbour.tags,
            viewCount: neighbour.viewCount, isStarred: neighbour.isStarred
          }) + [{
            id: start.id, label: start.label, type: start.contentType,
            folder: start.folder, tags: start.tags,
            viewCount: start.viewCount, isStarred: start.isStarred
          }] AS nodes,
          [r IN relationships(path) |
            {source: startNode(r).id, target: endNode(r).id,
             type: toLower(type(r)), weight: r.weight}
          ] AS edges
    """, itemId=str(item_id), userId=str(user_id),
         depth=depth, minWeight=min_weight)

    response = {
        "nodes": result[0]["nodes"] if result else [],
        "edges": result[0]["edges"] if result else [],
        "meta": {"centreNodeId": str(item_id), "depth": depth}
    }

    # Cache ego graphs for 5 minutes (shorter TTL — more specific, changes more often)
    await redis.setex(cache_key, 300, json.dumps(response))
    return response
```

---

## 5. Neighbours Endpoint

Returns only the direct (1-hop) neighbours of an item. Used in the item detail panel's "Related items" section.

```python
@router.get("/graph/item/{item_id}/neighbours")
async def get_neighbours(
    item_id: UUID,
    user_id: UUID = Depends(get_current_user),
    edge_types: list[str] = Query(default=["semantic", "user_link"]),
):
    type_filter = [t.upper() for t in edge_types]

    result = await neo4j_client.run("""
        MATCH (n:Item {id: $itemId, userId: $userId})-[r]-(m:Item)
          WHERE type(r) IN $types AND m.deleted IS NULL
        RETURN m {.id, .label, .contentType, .folder, .tags, .viewCount},
               {type: toLower(type(r)), weight: r.weight} AS rel
        ORDER BY rel.weight DESC
        LIMIT 20
    """, itemId=str(item_id), userId=str(user_id), types=type_filter)

    return {"neighbours": [
        {**r["m"], "edgeType": r["rel"]["type"], "weight": r["rel"]["weight"]}
        for r in result
    ]}
```

---

## 6. Caching Strategy

| Endpoint | Cache Key | TTL | Invalidation Trigger |
|---|---|---|---|
| Full graph | `graph:{uid}:full:{minWeight}` | 1 hour | `item.ready` event |
| Ego graph | `graph:{uid}:{item_id}:{depth}:{minWeight}` | 5 minutes | `item.ready` or item edit |
| Neighbours | Not cached | — | Real-time from Neo4j |

### Cache invalidation on item.ready

```python
async def invalidate_graph_cache(user_id: str, item_id: str):
    # Delete full graph cache (all weight variants)
    keys = await redis.keys(f"graph:{user_id}:full:*")
    if keys:
        await redis.delete(*keys)

    # Delete ego graph caches that might include this item
    # (Can't know which ego graphs are affected without a full scan)
    # Strategy: delete all ego graph caches for this user on new item
    ego_keys = await redis.keys(f"graph:{user_id}:*")
    if ego_keys:
        await redis.delete(*ego_keys)
```

---

## 7. Node Ranking

When the full graph is truncated to 500 nodes, which 500 are selected matters a lot for graph quality. The ranking uses **degree centrality** — nodes with more edges are more central to the user's knowledge structure and should be shown first.

```cypher
WITH n, count(r) AS degree
ORDER BY degree DESC
LIMIT 500
```

A secondary sort by `viewCount` breaks ties — frequently accessed items are more relevant to the user's current focus.

**Orphan nodes** (items with zero edges above the weight threshold) are excluded from the graph canvas entirely and shown in a separate "Unconnected items" sidebar panel in the frontend.

---

## 8. Weight Filtering

The default `min_weight=0.6` filters out weak connections. The frontend exposes this as a slider so users can reveal or hide weaker connections.

| Weight range | Meaning |
|---|---|
| 0.9 – 1.0 | Very strong — near-duplicate content or explicit user link |
| 0.75 – 0.9 | Strong semantic similarity |
| 0.6 – 0.75 | Moderate similarity — shared concepts |
| 0.3 – 0.6 | Weak — temporal proximity or frequent tags |
| < 0.3 | Noise — filtered out by default |

---

## 9. References

- [FastAPI — Query parameters](https://fastapi.tiangolo.com/tutorial/query-params/)
- [Neo4j — Cypher path matching](https://neo4j.com/docs/cypher-manual/current/patterns/reference/)
- [Redis — SETEX](https://redis.io/commands/setex/)
- [react-force-graph — Data format](https://github.com/vasturiano/react-force-graph#input-json-syntax)

---

*Related notes: [[Knowledge-Graph-Implementation]] · [[Neo4j-Setup-and-Schema]] · [[Frontend-Graph-Rendering]]*
