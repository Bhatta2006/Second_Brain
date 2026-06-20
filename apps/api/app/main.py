import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.routers import health, items, folders, search, graph, chat, export, agent,settings as settings_router

log = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])


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
    version="0.3.0",
    description="AI-native personal knowledge management",
    docs_url="/docs" if settings.api_env != "production" else None,
    redoc_url="/redoc" if settings.api_env != "production" else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

API_PREFIX = "/api/v1"

app.include_router(health.router)
app.include_router(items.router, prefix=API_PREFIX)
app.include_router(folders.router, prefix=API_PREFIX)
app.include_router(search.router, prefix=API_PREFIX)
app.include_router(graph.router, prefix=API_PREFIX)
app.include_router(chat.router, prefix=API_PREFIX)
app.include_router(export.router, prefix=API_PREFIX)
app.include_router(agent.router, prefix=API_PREFIX)
app.include_router(settings_router.router, prefix=API_PREFIX)
