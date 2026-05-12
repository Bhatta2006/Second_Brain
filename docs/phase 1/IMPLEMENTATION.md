# Phase 1 — Ingestion & AI Pipeline

## What this phase delivers

Every time an item enters SecondBrain (URL, text, or file upload) it is automatically:

1. Extracted (URL → fetched + cleaned HTML; file → read as text on the client)
2. Classified by GPT-4o → title, summary, tags, entities, confidence, suggested folder
3. Embedded with `text-embedding-3-large` (1536-dim) for semantic search
4. Persisted back to PostgreSQL
5. Handed off to the Phase 2 Neo4j sync + edge generators

The user sees the item appear in the inbox as "Untitled / processing…" and within a few seconds it transforms into a rich card with an AI-generated title, summary, tags, and a confidence indicator.

## Architecture

```
POST /api/v1/items/ingest
        │
        ▼
  Insert Item row in Postgres (raw_text, title, content_type, metadata)
        │
        ▼
  process_item.delay(item_id, user_id)   [Celery]
        │
        ▼
  ┌─────────────────────────────────────────────────┐
  │  app.tasks.ai_processing._process               │
  │  ├─ fetch URL body if content_type=url          │
  │  ├─ classify_item   (gpt-4o, JSON)              │
  │  ├─ summarise       (gpt-4o-mini, optional)     │
  │  ├─ embed_item      (text-embedding-3-large)    │
  │  └─ UPDATE items SET ai_title, summary, tags,   │
  │     entities, embedding, confidence, indexed_at │
  └─────────────────────────────────────────────────┘
        │
        ▼
  sync_item_to_neo4j.delay(item_id, user_id)   →   Phase 2
```

## Files added in Phase 1

| File | Purpose |
|---|---|
| `apps/api/app/tasks/ai_processing.py` | The orchestrator Celery task `process_item` |
| `apps/api/app/tasks/_db.py` | `task_session()` helper — fresh engine per Celery task to avoid asyncpg loop reuse bugs |
| `apps/api/app/ai/embeddings.py` | GitHub Models embeddings client (kept stateless — per-call instance) |
| `apps/api/app/ai/llm.py` | Classification + summarisation client (kept stateless — per-call instance) |
| `apps/web/src/components/upload/UploadZone.tsx` | Reads dropped files as text, sends filename in metadata |

## AI provider

GitHub Models via the `azure-ai-inference` Python SDK.

```
Endpoint:        https://models.github.ai/inference
Auth:            api-key = $GITHUB_TOKEN
Classification:  openai/gpt-4o            (temp 0.2, max 512 tokens, JSON-mode prompt)
Summarisation:   openai/gpt-4o-mini       (temp 0.3, max 256 tokens)
Embeddings:      openai/text-embedding-3-large, dimensions=1536
```

The `dimensions=1536` parameter on the embeddings call is required because:
- `text-embedding-3-large` returns 3072-dim vectors natively
- pgvector column is `Vector(1536)`
- OpenAI's `dimensions` parameter requests a reduced-dim variant of the same model

## Classification contract

The prompt asks `gpt-4o` for a strict JSON object:

```json
{
  "suggested_folder": ["Learning", "Programming"],
  "confidence": 0.92,
  "title": "Django Integration Guide",
  "summary": "Two-sentence plain-English description...",
  "tags": ["django", "python", "web development"],
  "entities": {
    "people": [],
    "places": [],
    "organisations": ["Django Software Foundation"],
    "concepts": ["ORM", "middleware"]
  },
  "content_type_label": "Technical Documentation"
}
```

If the LLM call fails (rate limit, JSON parse error, network), `classify_item` returns a stub dict so the pipeline doesn't crash. The item gets `confidence=0.0` and `needs_review=True`.

## URL content extraction

For `content_type=url` items, the worker fetches the page (15s timeout, `Mozilla/5.0` UA) and strips it with BeautifulSoup + lxml:

```python
soup = BeautifulSoup(resp.text, "lxml")
for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
    tag.decompose()
text = soup.get_text(" ", strip=True)
return text[:MAX_TEXT_FOR_AI]   # 8000 chars
```

This is intentionally simple — no Readability heuristics yet. Most blog posts and docs work fine; SPA-heavy sites will be empty (Phase 2.5 candidate).

## File uploads

Phase 1 does not include a storage layer. The web client reads the dropped file as text via `FileReader.readAsText()` and sends it as `type=text` with `metadata.filename` set. The backend uses the filename as the user-provided `title`. This works for `.md`, `.txt`, code files, etc. PDFs / images / audio are Phase 2.5+.

## Critical bugs found & fixed during this phase

| Bug | Root cause | Fix |
|---|---|---|
| `"expected 1536 dimensions, not 3072"` | `text-embedding-3-large` defaults to 3072 dims | Pass `dimensions=1536` in embed call |
| `"Event loop is closed"` after first task | Azure SDK clients cached at module level retain dead loop references | Build a fresh `EmbeddingsClient` / `ChatCompletionsClient` inside an `async with` per call |
| `"Future attached to a different loop"` on second Celery task | Global `AsyncSessionLocal` engine pool stayed bound to the first `asyncio.run()` loop | New `task_session()` helper builds a `NullPool` engine per task and disposes it |
| `syntax error at or near ":"` in pgvector queries | SQLAlchemy parameter parser tripped on `:emb::vector` (read `::` as cast) | Switched to `CAST(:emb AS vector)` everywhere |
| All edge generators silently failing | `asyncio.gather(..., return_exceptions=True)` swallowed errors | Iterate the returned values and log any `Exception` |
| Tag frequency threshold zeroed for small libraries | `int(6 * 0.15) = 0` made `max_tag_count = 1`, blocking every shared-tag edge | Use 50% floor for `<20` items, 15% above that |

## Confidence-driven UX

The frontend reads `item.confidence` to colour-code each card:

| Score | Colour | Treatment |
|---|---|---|
| ≥ 0.8 | green dot | trust the AI suggestion |
| 0.5 – 0.79 | amber dot | shown without warning |
| < 0.5 | red dot | `needs_review=True` flag; amber "Review" pill on the card; warning banner in detail panel |

`ItemCard` adds a ✨ sparkle next to the title when the displayed title came from `ai_title` (not a user-set `title`), making it obvious which titles are AI-suggested.

## Performance characteristics

For one item the pipeline takes ~2–4 seconds end-to-end on free-tier GitHub Models:

- URL fetch: 0–1.5s
- Classification (gpt-4o): 1–2s
- Summarise (only if classifier returned empty summary): 0–1s
- Embedding: 0.3–0.8s
- DB write: <50ms
- Trigger Neo4j sync: <10ms

Rate limits on the GitHub Models free tier are real (~10–15 RPM, 50–150 daily requests). A single user dropping 30 PDFs at once will hit the daily cap. Phase 2.5 should add throttling + dead-letter handling.

## Configuration

All AI behaviour is controlled by environment variables (see `.env.example`):

```
GITHUB_TOKEN=ghp_...                          # PAT with models:read scope
EMBEDDING_ENDPOINT=https://models.github.ai/inference
EMBEDDING_MODEL=openai/text-embedding-3-large
CLASSIFICATION_MODEL=openai/gpt-4o
SUMMARISATION_MODEL=openai/gpt-4o-mini
```

## What is NOT in Phase 1

Intentionally deferred to future phases:

- File extraction workers (PDF text, image OCR, audio transcription)
- S3 / object storage for binary uploads
- WebSocket `item.ready` event (frontend currently polls via React Query refetch)
- Smart folder auto-creation (the `suggested_folder` field from classification is captured but not yet acted on)
- Re-classification on user edit (manually moving an item to a folder does not re-train)
- Rate-limit-aware queueing
