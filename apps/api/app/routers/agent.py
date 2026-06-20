"""
Agentic AI router — POST /api/v1/agent

Uses the openai-agents SDK with OpenAIChatCompletionsModel so that ANY
OpenAI-compatible provider works (OpenAI, Anthropic, Gemini, custom endpoints
like moonshotai/Kimi-K2, Ollama, vLLM, etc.).

The agent has 10 tools that let it:
  - Search the knowledge base (keyword + semantic/pgvector)
  - Read full item content
  - Traverse the Neo4j knowledge graph
  - List the folder tree
  - Create new items (triggers full AI pipeline: classify→embed→graph)
  - Update items (rename / retag / move / star)
  - Create folders
  - Link items in the knowledge graph
  - Ask the user a clarifying question (pauses loop, returns SSE question event)
  - Request + execute deletes (double-confirmation safeguard with signed token)

Streaming: Server-Sent Events (SSE) via sse-starlette.
Every tool call, tool result, agent thought, and final answer is streamed
as a typed JSON event so the frontend can show a live activity feed.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
import hmac
import hashlib
from datetime import datetime, timedelta
from typing import AsyncIterator, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, or_, and_, func, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sse_starlette.sse import EventSourceResponse

# openai-agents SDK
from agents import Agent, Runner, function_tool, set_tracing_disabled
from agents.models.openai_chatcompletions import OpenAIChatCompletionsModel
from openai import AsyncOpenAI

from app.deps import get_current_user, get_db_session
from app.models.item import Item
from app.models.folder import Folder
from app.graph.neo4j_client import neo4j_client
from app.config import settings
from app import storage

# Disable built-in tracing (phones home to OpenAI; we use custom endpoints)
set_tracing_disabled(True)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])

# ─── Token secret for delete confirmation ────────────────────────────────────
_DELETE_SECRET = settings.supabase_jwt_secret or "secondbrain-delete-secret-fallback"
_DELETE_TOKEN_TTL = 90  # seconds


# ─── Pydantic models ─────────────────────────────────────────────────────────

class AgentMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AgentRequest(BaseModel):
    provider: Literal["github", "openai", "anthropic", "gemini", "custom"]
    api_key: str
    model: str
    base_url: str = ""
    messages: list[AgentMessage]
    context_item_ids: list[str] = []
    session_id: str = ""


# ─── SSE event helpers ───────────────────────────────────────────────────────

def _sse(event_type: str, payload: dict) -> dict:
    return {"event": event_type, "data": json.dumps(payload)}


# ─── Delete token helpers ────────────────────────────────────────────────────

def _make_delete_token(user_id: str, item_ids: list[str], folder_ids: list[str]) -> str:
    expires = int(time.time()) + _DELETE_TOKEN_TTL
    body = json.dumps({"uid": user_id, "items": item_ids, "folders": folder_ids, "exp": expires})
    sig = hmac.new(_DELETE_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    import base64
    return base64.urlsafe_b64encode(f"{body}||{sig}".encode()).decode()


def _verify_delete_token(token: str, user_id: str) -> tuple[list[str], list[str]] | None:
    """Returns (item_ids, folder_ids) if valid, else None."""
    try:
        import base64
        decoded = base64.urlsafe_b64decode(token.encode()).decode()
        body, sig = decoded.rsplit("||", 1)
        expected_sig = hmac.new(_DELETE_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None
        data = json.loads(body)
        if data["uid"] != user_id:
            return None
        if int(time.time()) > data["exp"]:
            return None
        return data["items"], data["folders"]
    except Exception:
        return None


# ─── Provider → base URL mapping ─────────────────────────────────────────────

def _resolve_base_url(provider: str, base_url: str) -> str:
    if provider == "github":
        return "https://models.inference.ai.azure.com"
    if provider == "openai":
        return "https://api.openai.com/v1"
    if provider == "anthropic":
        # Anthropic is OpenAI-compat via their beta endpoint
        return "https://api.anthropic.com/v1"
    if provider == "gemini":
        return "https://generativelanguage.googleapis.com/v1beta/openai"
    # custom
    return base_url.rstrip("/") if base_url else "https://api.openai.com/v1"


# ─── Tool factory (closures capture db + user_id) ───────────────────────────

def _build_tools(db: AsyncSession, user_id: uuid.UUID, pending_question: dict, pending_delete: dict):
    """
    Returns a list of agent tools. We use closures so each tool automatically
    has access to the DB session and user context without passing them explicitly
    (the agents SDK calls tools with only the LLM-provided arguments).
    """

    # ── Tool 1: search_knowledge ─────────────────────────────────────────────

    @function_tool
    async def search_knowledge(
        query: str,
        content_type: str | None = None,
        folder_id: str | None = None,
        tags: list[str] | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        limit: int = 10,
    ) -> str:
        """
        Search the user's personal knowledge base using both keyword matching
        and semantic (vector) similarity. Returns the most relevant items
        with their title, summary, folder, tags, and content type.
        Always call this first to find relevant knowledge before answering.
        """
        filters = [Item.user_id == user_id, Item.deleted_at.is_(None)]

        if query:
            filters.append(or_(
                Item.title.ilike(f"%{query}%"),
                Item.ai_title.ilike(f"%{query}%"),
                Item.summary.ilike(f"%{query}%"),
                Item.raw_text.ilike(f"%{query}%"),
            ))
        if content_type:
            filters.append(Item.content_type == content_type)
        if folder_id:
            try:
                filters.append(Item.folder_id == uuid.UUID(folder_id))
            except ValueError:
                pass
        if tags:
            filters.append(Item.tags.overlap(tags))
        if date_from:
            try:
                filters.append(Item.created_at >= datetime.fromisoformat(date_from))
            except ValueError:
                pass
        if date_to:
            try:
                filters.append(Item.created_at <= datetime.fromisoformat(date_to))
            except ValueError:
                pass

        rows = (await db.execute(
            select(Item)
            .options(selectinload(Item.folder))
            .where(and_(*filters))
            .order_by(Item.updated_at.desc())
            .limit(min(limit, 20))
        )).scalars().all()

        # Also try semantic search if embeddings available
        semantic_results: list[Item] = []
        try:
            from app.ai.embeddings import embed_text
            query_vec = await embed_text(query)
            sem_rows = (await db.execute(
                select(Item)
                .options(selectinload(Item.folder))
                .where(
                    Item.user_id == user_id,
                    Item.deleted_at.is_(None),
                    Item.embedding.is_not(None),
                )
                .order_by(Item.embedding.cosine_distance(query_vec))
                .limit(min(limit, 10))
            )).scalars().all()
            semantic_results = list(sem_rows)
        except Exception as e:
            log.debug("Semantic search skipped: %s", e)

        # Merge: keyword results first, then semantic (de-dup by id)
        seen: set[uuid.UUID] = set()
        combined: list[Item] = []
        for item in list(rows) + semantic_results:
            if item.id not in seen:
                seen.add(item.id)
                combined.append(item)
            if len(combined) >= limit:
                break

        if not combined:
            return json.dumps({"total": 0, "items": [], "message": "No items found matching your query."})

        items_out = []
        for item in combined:
            items_out.append({
                "id": str(item.id),
                "title": item.title or item.ai_title or "Untitled",
                "summary": (item.summary or "")[:300],
                "content_type": item.content_type,
                "folder": item.folder.name if item.folder else None,
                "folder_id": str(item.folder_id) if item.folder_id else None,
                "tags": item.tags or [],
                "is_starred": item.is_starred,
                "created_at": item.created_at.isoformat(),
                "source_url": item.source_url,
            })

        return json.dumps({"total": len(items_out), "items": items_out})

    # ── Tool 2: get_item_detail ───────────────────────────────────────────────

    @function_tool
    async def get_item_detail(item_id: str) -> str:
        """
        Retrieve the full content and all metadata of a specific knowledge base
        item by its ID. Use this after search_knowledge to read the full text
        of an item before summarizing, analyzing, or quoting it.
        """
        try:
            iid = uuid.UUID(item_id)
        except ValueError:
            return json.dumps({"error": "Invalid item ID format"})

        q = (
            select(Item)
            .options(selectinload(Item.folder))
            .where(Item.id == iid, Item.user_id == user_id, Item.deleted_at.is_(None))
        )
        item = (await db.execute(q)).scalar_one_or_none()
        if not item:
            return json.dumps({"error": "Item not found"})

        # Read full file content if available
        full_text = ""
        if item.storage_key and item.content_type in ("text", "doc"):
            try:
                if storage.file_exists(item.storage_key):
                    raw = storage.read_file(item.storage_key)
                    full_text = raw.decode("utf-8", errors="ignore")[:8000]
            except Exception:
                pass
        if not full_text and item.raw_text:
            full_text = item.raw_text[:8000]

        return json.dumps({
            "id": str(item.id),
            "title": item.title or item.ai_title or "Untitled",
            "ai_title": item.ai_title,
            "summary": item.summary,
            "content_type": item.content_type,
            "full_text": full_text or "(no text content)",
            "folder": item.folder.name if item.folder else None,
            "folder_id": str(item.folder_id) if item.folder_id else None,
            "tags": item.tags or [],
            "entities": item.entities or {},
            "source_url": item.source_url,
            "is_starred": item.is_starred,
            "confidence": item.confidence,
            "created_at": item.created_at.isoformat(),
            "updated_at": item.updated_at.isoformat(),
        })

    # ── Tool 3: get_graph_neighbours ──────────────────────────────────────────

    @function_tool
    async def get_graph_neighbours(
        item_id: str,
        edge_types: list[str] | None = None,
        depth: int = 1,
    ) -> str:
        """
        Traverse the knowledge graph to find items connected to a given item.
        Edge types: 'semantic' (AI-similarity), 'shared_tag', 'entity_match',
        'user_link' (manually linked). Use depth=2 for broader exploration.
        Returns connected items with their relationship type and strength.
        """
        if not settings.use_neo4j_graph:
            return json.dumps({"error": "Knowledge graph not enabled"})

        edge_types = edge_types or ["semantic", "shared_tag", "entity_match", "user_link"]

        try:
            if depth <= 1:
                neighbours = await neo4j_client.get_neighbours(
                    item_id, str(user_id), edge_types
                )
                return json.dumps({"item_id": item_id, "neighbours": neighbours[:20]})
            else:
                graph = await neo4j_client.get_ego_graph(
                    item_id, str(user_id), depth=min(depth, 2), min_weight=0.4
                )
                return json.dumps({"item_id": item_id, "graph": graph})
        except Exception as e:
            log.warning("Graph query failed: %s", e)
            return json.dumps({"error": f"Graph query failed: {str(e)}"})

    # ── Tool 4: list_folders ──────────────────────────────────────────────────

    @function_tool
    async def list_folders() -> str:
        """
        List all folders in the user's knowledge base as a tree.
        Returns folder IDs, names, emoji, item counts, and nesting structure.
        Always call this before creating items in a folder or moving items.
        """
        q = select(Folder).where(Folder.user_id == user_id).order_by(Folder.depth, Folder.name)
        all_folders = (await db.execute(q)).scalars().all()

        counts_q = (
            select(Item.folder_id, func.count(Item.id))
            .where(Item.user_id == user_id, Item.deleted_at.is_(None), Item.folder_id.is_not(None))
            .group_by(Item.folder_id)
        )
        counts = dict((await db.execute(counts_q)).all())

        def _serialize(folder: Folder) -> dict:
            return {
                "id": str(folder.id),
                "name": folder.name,
                "emoji": folder.emoji,
                "color": folder.color,
                "depth": folder.depth,
                "parent_id": str(folder.parent_id) if folder.parent_id else None,
                "item_count": counts.get(folder.id, 0),
                "is_smart": folder.is_smart,
            }

        return json.dumps({
            "total": len(all_folders),
            "folders": [_serialize(f) for f in all_folders],
        })

    # ── Tool 5: create_item ───────────────────────────────────────────────────

    @function_tool
    async def create_item(
        title: str,
        content: str,
        folder_id: str | None = None,
        tags: list[str] | None = None,
        source_url: str | None = None,
    ) -> str:
        """
        Save a new text note or summary to the knowledge base.
        The item will be automatically classified, embedded, and added to the
        knowledge graph (full AI pipeline runs in background).
        Use list_folders first to find the correct folder_id.
        """
        fid: uuid.UUID | None = None
        if folder_id:
            try:
                fid = uuid.UUID(folder_id)
                # Validate folder belongs to user
                folder = (await db.execute(
                    select(Folder).where(Folder.id == fid, Folder.user_id == user_id)
                )).scalar_one_or_none()
                if not folder:
                    fid = None
            except ValueError:
                fid = None

        user_tags = [t.strip().lower() for t in (tags or []) if t.strip()]

        item = Item(
            user_id=user_id,
            folder_id=fid,
            title=title.strip(),
            content_type="text",
            raw_text=content,
            tags=user_tags,
            source_url=source_url,
            metadata_={"user_set_tags": bool(user_tags), "created_by_agent": True},
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)

        # Trigger full AI pipeline: classify → embed → Neo4j graph edges
        from app.tasks.ai_processing import process_item
        process_item.delay(str(item.id), str(user_id))

        return json.dumps({
            "success": True,
            "item_id": str(item.id),
            "title": item.title,
            "folder_id": str(fid) if fid else None,
            "status": "processing",
            "message": "Item created. AI classification, embedding, and graph linking running in background.",
        })

    # ── Tool 6: update_item ───────────────────────────────────────────────────

    @function_tool
    async def update_item(
        item_id: str,
        title: str | None = None,
        folder_id: str | None = None,
        move_to_root: bool = False,
        tags: list[str] | None = None,
        is_starred: bool | None = None,
    ) -> str:
        """
        Update an existing item: rename it, move it to a different folder,
        change its tags, or star/unstar it. To move to root/uncategorized,
        set move_to_root=true. Use list_folders to find folder IDs.
        """
        try:
            iid = uuid.UUID(item_id)
        except ValueError:
            return json.dumps({"error": "Invalid item ID"})

        q = select(Item).options(selectinload(Item.folder)).where(
            Item.id == iid, Item.user_id == user_id, Item.deleted_at.is_(None)
        )
        item = (await db.execute(q)).scalar_one_or_none()
        if not item:
            return json.dumps({"error": "Item not found"})

        if title is not None:
            item.title = title.strip()
        if move_to_root:
            item.folder_id = None
        elif folder_id is not None:
            try:
                fid = uuid.UUID(folder_id)
                folder = (await db.execute(
                    select(Folder).where(Folder.id == fid, Folder.user_id == user_id)
                )).scalar_one_or_none()
                if folder:
                    item.folder_id = fid
            except ValueError:
                pass
        if tags is not None:
            item.tags = [t.strip().lower() for t in tags if t.strip()]
        if is_starred is not None:
            item.is_starred = is_starred

        item.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(item)

        return json.dumps({
            "success": True,
            "item_id": str(item.id),
            "title": item.title or item.ai_title,
            "folder": item.folder.name if item.folder else None,
            "tags": item.tags or [],
            "is_starred": item.is_starred,
        })

    # ── Tool 7: create_folder ─────────────────────────────────────────────────

    @function_tool
    async def create_folder(
        name: str,
        parent_id: str | None = None,
        emoji: str | None = None,
        color: str | None = None,
    ) -> str:
        """
        Create a new folder in the user's knowledge base. Maximum 3 levels deep.
        Use list_folders to find the parent_id if you need a nested folder.
        Returns the new folder's ID which you can use in create_item or update_item.
        """
        depth = 0
        pid: uuid.UUID | None = None

        if parent_id:
            try:
                pid = uuid.UUID(parent_id)
                parent = (await db.execute(
                    select(Folder).where(Folder.id == pid, Folder.user_id == user_id)
                )).scalar_one_or_none()
                if parent:
                    depth = parent.depth + 1
                    if depth > 2:
                        return json.dumps({"error": "Maximum folder depth is 3 levels"})
                else:
                    pid = None
            except ValueError:
                pid = None

        folder = Folder(
            user_id=user_id,
            parent_id=pid,
            name=name.strip(),
            emoji=emoji,
            color=color,
            depth=depth,
        )
        db.add(folder)
        await db.commit()
        await db.refresh(folder)

        return json.dumps({
            "success": True,
            "folder_id": str(folder.id),
            "name": folder.name,
            "emoji": folder.emoji,
            "depth": folder.depth,
            "parent_id": str(pid) if pid else None,
        })

    # ── Tool 8: link_items ────────────────────────────────────────────────────

    @function_tool
    async def link_items(source_item_id: str, target_item_id: str) -> str:
        """
        Create a manual link (USER_LINK edge) between two items in the knowledge
        graph. This makes them appear connected in the graph view.
        Both items must belong to the user. Use search_knowledge to find item IDs.
        """
        from app.models.edge import Edge
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        try:
            src_id = uuid.UUID(source_item_id)
            tgt_id = uuid.UUID(target_item_id)
        except ValueError:
            return json.dumps({"error": "Invalid item ID format"})

        if src_id == tgt_id:
            return json.dumps({"error": "Cannot link an item to itself"})

        # Validate both items belong to user
        for iid in [src_id, tgt_id]:
            item = (await db.execute(
                select(Item).where(Item.id == iid, Item.user_id == user_id, Item.deleted_at.is_(None))
            )).scalar_one_or_none()
            if not item:
                return json.dumps({"error": f"Item {iid} not found"})

        stmt = (
            pg_insert(Edge)
            .values(user_id=user_id, source_id=src_id, target_id=tgt_id, edge_type="user_link", weight=1.0)
            .on_conflict_do_nothing(constraint="uq_edge")
        )
        await db.execute(stmt)
        await db.commit()

        if settings.use_neo4j_graph:
            try:
                await neo4j_client.create_user_link(str(src_id), str(tgt_id))
            except Exception as e:
                log.warning("Neo4j link write failed: %s", e)

        return json.dumps({"success": True, "linked": [str(src_id), str(tgt_id)]})

    # ── Tool 9: ask_user ──────────────────────────────────────────────────────

    @function_tool
    async def ask_user(
        question: str,
        options: list[str] | None = None,
        context: str | None = None,
    ) -> str:
        """
        Ask the user a clarifying question before proceeding with an action.
        Use this when the user's intent is ambiguous — e.g. which folder to use,
        which items to include, or to confirm a significant batch operation.
        Provide 2-4 options when helpful. The loop will pause until the user answers.
        """
        # Signal to the outer generator to pause and emit a question event
        pending_question["active"] = True
        pending_question["question"] = question
        pending_question["options"] = options or []
        pending_question["context"] = context or ""
        # Return a sentinel that the agent loop will detect
        return json.dumps({
            "__question__": True,
            "question": question,
            "options": options or [],
            "context": context or "",
        })

    # ── Tool 10a: request_delete_confirmation ─────────────────────────────────

    @function_tool
    async def request_delete_confirmation(
        item_ids: list[str] | None = None,
        folder_ids: list[str] | None = None,
        reason: str = "",
    ) -> str:
        """
        Request user confirmation before deleting items or folders.
        ALWAYS call this before any delete — never delete directly.
        Provide the IDs of what you want to delete and a clear reason why.
        The user must explicitly confirm in the UI before deletion proceeds.
        Returns a delete_token that you must pass to execute_delete after confirmation.
        """
        item_ids = item_ids or []
        folder_ids = folder_ids or []

        if not item_ids and not folder_ids:
            return json.dumps({"error": "Provide at least one item_id or folder_id to delete"})

        # Validate all items/folders belong to user and gather metadata
        items_meta = []
        for iid_str in item_ids:
            try:
                iid = uuid.UUID(iid_str)
                item = (await db.execute(
                    select(Item).where(Item.id == iid, Item.user_id == user_id, Item.deleted_at.is_(None))
                )).scalar_one_or_none()
                if item:
                    items_meta.append({
                        "id": str(item.id),
                        "title": item.title or item.ai_title or "Untitled",
                        "content_type": item.content_type,
                        "created_at": item.created_at.isoformat(),
                    })
            except ValueError:
                pass

        folders_meta = []
        for fid_str in folder_ids:
            try:
                fid = uuid.UUID(fid_str)
                folder = (await db.execute(
                    select(Folder).where(Folder.id == fid, Folder.user_id == user_id)
                )).scalar_one_or_none()
                if folder:
                    folders_meta.append({
                        "id": str(folder.id),
                        "name": folder.name,
                    })
            except ValueError:
                pass

        if not items_meta and not folders_meta:
            return json.dumps({"error": "None of the specified items/folders were found"})

        # Generate a signed delete token (90s TTL)
        token = _make_delete_token(
            str(user_id),
            [m["id"] for m in items_meta],
            [m["id"] for m in folders_meta],
        )

        # Signal the UI to show the delete confirmation card
        pending_delete["active"] = True
        pending_delete["items"] = items_meta
        pending_delete["folders"] = folders_meta
        pending_delete["reason"] = reason
        pending_delete["token"] = token

        return json.dumps({
            "__delete_confirmation__": True,
            "items": items_meta,
            "folders": folders_meta,
            "reason": reason,
            "delete_token": token,
            "message": "Delete confirmation request sent to user. Wait for user to confirm via the UI.",
        })

    # ── Tool 10b: execute_delete ──────────────────────────────────────────────

    @function_tool
    async def execute_delete(delete_token: str) -> str:
        """
        Execute a previously confirmed delete using the delete_token from
        request_delete_confirmation. Only call this after the user has confirmed
        the deletion in the UI and provided the token back to you.
        The token is signed and expires after 90 seconds.
        """
        result = _verify_delete_token(delete_token, str(user_id))
        if result is None:
            return json.dumps({"error": "Invalid or expired delete token. The user must re-confirm."})

        item_ids_to_delete, folder_ids_to_delete = result
        deleted_items = 0
        deleted_folders = 0

        for iid_str in item_ids_to_delete:
            try:
                iid = uuid.UUID(iid_str)
                item = (await db.execute(
                    select(Item).where(Item.id == iid, Item.user_id == user_id, Item.deleted_at.is_(None))
                )).scalar_one_or_none()
                if item:
                    item.deleted_at = datetime.utcnow()
                    deleted_items += 1
                    if settings.use_neo4j_graph:
                        try:
                            await neo4j_client.soft_delete_node(str(iid))
                        except Exception:
                            pass
            except ValueError:
                pass

        for fid_str in folder_ids_to_delete:
            try:
                fid = uuid.UUID(fid_str)
                folder = (await db.execute(
                    select(Folder).where(Folder.id == fid, Folder.user_id == user_id)
                )).scalar_one_or_none()
                if folder:
                    await db.delete(folder)
                    deleted_folders += 1
            except ValueError:
                pass

        await db.commit()

        return json.dumps({
            "success": True,
            "deleted_items": deleted_items,
            "deleted_folders": deleted_folders,
            "message": f"Permanently deleted {deleted_items} item(s) and {deleted_folders} folder(s).",
        })

    return [
        search_knowledge,
        get_item_detail,
        get_graph_neighbours,
        list_folders,
        create_item,
        update_item,
        create_folder,
        link_items,
        ask_user,
        request_delete_confirmation,
        execute_delete,
    ]


# ─── System prompt builder ───────────────────────────────────────────────────

def _build_system_prompt(context_snippets: str) -> str:
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    return f"""You are SecondBrain AI — an intelligent assistant built into the user's personal knowledge management system.

Current time: {now}

You have full access to the user's knowledge base through the tools provided. You can:
- Search for items (keyword + semantic similarity across all saved content)
- Read full item content to analyze or summarize it
- Traverse the knowledge graph to find connections between items
- Create new notes and save them (triggers automatic AI classification + embedding)
- Organize items: rename, retag, move to folders, star
- Create new folders to organize knowledge
- Link items together in the knowledge graph
- Ask the user clarifying questions when intent is ambiguous
- Delete items/folders (requires explicit user confirmation — always use request_delete_confirmation first)

IMPORTANT RULES:
1. ALWAYS search first before answering questions about the user's knowledge.
2. If the user asks you to do something to "my notes" or "my items" without specifying which ones, use search_knowledge to find them first.
3. Before creating an item in a folder, use list_folders to get the correct folder ID.
4. NEVER call execute_delete without first calling request_delete_confirmation and receiving user approval.
5. When referencing items in your final answer, include their title in **bold** and mention their folder.
6. If you need clarification (e.g., which folder, how many items, date range), use ask_user.
7. Be concise and action-oriented. Show what you did, not just what you found.

{context_snippets}"""


# ─── Main SSE generator ──────────────────────────────────────────────────────

async def _agent_stream(
    payload: AgentRequest,
    db: AsyncSession,
    user_id: uuid.UUID,
) -> AsyncIterator[dict]:
    """
    Core agent loop. Yields SSE-formatted dicts.

    Event types emitted:
      - "status"   : agent is starting, thinking, etc.
      - "tool_call": agent is calling a tool
      - "tool_result": tool returned a result
      - "question" : agent called ask_user — frontend shows a question card
      - "delete_confirm": agent called request_delete_confirmation
      - "delta"    : streaming token from the final answer
      - "answer"   : full final answer + list of cited item IDs
      - "error"    : something went wrong
    """

    # Validate API key
    if not payload.api_key:
        yield _sse("error", {"message": "No API key provided. Configure your model settings."})
        return

    # Build the LLM client
    base_url = _resolve_base_url(payload.provider, payload.base_url)
    try:
        openai_client = AsyncOpenAI(base_url=base_url, api_key=payload.api_key)
        model = OpenAIChatCompletionsModel(
            model=payload.model,
            openai_client=openai_client,
        )
    except Exception as e:
        yield _sse("error", {"message": f"Failed to initialize model client: {str(e)}"})
        return

    # Pending state dicts — tools write into these; generator reads them
    pending_question: dict = {"active": False}
    pending_delete: dict = {"active": False}

    # Build tools (closures over db + user_id)
    tools = _build_tools(db, user_id, pending_question, pending_delete)

    # Gather any pinned context items
    pinned_ctx = ""
    if payload.context_item_ids:
        try:
            ids = [uuid.UUID(i) for i in payload.context_item_ids]
            pinned_items = (await db.execute(
                select(Item)
                .options(selectinload(Item.folder))
                .where(Item.user_id == user_id, Item.id.in_(ids), Item.deleted_at.is_(None))
            )).scalars().all()
            if pinned_items:
                lines = ["## User-pinned context items\n"]
                for item in pinned_items:
                    lines.append(f"### {item.title or item.ai_title or 'Untitled'}")
                    content = ""
                    if item.storage_key and item.content_type in ("text", "doc"):
                        try:
                            if storage.file_exists(item.storage_key):
                                raw = storage.read_file(item.storage_key)
                                content = raw.decode("utf-8", errors="ignore")[:6000]
                        except Exception:
                            pass
                    if not content and item.raw_text:
                        content = item.raw_text[:6000]
                    if not content and item.summary:
                        content = item.summary
                    lines.append(content or "(no readable content)")
                    lines.append("")
                pinned_ctx = "\n".join(lines)
        except Exception as e:
            log.warning("Failed to load pinned context: %s", e)

    system_prompt = _build_system_prompt(pinned_ctx)

    # Build the agent
    agent = Agent(
        name="SecondBrain",
        instructions=system_prompt,
        tools=tools,
        model=model,
    )

    # Build input: last user message (Agent SDK manages its own history per run)
    # For multi-turn, we pass full conversation history as the input string
    # by formatting it as a conversation block.
    history_parts = []
    for msg in payload.messages[:-1]:  # all but last
        prefix = "User" if msg.role == "user" else "Assistant"
        history_parts.append(f"{prefix}: {msg.content}")

    last_user_msg = next(
        (m.content for m in reversed(payload.messages) if m.role == "user"), ""
    )

    if history_parts:
        full_input = (
            "Previous conversation:\n"
            + "\n".join(history_parts)
            + f"\n\nUser: {last_user_msg}"
        )
    else:
        full_input = last_user_msg

    yield _sse("status", {"message": "Agent starting…"})

    # ── Streamed run ─────────────────────────────────────────────────────────
    cited_item_ids: list[str] = []
    final_answer = ""

    try:
        result = Runner.run_streamed(agent, input=full_input, max_turns=8)

        async for event in result.stream_events():
            event_type = type(event).__name__

            # Raw LLM token delta
            if event_type == "RawResponsesStreamEvent":
                try:
                    inner = event.data
                    if hasattr(inner, "type"):
                        if inner.type == "response.output_text.delta":
                            delta = getattr(inner, "delta", "")
                            if delta:
                                final_answer += delta
                                yield _sse("delta", {"text": delta})
                except Exception:
                    pass

            # RunItem events — tool calls, tool results, final message
            elif event_type == "RunItemStreamEvent":
                item_ev = event.item

                # Tool call initiated by LLM
                if hasattr(item_ev, "type") and item_ev.type == "tool_call_item":
                    tool_name = getattr(item_ev, "name", "unknown")
                    raw_args = getattr(item_ev, "arguments", "{}")
                    try:
                        args_display = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                    except Exception:
                        args_display = {}
                    yield _sse("tool_call", {"tool": tool_name, "args": args_display})

                # Tool result returned
                elif hasattr(item_ev, "type") and item_ev.type == "tool_call_output_item":
                    raw_output = getattr(item_ev, "output", "{}")
                    try:
                        output_data = json.loads(raw_output) if isinstance(raw_output, str) else raw_output
                    except Exception:
                        output_data = {"raw": str(raw_output)}

                    # Extract cited item IDs from search results
                    if isinstance(output_data, dict) and "items" in output_data:
                        for it in output_data.get("items", []):
                            if isinstance(it, dict) and "id" in it:
                                iid = it["id"]
                                if iid not in cited_item_ids:
                                    cited_item_ids.append(iid)

                    # Check if the tool triggered a pending question
                    if pending_question.get("active"):
                        pending_question["active"] = False
                        yield _sse("question", {
                            "question": pending_question["question"],
                            "options": pending_question["options"],
                            "context": pending_question["context"],
                        })
                        # Stop the stream — frontend will resume
                        break

                    # Check if the tool triggered a delete confirmation
                    if pending_delete.get("active"):
                        pending_delete["active"] = False
                        yield _sse("delete_confirm", {
                            "items": pending_delete["items"],
                            "folders": pending_delete["folders"],
                            "reason": pending_delete["reason"],
                            "delete_token": pending_delete["token"],
                        })

                    yield _sse("tool_result", {
                        "result": output_data,
                        "summary": _summarize_tool_result(output_data),
                    })

                # Final message item
                elif hasattr(item_ev, "type") and item_ev.type == "message_output_item":
                    for content_block in getattr(item_ev, "content", []):
                        if hasattr(content_block, "text"):
                            final_answer = content_block.text

        # Emit the complete final answer
        if final_answer:
            yield _sse("answer", {
                "content": final_answer,
                "cited_item_ids": cited_item_ids,
            })

    except Exception as e:
        log.error("Agent run failed: %s", e, exc_info=True)
        yield _sse("error", {"message": f"Agent error: {str(e)}"})

    yield _sse("done", {})


def _summarize_tool_result(data: dict) -> str:
    """Generate a human-readable one-liner for the tool feed."""
    if not isinstance(data, dict):
        return "Done"
    if data.get("error"):
        return f"⚠️ {data['error']}"
    if "items" in data:
        n = data.get("total", len(data.get("items", [])))
        return f"Found {n} item(s)"
    if data.get("success"):
        return data.get("message", "Success")
    if "neighbours" in data:
        n = len(data.get("neighbours", []))
        return f"Found {n} connected item(s)"
    if "folders" in data:
        n = data.get("total", len(data.get("folders", [])))
        return f"Found {n} folder(s)"
    if data.get("__question__"):
        return "Asking user for clarification"
    if data.get("__delete_confirmation__"):
        return "Delete confirmation requested"
    return "Done"


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("")
async def agent_chat(
    payload: AgentRequest,
    request: Request,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Agentic chat endpoint. Returns a Server-Sent Events stream.
    The agent autonomously searches, creates, organizes, and links knowledge
    using the 10 built-in tools.
    """

    async def event_generator():
        async for event in _agent_stream(payload, db, user_id):
            # Respect client disconnect
            if await request.is_disconnected():
                break
            yield event

    return EventSourceResponse(event_generator())


# ─── Delete confirmation execute endpoint ─────────────────────────────────────
# Called by the frontend AFTER the user types "DELETE" and clicks confirm.
# This endpoint validates the token and is called independently of the SSE stream.

class DeleteConfirmRequest(BaseModel):
    delete_token: str


@router.post("/confirm-delete")
async def confirm_delete(
    payload: DeleteConfirmRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Execute a previously requested delete after explicit user confirmation.
    The delete_token must be valid and not expired (90s TTL).
    """
    result = _verify_delete_token(payload.delete_token, str(user_id))
    if result is None:
        raise HTTPException(status_code=400, detail="Invalid or expired delete token")

    item_ids, folder_ids = result
    deleted_items = 0
    deleted_folders = 0

    for iid_str in item_ids:
        try:
            iid = uuid.UUID(iid_str)
            item = (await db.execute(
                select(Item).where(Item.id == iid, Item.user_id == user_id, Item.deleted_at.is_(None))
            )).scalar_one_or_none()
            if item:
                item.deleted_at = datetime.utcnow()
                deleted_items += 1
                if settings.use_neo4j_graph:
                    try:
                        await neo4j_client.soft_delete_node(str(iid))
                    except Exception:
                        pass
        except ValueError:
            pass

    for fid_str in folder_ids:
        try:
            fid = uuid.UUID(fid_str)
            folder = (await db.execute(
                select(Folder).where(Folder.id == fid, Folder.user_id == user_id)
            )).scalar_one_or_none()
            if folder:
                await db.delete(folder)
                deleted_folders += 1
        except ValueError:
            pass

    await db.commit()

    return {
        "success": True,
        "deleted_items": deleted_items,
        "deleted_folders": deleted_folders,
        "message": f"Permanently deleted {deleted_items} item(s) and {deleted_folders} folder(s).",
    }
