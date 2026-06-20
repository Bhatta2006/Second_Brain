"""
App settings — read-only view of embedding config + a re-embed trigger.

Embeddings are app-wide infrastructure (one shared pgvector column), so the
model is configured via environment, not per-user. This router lets the UI show
the active config and kick off a re-embed of the signed-in user's items after a
model switch.
"""
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import settings as app_settings
from app.deps import get_current_user

router = APIRouter(prefix="/settings", tags=["settings"])


class EmbeddingConfig(BaseModel):
    provider: str
    model: str
    dimensions: int
    base_url: str | None = None


@router.get("/embedding", response_model=EmbeddingConfig)
async def get_embedding_config(
    user_id: uuid.UUID = Depends(get_current_user),
):
    """Active embedding configuration (no secrets)."""
    is_github = app_settings.embedding_provider.lower() == "github"
    return EmbeddingConfig(
        provider=app_settings.embedding_provider,
        model=app_settings.embedding_model,
        dimensions=app_settings.embedding_dim,
        base_url=None if is_github else app_settings.embedding_base_url,
    )


class ReembedResponse(BaseModel):
    task_id: str
    status: str = "started"


@router.post("/embedding/reembed", response_model=ReembedResponse)
async def trigger_reembed(
    user_id: uuid.UUID = Depends(get_current_user),
):
    """Re-embed all of the current user's items with the active model."""
    from app.tasks.reembed import reembed_all
    result = reembed_all.delay(str(user_id))
    return ReembedResponse(task_id=result.id)
