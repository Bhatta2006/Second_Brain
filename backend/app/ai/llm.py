"""
LLM calls via GitHub Models (azure-ai-inference SDK).
Classification → openai/gpt-4o
Summarisation  → openai/gpt-4o-mini
"""
from __future__ import annotations

import json
import logging
from azure.ai.inference.aio import ChatCompletionsClient
from azure.ai.inference.models import SystemMessage, UserMessage
from azure.core.credentials import AzureKeyCredential
from app.config import settings

log = logging.getLogger(__name__)


def _new_client() -> ChatCompletionsClient:
    # Per-call clients — caching at module level keeps a dead event loop after
    # asyncio.run() returns, breaking subsequent Celery tasks.
    return ChatCompletionsClient(
        endpoint=settings.github_models_endpoint,
        credential=AzureKeyCredential(settings.github_token),
    )


# ── Classification ────────────────────────────────────────────────────────────

CLASSIFICATION_SYSTEM = """You are an expert personal knowledge organiser.
Given a piece of content, return a JSON object with exactly these fields:
- suggested_folder: array of folder path segments (e.g. ["Learning", "Programming"])
- confidence: float 0–1
- title: concise title (max 60 chars)
- summary: 2–3 sentence plain-English summary
- tags: 3–8 relevant lowercase tags
- entities: { "people": [], "places": [], "organisations": [], "concepts": [] }
- content_type_label: human-readable type (e.g. "Research Article")

Return only valid JSON. No markdown fences. No extra text."""


async def classify_item(
    content_type: str,
    content_text: str,
    folder_tree_json: str = "[]",
) -> dict:
    user_prompt = (
        f"User's existing folder tree: {folder_tree_json}\n"
        f"Content type: {content_type}\n"
        f"Content: {content_text[:2000]}"
    )
    try:
        async with _new_client() as client:
            response = await client.complete(
                model=settings.classification_model,
                messages=[
                    SystemMessage(content=CLASSIFICATION_SYSTEM),
                    UserMessage(content=user_prompt),
                ],
                temperature=0.2,
                max_tokens=512,
            )
        raw = response.choices[0].message.content.strip()
        # Some models still wrap in ```json fences despite the instruction.
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.lower().startswith("json"):
                raw = raw[4:].strip()
        return json.loads(raw)
    except Exception as exc:
        log.warning("classify_item failed: %s", exc)
        return {
            "suggested_folder": ["Miscellaneous"],
            "confidence": 0.0,
            "title": "",
            "summary": "",
            "tags": [],
            "entities": {"people": [], "places": [], "organisations": [], "concepts": []},
            "content_type_label": content_type,
        }


# ── Summarisation ─────────────────────────────────────────────────────────────

async def summarise(text: str, max_sentences: int = 3) -> str:
    try:
        async with _new_client() as client:
            response = await client.complete(
                model=settings.summarisation_model,
                messages=[
                    SystemMessage(
                        content=f"Summarise the following content in {max_sentences} concise sentences. "
                        "Return plain text only, no lists or headers."
                    ),
                    UserMessage(content=text[:4000]),
                ],
                temperature=0.3,
                max_tokens=256,
            )
        return response.choices[0].message.content.strip()
    except Exception as exc:
        log.warning("summarise failed: %s", exc)
        return ""
