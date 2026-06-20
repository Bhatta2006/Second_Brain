import uuid
from datetime import datetime
from sqlalchemy import String, BigInteger, Boolean, Integer, Float, ForeignKey, text, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY, TEXT
from pgvector.sqlalchemy import Vector
from app.database import Base


class Item(Base):
    __tablename__ = "items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    folder_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("folders.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    content_type: Mapped[str] = mapped_column(String, nullable=False)
    source_url: Mapped[str | None] = mapped_column(String, nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String, nullable=True)
    file_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String, nullable=True)
    raw_text: Mapped[str | None] = mapped_column(TEXT, nullable=True)
    summary: Mapped[str | None] = mapped_column(TEXT, nullable=True)
    ai_title: Mapped[str | None] = mapped_column(String, nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(TEXT), nullable=True)
    entities: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    # Dimension must match settings.embedding_dim. Qwen3-Embedding-8B = 4096.
    embedding: Mapped[list[float] | None] = mapped_column(Vector(4096), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    is_starred: Mapped[bool] = mapped_column(Boolean, default=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    deleted_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()"), onupdate=datetime.utcnow
    )
    indexed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="items")
    folder: Mapped["Folder | None"] = relationship("Folder", back_populates="items")
    source_edges: Mapped[list["Edge"]] = relationship(
        "Edge", foreign_keys="Edge.source_id", back_populates="source"
    )
    target_edges: Mapped[list["Edge"]] = relationship(
        "Edge", foreign_keys="Edge.target_id", back_populates="target"
    )
