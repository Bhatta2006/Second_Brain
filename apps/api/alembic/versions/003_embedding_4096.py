"""Switch embedding column to 4096-dim (Nebius Qwen3-Embedding-8B)

Qwen3-Embedding-8B produces 4096-dim vectors. The old column was vector(1536)
for openai/text-embedding-3-large. The two are not comparable, so existing
embeddings are dropped here — every item must be re-embedded with the new model
(see app.tasks.reembed.reembed_all). Items themselves are untouched.

Note: pgvector ANN indexes (ivfflat / hnsw) cap at 2000 dimensions, so the
old idx_items_embedding index is dropped and NOT recreated. Vector search falls
back to an exact sequential scan, which is fine at personal-KB scale.

Revision ID: 003
Revises: 002
"""
from typing import Union

from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ANN index can't exist on a >2000-dim column.
    op.execute("DROP INDEX IF EXISTS idx_items_embedding")
    # Recreate the column at the new dimension (clears all existing vectors).
    op.execute("ALTER TABLE items DROP COLUMN IF EXISTS embedding")
    op.execute("ALTER TABLE items ADD COLUMN embedding vector(4096)")
    # All items now need re-embedding — clear indexed_at so it's obvious which
    # rows still carry a stale "processed" timestamp.
    op.execute("UPDATE items SET indexed_at = NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE items DROP COLUMN IF EXISTS embedding")
    op.execute("ALTER TABLE items ADD COLUMN embedding vector(1536)")
    op.execute(
        "CREATE INDEX idx_items_embedding ON items "
        "USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100)"
    )
