import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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

    # Close Elasticsearch connection
    try:
        from app.search.es_client import close_es_client
        await close_es_client()
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

# ── CORS ──────────────────────────────────────────────────────────────────
# In development, allow all origins to avoid CORS issues.
# In production, restrict to the configured list.
if settings.api_env == "development":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# ── Global exception handler to ensure CORS headers on 500 errors ─────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}: {str(exc)}"},
    )


API_PREFIX = "/api/v1"

app.include_router(health.router)
app.include_router(items.router, prefix=API_PREFIX)
app.include_router(folders.router, prefix=API_PREFIX)
app.include_router(search.router, prefix=API_PREFIX)
app.include_router(graph.router, prefix=API_PREFIX)
