"""Add updated_at and context_item_stubs to chat_sessions

Revision ID: 002
Revises: 001
Create Date: 2026-05-15
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chat_sessions",
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )
    op.add_column(
        "chat_sessions",
        sa.Column("context_item_stubs", postgresql.JSONB, server_default=sa.text("'[]'::jsonb")),
    )
    op.create_index(
        "idx_chat_sessions_user_updated",
        "chat_sessions",
        ["user_id", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_chat_sessions_user_updated")
    op.drop_column("chat_sessions", "context_item_stubs")
    op.drop_column("chat_sessions", "updated_at")
