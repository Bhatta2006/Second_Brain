"""
Per-task async DB session.

Celery tasks call asyncio.run() once each. That creates and tears down a fresh
event loop per call. The global engine in app.database creates its asyncpg pool
on the FIRST loop, so any subsequent task gets "Future attached to a different
loop" errors when it tries to use those pooled connections.

Fix: build a fresh engine + sessionmaker for each task, disposed when the task
exits. NullPool keeps connections per-coroutine — no cross-loop state.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.config import settings


@asynccontextmanager
async def task_session():
    engine = create_async_engine(
        settings.database_url,
        poolclass=NullPool,
        echo=False,
    )
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    try:
        async with factory() as session:
            yield session
    finally:
        await engine.dispose()
