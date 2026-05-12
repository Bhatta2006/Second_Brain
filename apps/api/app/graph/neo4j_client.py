"""
Async Neo4j client — the authoritative source for graph traversal in Phase 2.

PostgreSQL (pgvector) generates edge scores; this client stores and traverses them.
All writes use MERGE so tasks are idempotent and safe to retry.
"""
from __future__ import annotations

import logging
from typing import Any

from neo4j import AsyncGraphDatabase, AsyncDriver
from app.config import settings

log = logging.getLogger(__name__)


class Neo4jClient:
    """
    Lazy driver — created on first use, recreated when the current asyncio loop
    differs from the one that built the cached driver. This lets the same module
    singleton be used safely from both FastAPI (one long-lived loop) and Celery
    tasks (a new loop per asyncio.run() call).
    """

    def __init__(self) -> None:
        self._driver: AsyncDriver | None = None
        self._loop: Any = None

    def _get_driver(self) -> AsyncDriver:
        import asyncio
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None
        if self._driver is None or self._loop is not current_loop:
            self._driver = AsyncGraphDatabase.driver(
                settings.neo4j_uri,
                auth=(settings.neo4j_user, settings.neo4j_password),
                max_connection_pool_size=50,
            )
            self._loop = current_loop
        return self._driver

    async def close(self) -> None:
        if self._driver is not None:
            try:
                await self._driver.close()
            except Exception:
                pass
            self._driver = None
            self._loop = None

    async def run(self, query: str, **params: Any) -> list[dict]:
        driver = self._get_driver()
        async with driver.session() as session:
            result = await session.run(query, **params)
            return await result.data()

    # ── Schema ────────────────────────────────────────────────────────────────

    async def setup_schema(self) -> None:
        """Create indexes and constraints on first run (idempotent)."""
        stmts = [
            "CREATE CONSTRAINT item_unique IF NOT EXISTS FOR (n:Item) REQUIRE n.id IS UNIQUE",
            "CREATE INDEX item_user IF NOT EXISTS FOR (n:Item) ON (n.userId)",
            "CREATE INDEX item_folder IF NOT EXISTS FOR (n:Item) ON (n.userId, n.folder)",
            "CREATE INDEX item_type IF NOT EXISTS FOR (n:Item) ON (n.userId, n.contentType)",
            "CREATE INDEX semantic_weight IF NOT EXISTS FOR ()-[r:SEMANTIC]-() ON (r.weight)",
        ]
        for stmt in stmts:
            try:
                await self.run(stmt)
            except Exception as exc:
                log.warning("Schema stmt skipped (%s): %s", exc, stmt[:60])
        log.info("Neo4j schema ready")

    # ── Node operations ───────────────────────────────────────────────────────

    async def merge_item(self, item: dict) -> None:
        """Upsert an Item node — idempotent, safe to call on every ingest."""
        await self.run(
            """
            MERGE (n:Item {id: $id})
            SET n.userId      = $userId,
                n.label       = $label,
                n.contentType = $contentType,
                n.folder      = $folder,
                n.folderId    = $folderId,
                n.tags        = $tags,
                n.viewCount   = $viewCount,
                n.isStarred   = $isStarred,
                n.deleted     = false,
                n.createdAt   = datetime($createdAt)
            """,
            **item,
        )

    async def update_item_node(self, item_id: str, **fields: Any) -> None:
        """Partial update of node properties (e.g. after folder change)."""
        set_clause = ", ".join(f"n.{k} = ${k}" for k in fields)
        await self.run(
            f"MATCH (n:Item {{id: $id}}) SET {set_clause}",
            id=item_id,
            **fields,
        )

    async def soft_delete_node(self, item_id: str) -> None:
        await self.run(
            "MATCH (n:Item {id: $id}) SET n.deleted = true",
            id=item_id,
        )

    async def delete_node(self, item_id: str) -> None:
        await self.run(
            "MATCH (n:Item {id: $id}) DETACH DELETE n",
            id=item_id,
        )

    async def delete_user_graph(self, user_id: str) -> None:
        """GDPR erasure — removes all nodes and edges for a user."""
        await self.run(
            "MATCH (n:Item {userId: $userId}) DETACH DELETE n",
            userId=user_id,
        )

    # ── Edge operations ───────────────────────────────────────────────────────

    async def create_semantic_edge(
        self, source_id: str, target_id: str, weight: float
    ) -> None:
        """Bidirectional SEMANTIC relationship from pgvector cosine similarity."""
        await self.run(
            """
            MATCH (a:Item {id: $sourceId}), (b:Item {id: $targetId})
            MERGE (a)-[r:SEMANTIC]->(b)
              SET r.weight = $weight, r.createdAt = datetime()
            MERGE (b)-[r2:SEMANTIC]->(a)
              SET r2.weight = $weight, r2.createdAt = datetime()
            """,
            sourceId=source_id,
            targetId=target_id,
            weight=weight,
        )

    async def create_shared_tag_edge(
        self, source_id: str, target_id: str, tag: str
    ) -> None:
        WEIGHT = 0.6
        await self.run(
            """
            MATCH (a:Item {id: $sourceId}), (b:Item {id: $targetId})
            MERGE (a)-[r:SHARED_TAG {tag: $tag}]->(b)
              SET r.weight = $weight, r.createdAt = datetime()
            MERGE (b)-[r2:SHARED_TAG {tag: $tag}]->(a)
              SET r2.weight = $weight, r2.createdAt = datetime()
            """,
            sourceId=source_id,
            targetId=target_id,
            tag=tag,
            weight=WEIGHT,
        )

    async def create_temporal_edge(
        self,
        source_id: str,
        target_id: str,
        weight: float,
        delta_seconds: int,
    ) -> None:
        """Directed: earlier item → later item."""
        await self.run(
            """
            MATCH (a:Item {id: $sourceId}), (b:Item {id: $targetId})
            MERGE (a)-[r:TEMPORAL]->(b)
              SET r.weight = $weight, r.deltaSeconds = $deltaSec, r.createdAt = datetime()
            """,
            sourceId=source_id,
            targetId=target_id,
            weight=weight,
            deltaSec=delta_seconds,
        )

    async def create_entity_edge(
        self,
        source_id: str,
        target_id: str,
        entity: str,
        entity_type: str,
        weight: float = 0.7,
    ) -> None:
        await self.run(
            """
            MATCH (a:Item {id: $sourceId}), (b:Item {id: $targetId})
            MERGE (a)-[r:ENTITY_MATCH {entity: $entity}]->(b)
              SET r.entityType = $entityType, r.weight = $weight, r.createdAt = datetime()
            MERGE (b)-[r2:ENTITY_MATCH {entity: $entity}]->(a)
              SET r2.entityType = $entityType, r2.weight = $weight, r2.createdAt = datetime()
            """,
            sourceId=source_id,
            targetId=target_id,
            entity=entity,
            entityType=entity_type,
            weight=weight,
        )

    async def create_user_link(
        self, source_id: str, target_id: str, note: str = ""
    ) -> None:
        await self.run(
            """
            MATCH (a:Item {id: $sourceId}), (b:Item {id: $targetId})
            MERGE (a)-[r:USER_LINK]->(b)
              SET r.weight = 1.0, r.note = $note, r.createdAt = datetime()
            """,
            sourceId=source_id,
            targetId=target_id,
            note=note,
        )

    async def delete_user_link(self, source_id: str, target_id: str) -> None:
        await self.run(
            """
            MATCH (a:Item {id: $sourceId})-[r:USER_LINK]->(b:Item {id: $targetId})
            DELETE r
            """,
            sourceId=source_id,
            targetId=target_id,
        )

    async def delete_auto_edges(self, item_id: str) -> None:
        """Remove all non-USER_LINK edges for an item (before recomputing)."""
        await self.run(
            """
            MATCH (n:Item {id: $itemId})-[r]-(m:Item)
            WHERE type(r) IN ['SEMANTIC', 'SHARED_TAG', 'TEMPORAL', 'ENTITY_MATCH']
            DELETE r
            """,
            itemId=item_id,
        )

    # ── Graph queries ─────────────────────────────────────────────────────────

    async def get_full_graph(
        self, user_id: str, min_weight: float = 0.6, limit: int = 500
    ) -> dict:
        """
        All user items (up to `limit`) + edges with weight >= min_weight between them.
        Isolated nodes are included so brand-new users see their content before AI processing.
        """
        node_rows = await self.run(
            """
            MATCH (n:Item {userId: $userId})
            WHERE n.deleted IS NULL OR n.deleted = false
            RETURN {
              id: n.id, label: n.label, type: n.contentType,
              folder: n.folder, folderId: n.folderId,
              tags: n.tags, viewCount: n.viewCount, isStarred: n.isStarred
            } AS node
            ORDER BY n.createdAt DESC
            LIMIT $limit
            """,
            userId=user_id,
            limit=limit,
        )
        nodes = [r["node"] for r in node_rows]
        node_ids = [n["id"] for n in nodes]

        edges: list[dict] = []
        if node_ids:
            edge_rows = await self.run(
                """
                MATCH (a:Item)-[r]-(b:Item)
                WHERE a.id IN $ids AND b.id IN $ids
                  AND r.weight >= $minWeight
                RETURN DISTINCT {
                  source: startNode(r).id,
                  target: endNode(r).id,
                  type: toLower(type(r)),
                  weight: r.weight
                } AS edge
                """,
                ids=node_ids,
                minWeight=min_weight,
            )
            edges = [r["edge"] for r in edge_rows]

        return {"nodes": nodes, "edges": edges}

    async def get_ego_graph(
        self,
        item_id: str,
        user_id: str,
        depth: int = 2,
        min_weight: float = 0.5,
    ) -> dict:
        """BFS neighbourhood of a single node up to `depth` hops."""
        rows = await self.run(
            """
            MATCH (start:Item {id: $itemId, userId: $userId})
            WHERE start.deleted IS NULL OR start.deleted = false
            CALL apoc.path.subgraphAll(start, {
              relationshipFilter: ">",
              maxLevel: $depth,
              labelFilter: "+Item"
            })
            YIELD nodes AS pathNodes, relationships AS rels
            UNWIND pathNodes AS n
            UNWIND rels AS r
            WITH collect(DISTINCT {
              id: n.id, label: n.label, type: n.contentType,
              folder: n.folder, folderId: n.folderId,
              tags: n.tags, viewCount: n.viewCount, isStarred: n.isStarred
            }) AS nodes,
            collect(DISTINCT {
              source: startNode(r).id, target: endNode(r).id,
              type: toLower(type(r)), weight: r.weight
            }) AS edges
            RETURN nodes, edges
            """,
            itemId=item_id,
            userId=user_id,
            depth=depth,
        )
        if not rows:
            # APOC unavailable or no paths — fall back to 1-hop plain Cypher
            return await self._ego_graph_fallback(item_id, user_id, depth, min_weight)
        return {"nodes": rows[0].get("nodes", []), "edges": rows[0].get("edges", [])}

    async def _ego_graph_fallback(
        self, item_id: str, user_id: str, depth: int, min_weight: float
    ) -> dict:
        """Plain Cypher ego-graph without APOC (depth ≤ 3)."""
        rows = await self.run(
            f"""
            MATCH (start:Item {{id: $itemId, userId: $userId}})
            MATCH path = (start)-[r*1..{depth}]-(neighbour:Item {{userId: $userId}})
            WHERE ALL(rel IN relationships(path) WHERE rel.weight >= $minWeight)
              AND (neighbour.deleted IS NULL OR neighbour.deleted = false)
            RETURN
              collect(DISTINCT {{
                id: neighbour.id, label: neighbour.label, type: neighbour.contentType,
                folder: neighbour.folder, tags: neighbour.tags,
                viewCount: neighbour.viewCount, isStarred: neighbour.isStarred
              }}) +
              [{{id: start.id, label: start.label, type: start.contentType,
                folder: start.folder, tags: start.tags,
                viewCount: start.viewCount, isStarred: start.isStarred}}] AS nodes,
              [r IN relationships(path) |
                {{source: startNode(r).id, target: endNode(r).id,
                  type: toLower(type(r)), weight: r.weight}}
              ] AS edges
            """,
            itemId=item_id,
            userId=user_id,
            minWeight=min_weight,
        )
        if not rows:
            return {"nodes": [], "edges": []}
        return {"nodes": rows[0].get("nodes", []), "edges": rows[0].get("edges", [])}

    async def get_neighbours(
        self, item_id: str, user_id: str, edge_types: list[str]
    ) -> list[dict]:
        """1-hop neighbours filtered by edge type. Used in item detail panel."""
        types_upper = [t.upper() for t in edge_types]
        rows = await self.run(
            """
            MATCH (n:Item {id: $itemId, userId: $userId})-[r]-(m:Item)
            WHERE type(r) IN $types
              AND (m.deleted IS NULL OR m.deleted = false)
            RETURN m {.id, .label, .contentType, .folder, .tags, .viewCount},
                   {type: toLower(type(r)), weight: r.weight} AS rel
            ORDER BY rel.weight DESC
            LIMIT 20
            """,
            itemId=item_id,
            userId=user_id,
            types=types_upper,
        )
        return [
            {**r["m"], "edge_type": r["rel"]["type"], "weight": r["rel"]["weight"]}
            for r in rows
        ]

    async def get_node_count(self, user_id: str) -> int:
        rows = await self.run(
            "MATCH (n:Item {userId: $userId}) WHERE n.deleted IS NULL OR n.deleted = false RETURN count(n) AS c",
            userId=user_id,
        )
        return rows[0]["c"] if rows else 0


# Singleton — one driver for the lifetime of the process
neo4j_client = Neo4jClient()
