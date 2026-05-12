import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import health, items, folders, search, graph

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────
    if settings.use_neo4j_graph:
        try:
            from app.graph.neo4j_client import neo4j_client
            await neo4j_client.setup_schema()
            log.info("Neo4j schema initialised")
        except Exception as exc:
            # Non-fatal — graph view degrades gracefully if Neo4j is slow to start
            log.warning("Neo4j schema setup failed (will retry on next request): %s", exc)

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────
    if settings.use_neo4j_graph:
        try:
            from app.graph.neo4j_client import neo4j_client
            await neo4j_client.close()
        except Exception:
            pass


app = FastAPI(
    title="SecondBrain API",
    version="0.2.0",
    description="AI-native personal knowledge management — Phase 2 (Neo4j graph)",
    docs_url="/docs" if settings.api_env != "production" else None,
    redoc_url="/redoc" if settings.api_env != "production" else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

app.include_router(health.router)
app.include_router(items.router, prefix=API_PREFIX)
app.include_router(folders.router, prefix=API_PREFIX)
app.include_router(search.router, prefix=API_PREFIX)
app.include_router(graph.router, prefix=API_PREFIX)
