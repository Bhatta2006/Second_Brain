"""
Run once to initialise Neo4j constraints and indexes.
Safe to re-run — all statements use IF NOT EXISTS.

Usage:
    cd apps/api
    python scripts/setup_neo4j_schema.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.graph.neo4j_client import neo4j_client


async def main() -> None:
    print("Setting up Neo4j schema...")
    await neo4j_client.setup_schema()
    await neo4j_client.close()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
