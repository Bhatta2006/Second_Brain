"""
LLM connector router — GitHub Copilot device-code OAuth + chat completions.

Endpoints:
  POST /llm/github/connect          — start device-code flow, return user_code + url
  GET  /llm/github/status           — poll: pending | connected | expired
  GET  /llm/github/models           — list available chat models (OAuth token required)
  POST /llm/github/chat             — chat completion (OAuth token required)
  POST /llm/github/disconnect       — remove stored token
  GET  /llm/github/api-key/models   — list models using a raw GitHub PAT / Copilot key
  POST /llm/github/api-key/chat     — chat completion using a raw API key
"""

from __future__ import annotations

import sys
import os

# Allow importing llm_connector from the backend root (backend/app/routers/ → backend/)
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

import threading
import time
from typing import Any

import requests as _req
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from llm_connector import (
    ConnectorConfig,
    TokenStore,
)

router = APIRouter(prefix="/llm", tags=["llm"])

# ---------------------------------------------------------------------------
# Module-level singletons
# ---------------------------------------------------------------------------

_config = ConnectorConfig()
_store = TokenStore(_config)

# In-memory state for the ongoing device-code flow
_device_flow: dict[str, Any] = {}
_device_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_GH_CLIENT_ID = "Iv1.b507a08c87ecfe98"
_GH_DEVICE_CODE_URL = "https://github.com/login/device/code"
_GH_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token"
_GH_COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token"
_GH_MODELS_URL = "https://api.githubcopilot.com/models"
_GH_CHAT_URL = "https://api.githubcopilot.com/chat/completions"

_CHAT_MODEL_KEYWORDS = ("gpt", "claude", "o1", "o3", "mistral", "llama", "gemini", "phi", "codestral")


def _is_chat_model(model_id: str) -> bool:
    lower = model_id.lower()
    return any(k in lower for k in _CHAT_MODEL_KEYWORDS)


def _get_copilot_token(github_token: str) -> str:
    try:
        resp = _req.get(
            _GH_COPILOT_TOKEN_URL,
            headers={"Authorization": f"token {github_token}", "Accept": "application/json"},
            timeout=20,
        )
        if resp.ok:
            tok = resp.json().get("token")
            if tok:
                return tok
    except Exception:
        pass
    return github_token


def _fetch_models(copilot_token: str) -> list[dict]:
    resp = _req.get(
        _GH_MODELS_URL,
        headers={
            "Authorization": f"Bearer {copilot_token}",
            "Accept": "application/json",
            "Copilot-Integration-Id": "vscode-chat",
        },
        timeout=20,
    )
    if not resp.ok:
        raise HTTPException(status_code=resp.status_code, detail=f"GitHub models API: {resp.text[:300]}")
    data = resp.json()
    models_list = data if isinstance(data, list) else data.get("data", data.get("models", []))
    seen: set[str] = set()
    result = []
    for m in models_list:
        if not isinstance(m, dict):
            continue
        mid = m.get("id", m.get("name", ""))
        if mid and _is_chat_model(mid) and mid not in seen:
            seen.add(mid)
            result.append({"id": mid, "name": m.get("name", mid)})
    if not result:
        fallback = ["gpt-4o", "gpt-4o-mini", "gpt-4", "gpt-3.5-turbo", "claude-3.5-sonnet", "o3-mini"]
        result = [{"id": m, "name": m} for m in fallback]
    return result


def _do_chat(copilot_token: str, model: str, messages: list[dict], **kwargs) -> str:
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": kwargs.get("temperature", 0.7),
        "max_tokens": kwargs.get("max_tokens", 4096),
        "stream": False,
    }
    resp = _req.post(
        _GH_CHAT_URL,
        headers={
            "Authorization": f"Bearer {copilot_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Copilot-Integration-Id": "vscode-chat",
            "Editor-Version": "vscode/1.96.0",
            "Editor-Plugin-Version": "copilot-chat/0.24.2",
            "Openai-Organization": "github-copilot",
            "Openai-Intent": "conversation-panel",
        },
        json=body,
        timeout=kwargs.get("timeout", 120),
    )
    if not resp.ok:
        raise HTTPException(status_code=resp.status_code, detail=f"Copilot chat: {resp.text[:500]}")
    choices = resp.json().get("choices", [])
    return choices[0].get("message", {}).get("content", "") if choices else ""


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    model: str
    messages: list[dict[str, str]]
    temperature: float = 0.7
    max_tokens: int = 4096


class ApiKeyChatRequest(BaseModel):
    api_key: str
    model: str
    messages: list[dict[str, str]]
    temperature: float = 0.7
    max_tokens: int = 4096


class ApiKeyModelsRequest(BaseModel):
    api_key: str


# ---------------------------------------------------------------------------
# OAuth device-code endpoints
# ---------------------------------------------------------------------------

@router.post("/github/connect")
def github_connect():
    """Start device-code flow. Returns user_code, verification_uri, expires_in."""
    resp = _req.post(
        _GH_DEVICE_CODE_URL,
        headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
        data={"client_id": _GH_CLIENT_ID, "scope": "read:user copilot"},
        timeout=20,
    )
    if not resp.ok:
        raise HTTPException(status_code=502, detail=f"GitHub device code failed: {resp.status_code}")
    data = resp.json()
    if not data.get("device_code") or not data.get("user_code"):
        raise HTTPException(status_code=502, detail="Missing fields in GitHub device code response")

    with _device_lock:
        _device_flow.clear()
        _device_flow.update({
            "device_code": data["device_code"],
            "interval": data.get("interval", 5),
            "expires_at": time.time() + data.get("expires_in", 900),
            "status": "pending",
        })

    # Start background polling thread
    t = threading.Thread(target=_poll_background, daemon=True)
    t.start()

    return {
        "user_code": data["user_code"],
        "verification_uri": data.get("verification_uri", "https://github.com/login/device"),
        "expires_in": data.get("expires_in", 900),
    }


def _poll_background():
    """Poll GitHub in the background until token received or expiry."""
    while True:
        with _device_lock:
            if _device_flow.get("status") != "pending":
                return
            if time.time() > _device_flow.get("expires_at", 0):
                _device_flow["status"] = "expired"
                return
            device_code = _device_flow["device_code"]
            interval = _device_flow.get("interval", 5)

        time.sleep(interval)

        try:
            resp = _req.post(
                _GH_ACCESS_TOKEN_URL,
                headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
                data={
                    "client_id": _GH_CLIENT_ID,
                    "device_code": device_code,
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                },
                timeout=20,
            )
            if not resp.ok:
                continue
            data = resp.json()
            if "access_token" in data:
                _store.upsert_profile(
                    "github-copilot:github",
                    {"type": "token", "provider": "github", "token": data["access_token"]},
                )
                with _device_lock:
                    _device_flow["status"] = "connected"
                return
            err = data.get("error", "")
            if err in ("expired_token", "access_denied"):
                with _device_lock:
                    _device_flow["status"] = "expired"
                return
        except Exception:
            continue


@router.get("/github/status")
def github_status():
    """Poll connection status: pending | connected | expired | disconnected."""
    token = _store.resolve_token("github")
    if token:
        return {"status": "connected"}

    with _device_lock:
        status = _device_flow.get("status", "disconnected")

    return {"status": status}


@router.post("/github/disconnect")
def github_disconnect():
    """Remove stored GitHub token."""
    profiles = _store.list_profiles_for_provider("github")
    for pid in profiles:
        _store.remove_profile(pid)
    with _device_lock:
        _device_flow.clear()
    return {"ok": True}


# ---------------------------------------------------------------------------
# OAuth-based models + chat
# ---------------------------------------------------------------------------

@router.get("/github/models")
def github_models():
    """List chat models using the stored OAuth token."""
    token = _store.resolve_token("github")
    if not token:
        raise HTTPException(status_code=401, detail="Not connected. Start OAuth flow first.")
    copilot_token = _get_copilot_token(token)
    return {"models": _fetch_models(copilot_token)}


@router.post("/github/chat")
def github_chat(req: ChatRequest):
    """Chat completion using the stored OAuth token."""
    token = _store.resolve_token("github")
    if not token:
        raise HTTPException(status_code=401, detail="Not connected. Start OAuth flow first.")
    copilot_token = _get_copilot_token(token)
    content = _do_chat(copilot_token, req.model, req.messages, temperature=req.temperature, max_tokens=req.max_tokens)
    return {"content": content}


# ---------------------------------------------------------------------------
# API-key based models + chat (existing approach)
# ---------------------------------------------------------------------------

@router.post("/github/api-key/models")
def github_apikey_models(req: ApiKeyModelsRequest):
    """List chat models using a raw GitHub PAT / API key."""
    copilot_token = _get_copilot_token(req.api_key)
    return {"models": _fetch_models(copilot_token)}


@router.post("/github/api-key/chat")
def github_apikey_chat(req: ApiKeyChatRequest):
    """Chat completion using a raw GitHub PAT / API key."""
    copilot_token = _get_copilot_token(req.api_key)
    content = _do_chat(copilot_token, req.model, req.messages, temperature=req.temperature, max_tokens=req.max_tokens)
    return {"content": content}
