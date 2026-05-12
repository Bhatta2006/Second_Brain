"""
Full Neo4j rebuild from PostgreSQL — use after Neo4j data corruption or fresh deploy.

Steps:
  1. Clear all Neo4j data
  2. Recreate constraints + indexes
  3. Migrate all non-deleted items (batched UNWIND MERGE)
  4. Migrate all edges from the PostgreSQL edges table (batched)

Estimated time: ~2–3 min per 10k items + 30k edges.

Usage:
    cd apps/api
    python scripts/rebuild_neo4j.py

To target a single user:
    python scripts/rebuild_neo4j.py --user-id <uuid>
"""
from __future__ import annotations

import asyncio
import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import text
from app.database import AsyncSessionLocal
from app.graph.neo4j_client import neo4j_client

BATCH_SIZE = 500


async def rebuild(user_id: str | None = None) -> None:
    user_filter = "AND user_id = :uid::uuid" if user_id else ""
    uid_param: dict = {"uid": user_id} if user_id else {}

    # ── Step 1: Clear ──────────────────────────────────────────────────────
    if user_id:
        print(f"Clearing Neo4j nodes for user {user_id}...")
        await neo4j_client.delete_user_graph(user_id)
    else:
        print("Clearing ALL Neo4j data...")
        await neo4j_client.run("MATCH (n) DETACH DELETE n")

    # ── Step 2: Schema ────────────────────────────────────────────────────
    print("Recreating constraints and indexes...")
    await neo4j_client.setup_schema()

    # ── Step 3: Migrate items ─────────────────────────────────────────────
    print("Migrating items...")
    total_items = 0
    offset = 0

    async with AsyncSessionLocal() as db:
        while True:
            rows = await db.execute(
                text(f"""
                    SELECT
                        id::text          AS id,
                        user_id::text     AS user_id,
                        COALESCE(title, ai_title, 'Untitled') AS label,
                        content_type      AS content_type,
                        folder_id::text   AS folder_id,
                        tags,
                        view_count,
                        is_starred,
                        created_at
                    FROM items
                    WHERE deleted_at IS NULL {user_filter}
                    ORDER BY created_at
                    LIMIT :lim OFFSET :off
                """),
                {**uid_param, "lim": BATCH_SIZE, "off": offset},
            )
            batch = rows.fetchall()
            if not batch:
                break

            items_payload = [
                {
                    "id": r.id,
                    "userId": r.user_id,
                    "label": r.label,
                    "contentType": r.content_type,
                    "folder": "Uncategorised",
                    "folderId": r.folder_id,
                    "tags": r.tags or [],
                    "viewCount": r.view_count,
                    "isStarred": r.is_starred,
                    "createdAt": r.created_at.isoformat(),
                }
                for r in batch
            ]

            await neo4j_client.run(
                """
                UNWIND $items AS item
                MERGE (n:Item {id: item.id})
                SET n += item, n.deleted = false
                """,
                items=items_payload,
            )

            total_items += len(batch)
            offset += BATCH_SIZE
            print(f"  Items migrated: {total_items}")

    # ── Step 4: Migrate edges ─────────────────────────────────────────────
    print("Migrating edges...")
    total_edges = 0
    offset = 0

    async with AsyncSessionLocal() as db:
        while True:
            rows = await db.execute(
                text(f"""
                    SELECT
                        source_id::text AS source_id,
                        target_id::text AS target_id,
                        edge_type,
                        weight
                    FROM edges
                    {f"WHERE user_id = :uid::uuid" if user_id else ""}
                    ORDER BY created_at
                    LIMIT :lim OFFSET :off
                """),
                {**uid_param, "lim": BATCH_SIZE, "off": offset},
            )
            batch = rows.fetchall()
            if not batch:
                break

            edges_payload = [
                {
                    "sourceId": r.source_id,
                    "targetId": r.target_id,
                    "edgeType": r.edge_type.upper(),
                    "weight": r.weight,
                }
                for r in batch
            ]

            # APOC merge.relationship is the cleanest way to do dynamic relationship types
            await neo4j_client.run(
                """
                UNWIND $edges AS e
                MATCH (a:Item {id: e.sourceId}), (b:Item {id: e.targetId})
                CALL apoc.merge.relationship(a, e.edgeType, {}, {weight: e.weight}, b)
                YIELD rel
                RETURN count(rel)
                """,
                edges=edges_payload,
            )

            total_edges += len(batch)
            offset += BATCH_SIZE
            print(f"  Edges migrated: {total_edges}")

    print(f"\nRebuild complete — {total_items} items, {total_edges} edges.")
    await neo4j_client.close()


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Rebuild Neo4j from PostgreSQL")
    p.add_argument("--user-id", default=None, help="Limit rebuild to a single user UUID")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    asyncio.run(rebuild(user_id=args.user_id))
