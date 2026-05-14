"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-05-11
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Extensions (already enabled via init.sql, but idempotent here too)
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "vector"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "pg_trgm"')

    # ── users ──────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String, unique=True, nullable=False),
        sa.Column("display_name", sa.String, nullable=True),
        sa.Column("avatar_url", sa.String, nullable=True),
        sa.Column("plan", sa.String, nullable=False, server_default="free"),
        sa.Column("storage_used", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.CheckConstraint("plan IN ('free','pro','team')", name="ck_user_plan"),
    )

    # ── folders ────────────────────────────────────────────────────────────
    op.create_table(
        "folders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("folders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("emoji", sa.String, nullable=True),
        sa.Column("color", sa.String, nullable=True),
        sa.Column("is_smart", sa.Boolean, server_default="false"),
        sa.Column("smart_filter", postgresql.JSONB, nullable=True),
        sa.Column("ai_generated", sa.Boolean, server_default="false"),
        sa.Column("depth", sa.Integer, server_default="0"),
        sa.Column("item_count", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("user_id", "parent_id", "name", name="uq_folder_user_parent_name"),
        sa.CheckConstraint("depth <= 2", name="ck_folder_max_depth"),
    )
    op.create_index("idx_folders_user", "folders", ["user_id"])

    # ── items ──────────────────────────────────────────────────────────────
    op.create_table(
        "items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("folder_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("folders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String, nullable=True),
        sa.Column("content_type", sa.String, nullable=False),
        sa.Column("source_url", sa.String, nullable=True),
        sa.Column("storage_key", sa.String, nullable=True),
        sa.Column("file_size", sa.BigInteger, nullable=True),
        sa.Column("mime_type", sa.String, nullable=True),
        sa.Column("raw_text", sa.Text, nullable=True),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("ai_title", sa.String, nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.Text), nullable=True),
        sa.Column("entities", postgresql.JSONB, nullable=True),
        sa.Column("metadata", postgresql.JSONB, nullable=True),
        sa.Column("embedding", sa.Text, nullable=True),  # placeholder — vector type added below
        sa.Column("confidence", sa.Float, nullable=True),
        sa.Column("needs_review", sa.Boolean, server_default="false"),
        sa.Column("is_starred", sa.Boolean, server_default="false"),
        sa.Column("view_count", sa.Integer, server_default="0"),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.Column("indexed_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    # Alter embedding column to vector(1536)
    op.execute("ALTER TABLE items DROP COLUMN embedding")
    op.execute("ALTER TABLE items ADD COLUMN embedding vector(1536)")

    op.create_index("idx_items_user_folder", "items", ["user_id", "folder_id"])
    op.create_index("idx_items_created", "items", ["user_id", "created_at"],
                    postgresql_ops={"created_at": "DESC"})
    op.execute(
        "CREATE INDEX idx_items_tags ON items USING GIN(tags)"
    )
    op.execute(
        "CREATE INDEX idx_items_embedding ON items "
        "USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100)"
    )

    # ── edges ──────────────────────────────────────────────────────────────
    op.create_table(
        "edges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("edge_type", sa.String, nullable=False),
        sa.Column("weight", sa.Float, server_default="1.0"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("source_id", "target_id", "edge_type", name="uq_edge"),
        sa.CheckConstraint(
            "edge_type IN ('semantic','shared_tag','user_link','temporal','entity_match')",
            name="ck_edge_type",
        ),
    )
    op.create_index("idx_edges_source", "edges", ["source_id"])
    op.create_index("idx_edges_target", "edges", ["target_id"])
    op.create_index("idx_edges_user", "edges", ["user_id"])

    # ── chat_sessions ───────────────────────────────────────────────────────
    op.create_table(
        "chat_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )

    # ── chat_messages ───────────────────────────────────────────────────────
    op.create_table(
        "chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("session_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("cited_items", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.CheckConstraint("role IN ('user','assistant')", name="ck_message_role"),
    )

    # ── RLS ────────────────────────────────────────────────────────────────
    for table in ("users", "folders", "items", "edges", "chat_sessions", "chat_messages"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in ("chat_messages", "chat_sessions", "edges", "items", "folders", "users"):
        op.drop_table(table)
