import uuid
import logging
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status

log = logging.getLogger(__name__)
from pydantic import BaseModel
from sqlalchemy import select, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import httpx

from app.deps import get_current_user, get_db_session
from app.models.item import Item
from app.models.chat import ChatSession, ChatMessage
from app import storage

router = APIRouter(prefix="/chat", tags=["chat"])

MAX_FILE_CHARS = 12_000   # per pinned file
MAX_SUMMARY_CHARS = 400   # per auto-retrieved item summary


class ChatRequest(BaseModel):
    provider: Literal["github", "openai", "anthropic", "custom", "gemini"]
    api_key: str
    model: str
    base_url: str = ""
    messages: list[dict]
    context_item_ids: list[str] = []   # user-pinned items


# ── context helpers ────────────────────────────────────────────────────────────

async def _gather_auto_context(
    db: AsyncSession,
    user_id: uuid.UUID,
    user_query: str,
) -> str:
    """Recent + keyword-relevant items (short summaries)."""

    week_ago = datetime.utcnow() - timedelta(days=7)
    recent_q = (
        select(Item)
        .options(selectinload(Item.folder))
        .where(Item.user_id == user_id, Item.deleted_at.is_(None), Item.created_at >= week_ago)
        .order_by(Item.created_at.desc())
        .limit(10)
    )
    recent = list((await db.execute(recent_q)).scalars().all())

    words = [w.strip("?!.,;:") for w in user_query.lower().split() if len(w.strip("?!.,;:")) > 2]
    relevant: list[Item] = []
    if words:
        like_filters = [
            or_(
                Item.title.ilike(f"%{w}%"),
                Item.ai_title.ilike(f"%{w}%"),
                Item.summary.ilike(f"%{w}%"),
            )
            for w in words
        ]
        rel_q = (
            select(Item)
            .options(selectinload(Item.folder))
            .where(Item.user_id == user_id, Item.deleted_at.is_(None), or_(*like_filters))
            .order_by(Item.updated_at.desc())
            .limit(15)
        )
        relevant = list((await db.execute(rel_q)).scalars().all())

    seen: set[uuid.UUID] = set()
    combined: list[Item] = []
    for item in relevant + recent:
        if item.id not in seen:
            seen.add(item.id)
            combined.append(item)
        if len(combined) >= 20:
            break

    if not combined:
        return ""

    def _age(item: Item) -> str:
        delta = datetime.utcnow() - item.created_at.replace(tzinfo=None)
        if delta.days == 0:
            return "today"
        if delta.days == 1:
            return "yesterday"
        if delta.days < 7:
            return f"{delta.days}d ago"
        return item.created_at.strftime("%Y-%m-%d")

    lines = ["## Knowledge base items (auto-retrieved)\n"]
    for item in combined:
        title = item.title or item.ai_title or item.source_url or "Untitled"
        folder = f"📁 {item.folder.name}" if item.folder else "uncategorised"
        tags = " ".join(f"#{t}" for t in (item.tags or []))
        lines.append(f"**{title}** ({item.content_type}, {folder}, saved {_age(item)})")
        if tags:
            lines.append(f"Tags: {tags}")
        if item.source_url:
            lines.append(f"URL: {item.source_url}")
        if item.summary:
            lines.append(item.summary[:MAX_SUMMARY_CHARS])
        lines.append("")

    return "\n".join(lines)


async def _fetch_pinned_context(
    db: AsyncSession,
    user_id: uuid.UUID,
    item_ids: list[str],
) -> str:
    """Full content of user-pinned items."""
    if not item_ids:
        return ""

    try:
        ids = [uuid.UUID(i) for i in item_ids]
    except ValueError:
        return ""

    q = (
        select(Item)
        .options(selectinload(Item.folder))
        .where(Item.user_id == user_id, Item.id.in_(ids), Item.deleted_at.is_(None))
    )
    items = list((await db.execute(q)).scalars().all())
    if not items:
        return ""

    lines = ["## Files added by user as context\n"]
    for item in items:
        title = item.title or item.ai_title or "Untitled"
        lines.append(f"### {title}")

        content = ""
        # Prefer full file text for text/doc items
        if item.storage_key and item.content_type in ("text", "doc"):
            try:
                if storage.file_exists(item.storage_key):
                    raw = storage.read_file(item.storage_key)
                    content = raw.decode("utf-8", errors="ignore")[:MAX_FILE_CHARS]
            except Exception:
                pass

        # Fall back to raw_text extracted by the AI pipeline
        if not content and item.raw_text:
            content = item.raw_text[:MAX_FILE_CHARS]

        # Fall back to summary
        if not content and item.summary:
            content = item.summary

        if item.source_url and not content:
            content = f"URL: {item.source_url}"

        lines.append(content or "(no readable content)")
        lines.append("")

    return "\n".join(lines)


def _build_system_prompt(auto_ctx: str, pinned_ctx: str) -> str:
    parts = [
        "You are a helpful assistant for a personal knowledge management system called SecondBrain. "
        "Help the user find, understand, and connect their saved knowledge.\n"
    ]
    if pinned_ctx:
        parts.append(pinned_ctx)
    if auto_ctx:
        parts.append(auto_ctx)
    if pinned_ctx or auto_ctx:
        parts.append(
            "Answer questions by referencing the user's actual items above by title. "
            "If something isn't in their knowledge base, say so and answer from general knowledge."
        )
    else:
        parts.append("The user has no saved items yet matching this query.")
    return "\n".join(parts)


# ── endpoint ───────────────────────────────────────────────────────────────────

@router.post("")
async def chat_proxy(
    payload: ChatRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    if not payload.api_key:
        raise HTTPException(status_code=400, detail="api_key is required")

    # Normalize messages defensively — a malformed entry missing role/content
    # must not raise a KeyError (which would escape the httpx try/except → 500).
    payload.messages = [
        {"role": m.get("role", "user"), "content": m.get("content", "")}
        for m in payload.messages
        if isinstance(m, dict)
    ]

    last_user_msg = next(
        (m["content"] for m in reversed(payload.messages) if m["role"] == "user"),
        "",
    )

    auto_ctx, pinned_ctx = await _gather_auto_context(db, user_id, last_user_msg), \
                           await _fetch_pinned_context(db, user_id, payload.context_item_ids)

    system_prompt = _build_system_prompt(auto_ctx, pinned_ctx)
    msgs_no_system = [m for m in payload.messages if m["role"] != "system"]

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            if payload.provider == "gemini":
                gemini_contents = []
                for m in msgs_no_system:
                    role = "model" if m["role"] == "assistant" else "user"
                    gemini_contents.append({"role": role, "parts": [{"text": m["content"]}]})
                res = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{payload.model}:generateContent",
                    params={"key": payload.api_key},
                    headers={"Content-Type": "application/json"},
                    json={
                        "system_instruction": {"parts": [{"text": system_prompt}]},
                        "contents": gemini_contents,
                        "generationConfig": {"maxOutputTokens": 2048},
                    },
                )
                res.raise_for_status()
                return {"content": res.json()["candidates"][0]["content"]["parts"][0]["text"]}

            if payload.provider == "anthropic":
                res = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": payload.api_key,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": payload.model,
                        "max_tokens": 2048,
                        "system": system_prompt,
                        "messages": msgs_no_system,
                    },
                )
                res.raise_for_status()
                return {"content": res.json()["content"][0]["text"]}

            if payload.provider == "github":
                base = "https://models.inference.ai.azure.com"
            elif payload.provider == "custom":
                base = payload.base_url.rstrip("/")
            else:
                base = "https://api.openai.com/v1"

            res = await client.post(
                f"{base}/chat/completions",
                headers={
                    "Authorization": f"Bearer {payload.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": payload.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        *msgs_no_system,
                    ],
                },
            )
            res.raise_for_status()
            return {"content": res.json()["choices"][0]["message"]["content"]}

    except httpx.HTTPStatusError as exc:
        detail = f"Provider error {exc.response.status_code}"
        try:
            body = exc.response.json()
            detail = body.get("error", {}).get("message") or body.get("detail") or detail
        except Exception:
            pass
        raise HTTPException(status_code=exc.response.status_code, detail=detail)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Model provider timed out")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ── Chat session CRUD ──────────────────────────────────────────────────────────

class MessageIn(BaseModel):
    role: str
    content: str

class ContextStub(BaseModel):
    id: str
    title: str | None = None
    ai_title: str | None = None

class SessionUpsertRequest(BaseModel):
    title: str | None = None
    messages: list[MessageIn] = []
    context_item_stubs: list[ContextStub] = []

class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: str

class SessionOut(BaseModel):
    id: str
    title: str | None
    messages: list[MessageOut]
    context_item_stubs: list[dict]
    created_at: str
    updated_at: str


def _session_out(s: ChatSession) -> dict:
    return {
        "id": str(s.id),
        "title": s.title,
        "messages": [
            {
                "id": str(m.id),
                "role": m.role,
                "content": m.content,
                "created_at": m.created_at.isoformat(),
            }
            for m in (s.messages or [])
        ],
        "context_item_stubs": s.context_item_stubs or [],
        "created_at": s.created_at.isoformat(),
        "updated_at": s.updated_at.isoformat() if s.updated_at else s.created_at.isoformat(),
    }


@router.get("/sessions")
async def list_sessions(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    q = (
        select(ChatSession)
        .options(selectinload(ChatSession.messages))
        .where(ChatSession.user_id == user_id)
        .order_by(ChatSession.updated_at.desc())
        .limit(50)
    )
    sessions = list((await db.execute(q)).scalars().all())
    return [_session_out(s) for s in sessions]


@router.put("/sessions/{session_id}")
async def upsert_session(
    session_id: uuid.UUID,
    payload: SessionUpsertRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    q = select(ChatSession).where(
        ChatSession.id == session_id, ChatSession.user_id == user_id
    )
    session = (await db.execute(q)).scalar_one_or_none()

    if session is None:
        session = ChatSession(
            id=session_id,
            user_id=user_id,
            title=payload.title,
            context_item_stubs=[s.model_dump() for s in payload.context_item_stubs],
        )
        db.add(session)
        await db.flush()
    else:
        session.title = payload.title
        session.context_item_stubs = [s.model_dump() for s in payload.context_item_stubs]
        session.updated_at = datetime.utcnow()
        await db.execute(
            delete(ChatMessage).where(ChatMessage.session_id == session_id)
        )

    for msg in payload.messages:
        db.add(ChatMessage(session_id=session_id, role=msg.role, content=msg.content))

    await db.commit()

    q2 = (
        select(ChatSession)
        .options(selectinload(ChatSession.messages))
        .where(ChatSession.id == session_id)
    )
    session = (await db.execute(q2)).scalar_one()
    return _session_out(session)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    q = select(ChatSession).where(
        ChatSession.id == session_id, ChatSession.user_id == user_id
    )
    session = (await db.execute(q)).scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()
