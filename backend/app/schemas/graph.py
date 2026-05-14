import uuid
from pydantic import BaseModel


class GraphNode(BaseModel):
    id: uuid.UUID
    label: str
    type: str
    folder: str | None = None
    folder_id: uuid.UUID | None = None
    tags: list[str] = []
    view_count: int = 0
    is_starred: bool = False
    thumbnail_url: str | None = None


class GraphEdge(BaseModel):
    source: uuid.UUID
    target: uuid.UUID
    type: str
    weight: float


class GraphMeta(BaseModel):
    total_nodes: int
    total_edges: int
    truncated: bool = False
    min_weight: float = 0.6


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    meta: GraphMeta
