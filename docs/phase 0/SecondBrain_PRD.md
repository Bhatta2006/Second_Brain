# SecondBrain — Product Requirements Document
### Version 1.0 | May 2026 | Status: Ready for Engineering

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Product Vision & Goals](#3-product-vision--goals)
4. [Target Users & Personas](#4-target-users--personas)
5. [Core Features](#5-core-features)
6. [System Architecture](#6-system-architecture)
7. [Tech Stack](#7-tech-stack)
8. [Data Models](#8-data-models)
9. [API Design](#9-api-design)
10. [AI & LLM Pipeline](#10-ai--llm-pipeline)
11. [File Ingestion Pipeline](#11-file-ingestion-pipeline)
12. [Mind Map / Knowledge Graph](#12-mind-map--knowledge-graph)
13. [Search Architecture](#13-search-architecture)
14. [UI/UX Specification](#14-uiux-specification)
15. [Security & Privacy](#15-security--privacy)
16. [Storage Strategy](#16-storage-strategy)
17. [Notifications & Integrations](#17-notifications--integrations)
18. [Monetisation Model](#18-monetisation-model)
19. [Engineering Milestones & Sprints](#19-engineering-milestones--sprints)
20. [Non-Functional Requirements](#20-non-functional-requirements)
21. [Testing Strategy](#21-testing-strategy)
22. [Open Questions & Future Roadmap](#22-open-questions--future-roadmap)

---

## 1. Executive Summary

**SecondBrain** is an AI-native personal knowledge management (PKM) system. Users drop any resource — a photo, document, link, voice note, or raw text — into a universal inbox. The AI pipeline automatically classifies, tags, summarises, and routes each item into a semantically organised folder hierarchy. A real-time knowledge graph (Obsidian-style) visualises connections between items. A conversational LLM assistant lets users retrieve, query, or explore their entire knowledge base in plain English.

The core insight: people already instinctively "save to themselves" (WhatsApp self-chat, phone gallery dumps, browser bookmarks). SecondBrain replaces that fragmented habit with a single intelligent store that organises itself.

---

## 2. Problem Statement

| Pain Point | Current Workaround | Why It Breaks |
|---|---|---|
| Saving resources on the fly | WhatsApp "Me" chat | No structure, impossible to retrieve later |
| Organising bookmarks | Browser bookmarks / Pocket | Manual folders, rarely revisited |
| Finding a saved image or doc | Scrolling through gallery / files | No semantic search, no context |
| Connecting ideas across notes | Roam / Obsidian | High setup friction, not mobile-first |
| Asking "where did I save X?" | Memory | Human memory is lossy |

**Root cause:** Every existing tool requires the user to do the organising work upfront. SecondBrain flips this — the AI organises, the human just saves.

---

## 3. Product Vision & Goals

### Vision
> "Save anything in seconds. Find everything forever."

### Business Goals
- Reach 50,000 MAU within 12 months of launch
- Achieve 40% Day-30 retention (PKM category benchmark: 25%)
- Convert 8% of free users to paid within 6 months

### Product Goals
- Ingestion to organised item: < 5 seconds on Wi-Fi
- Retrieval via LLM chat: < 3 seconds per response
- Classification accuracy: > 92% (measured via user corrections)
- Zero data loss: 99.99% durability SLA

---

## 4. Target Users & Personas

### Persona A — "The Collector" (primary)
- Age 22–35, knowledge worker / student
- Saves 5–20 items per day (articles, screenshots, PDFs)
- Pain: "I saved it somewhere but I can never find it"
- Needs: Frictionless save, intelligent retrieval

### Persona B — "The Researcher"
- Academic, writer, analyst
- Builds structured knowledge bases, needs connections between ideas
- Needs: Knowledge graph, bidirectional linking, export

### Persona C — "The Creative"
- Designer, content creator
- Saves visual inspiration, moodboards, references
- Needs: Visual grid view, image tagging, colour search

---

## 5. Core Features

### 5.1 Universal Inbox
- Single drop zone for all content types
- Accessible via: mobile app, browser extension, share sheet (iOS/Android), email-to-save, API
- Supported types: JPEG/PNG/WEBP/HEIC images, PDF, DOCX, XLSX, PPTX, MP3/MP4, TXT/MD, URLs, plain text, voice memos

### 5.2 AI Auto-Organisation
- LLM classifies each item into a folder within the user's existing structure (or creates a new one)
- Generates: title, summary (2–3 sentences), tags (3–8), key entities, related items
- Confidence score surfaced to user; low-confidence items flagged for manual review

### 5.3 Knowledge Graph (Mind Map)
- Force-directed graph rendering items as nodes, relationships as edges
- Edge types: semantic similarity, shared tags, user-created links, temporal proximity
- Zoom/pan, click-to-open, cluster view by folder or tag
- Graph auto-updates as new items arrive

### 5.4 LLM Chat Assistant
- Natural language queries: "Show me everything I saved about React hooks", "What were those three articles about sleep I bookmarked last month?"
- Returns: direct answer + citations (item cards with previews)
- Supports follow-up: "Now filter those to only PDFs"
- Runs over user's full knowledge base (RAG architecture)

### 5.5 Folder System
- AI-generated hierarchy (max 3 levels deep to avoid over-nesting)
- User can rename, merge, split, or manually move items
- Smart folders: dynamic collections based on tag/date/type filters
- Emoji + colour coding per folder

### 5.6 Search
- Unified search bar: keyword, semantic, and filter-based
- Instant full-text results as user types
- Filters: type, date range, folder, tag, source
- "Similar items" for any search result

### 5.7 Item Detail View
- Preview pane for all file types
- AI-generated summary, tags, entities
- Manual notes / highlights by user
- Backlinks panel (other items that reference this)
- Version history for edited items

### 5.8 Quick Capture
- Widget (iOS/Android) for instant text/photo capture
- Browser extension: one-click save page or selection
- WhatsApp bot (Phase 2): forward messages to a bot number

---

## 6. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│   React Native App │ Web App (Next.js) │ Browser Extension       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / WebSocket
┌──────────────────────────▼──────────────────────────────────────┐
│                       API GATEWAY                                │
│          (Kong / AWS API Gateway — auth, rate limiting)          │
└──────┬───────────────────┬────────────────────┬─────────────────┘
       │                   │                    │
┌──────▼──────┐   ┌────────▼────────┐  ┌────────▼────────┐
│  Auth       │   │  Core API       │  │  AI Service     │
│  Service    │   │  (FastAPI)      │  │  (FastAPI)      │
│  (Supabase  │   │                 │  │                 │
│   Auth)     │   │  Items CRUD     │  │  Classify       │
└─────────────┘   │  Folders CRUD   │  │  Embed          │
                  │  Search         │  │  Summarise      │
                  │  Graph          │  │  Chat (RAG)     │
                  └────────┬────────┘  └────────┬────────┘
                           │                    │
┌──────────────────────────▼────────────────────▼─────────────────┐
│                        DATA LAYER                                │
│                                                                  │
│  PostgreSQL (Supabase)      pgvector (embeddings)                │
│  Redis (cache + sessions)   S3-compatible object store           │
│  Elasticsearch (FTS)        Neo4j (graph DB — Phase 2)           │
└──────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    ASYNC PIPELINE (Celery + Redis)               │
│                                                                  │
│  Ingest Worker → Extract Worker → Embed Worker → Index Worker    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. Tech Stack

### Frontend
| Layer | Technology | Reason |
|---|---|---|
| Mobile | React Native (Expo) | Single codebase iOS + Android |
| Web | Next.js 14 (App Router) | SSR, file-based routing, edge-ready |
| State | Zustand + React Query | Lightweight, server-state sync |
| Graph rendering | D3.js + React-Force-Graph | Performant force-directed graphs |
| UI components | shadcn/ui + Tailwind CSS | Accessible, unstyled, customisable |
| Rich text | TipTap | ProseMirror-based, extensible |

### Backend
| Layer | Technology | Reason |
|---|---|---|
| API | FastAPI (Python) | Async, fast, auto OpenAPI docs |
| Task queue | Celery + Redis | Reliable async processing |
| Auth | Supabase Auth | Row-level security, OAuth, MFA |
| ORM | SQLAlchemy 2.0 + Alembic | Type-safe, migrations |

### AI / ML
| Component | Technology | Reason |
|---|---|---|
| Embeddings | text-embedding-3-large (OpenAI) | Best-in-class semantic quality |
| Classification | Claude claude-sonnet-4-20250514 | Nuanced folder routing, JSON output |
| Summarisation | Claude Haiku | Cost-efficient for bulk |
| RAG / Chat | Claude claude-sonnet-4-20250514 + LangChain | Multi-step retrieval chains |
| Image OCR | AWS Textract | Accurate, handles handwriting |
| Image understanding | Claude Vision | Describe, tag, extract text from images |
| Audio transcription | Whisper (OpenAI) | Voice notes → text |

### Infrastructure
| Component      | Technology                                         |
| -------------- | -------------------------------------------------- |
| Cloud          | AWS (primary)                                      |
| Object storage | AWS S3                                             |
| CDN            | CloudFront                                         |
| Database       | Supabase (PostgreSQL + pgvector)                   |
| Search         | Elasticsearch 8 (self-hosted on EC2) or OpenSearch |
| Cache          | Redis (ElastiCache)                                |
| Container      | Docker + AWS ECS Fargate                           |
| CI/CD          | GitHub Actions                                     |
| Monitoring     | Datadog + Sentry                                   |
| Secrets        | AWS Secrets Manager                                |

---

## 8. Data Models

### 8.1 Users
```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  avatar_url    TEXT,
  plan          TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team')),
  storage_used  BIGINT DEFAULT 0,   -- bytes
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
```

### 8.2 Folders
```sql
CREATE TABLE folders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES folders(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  emoji         TEXT,
  color         TEXT,                -- hex code
  is_smart      BOOLEAN DEFAULT false,
  smart_filter  JSONB,               -- {type, tags, date_range}
  ai_generated  BOOLEAN DEFAULT false,
  depth         INT DEFAULT 0 CHECK (depth <= 2),  -- max 3 levels
  item_count    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, parent_id, name)
);
```

### 8.3 Items
```sql
CREATE TABLE items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  folder_id       UUID REFERENCES folders(id) ON DELETE SET NULL,
  title           TEXT,
  content_type    TEXT NOT NULL,  -- 'image','pdf','url','text','audio','doc','video'
  source_url      TEXT,           -- original URL if web clip
  storage_key     TEXT,           -- S3 object key
  file_size       BIGINT,
  mime_type       TEXT,
  raw_text        TEXT,           -- extracted/OCR'd text
  summary         TEXT,           -- AI-generated 2–3 sentence summary
  ai_title        TEXT,           -- AI-generated title (user can override)
  tags            TEXT[],
  entities        JSONB,          -- {people:[], places:[], concepts:[]}
  metadata        JSONB,          -- source-specific: {domain, author, publish_date, ...}
  embedding       vector(1536),   -- pgvector, text-embedding-3-large
  confidence      FLOAT,          -- AI classification confidence 0–1
  needs_review    BOOLEAN DEFAULT false,
  is_starred      BOOLEAN DEFAULT false,
  view_count      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  indexed_at      TIMESTAMPTZ
);

CREATE INDEX idx_items_user_folder ON items(user_id, folder_id);
CREATE INDEX idx_items_tags ON items USING GIN(tags);
CREATE INDEX idx_items_embedding ON items USING ivfflat(embedding vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX idx_items_created ON items(user_id, created_at DESC);
```

### 8.4 Edges (Knowledge Graph)
```sql
CREATE TABLE edges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  source_id   UUID REFERENCES items(id) ON DELETE CASCADE,
  target_id   UUID REFERENCES items(id) ON DELETE CASCADE,
  edge_type   TEXT NOT NULL CHECK (edge_type IN (
                'semantic','shared_tag','user_link','temporal','entity_match'
              )),
  weight      FLOAT DEFAULT 1.0,  -- 0–1, used for graph layout
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_id, target_id, edge_type)
);
```

### 8.5 Chat Sessions
```sql
CREATE TABLE chat_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role          TEXT CHECK (role IN ('user', 'assistant')),
  content       TEXT NOT NULL,
  cited_items   UUID[],   -- item IDs cited in this response
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

---

## 9. API Design

All endpoints are prefixed `/api/v1`. Authentication via Bearer JWT (Supabase).

### 9.1 Items

```
POST   /items/ingest          Upload file or submit URL/text
GET    /items                 List items (paginated, filterable)
GET    /items/:id             Get single item with full detail
PATCH  /items/:id             Update title/tags/folder/notes
DELETE /items/:id             Soft-delete item
GET    /items/:id/similar     Vector similarity search from this item
POST   /items/:id/link        Create a manual edge to another item
```

**POST /items/ingest — Request**
```json
{
  "type": "file | url | text",
  "url": "https://example.com/article",       // if type=url
  "text": "raw text content",                 // if type=text
  "file_key": "tmp/uploads/abc123.pdf",       // if type=file (pre-signed S3 upload)
  "hint_folder_id": "uuid",                   // optional user hint
  "metadata": {}
}
```

**POST /items/ingest — Response**
```json
{
  "item_id": "uuid",
  "status": "processing",
  "estimated_seconds": 4
}
```

Items arrive via WebSocket event `item.ready` once pipeline completes.

### 9.2 Folders

```
GET    /folders               Full folder tree for user
POST   /folders               Create folder
PATCH  /folders/:id           Rename / recolour
DELETE /folders/:id           Delete (items move to Uncategorised)
POST   /folders/:id/merge     Merge into another folder
```

### 9.3 Search

```
GET    /search?q=&type=&folder=&tags=&from=&to=&page=
POST   /search/semantic       Vector search with optional filters
```

**GET /search response**
```json
{
  "total": 142,
  "page": 1,
  "results": [
    {
      "id": "uuid",
      "title": "How sleep affects memory",
      "summary": "Article about the role of REM sleep...",
      "content_type": "url",
      "folder": { "id": "uuid", "name": "Health" },
      "tags": ["sleep", "neuroscience"],
      "score": 0.94,
      "created_at": "2026-04-12T10:23:00Z"
    }
  ]
}
```

### 9.4 Chat

```
POST   /chat/sessions                   Create new session
GET    /chat/sessions                   List sessions
GET    /chat/sessions/:id/messages      Message history
POST   /chat/sessions/:id/message       Send message (streaming SSE)
```

**POST /chat/sessions/:id/message — streaming SSE**
```
data: {"type":"chunk","text":"Here are the articles about "}
data: {"type":"chunk","text":"React hooks you saved:"}
data: {"type":"citation","item_id":"uuid","title":"React Hooks Deep Dive"}
data: {"type":"done","cited_items":["uuid1","uuid2"]}
```

### 9.5 Graph

```
GET    /graph?depth=2&item_id=          Graph data (nodes + edges) for user
GET    /graph/item/:id/neighbours       Immediate neighbours of a node
```

---

## 10. AI & LLM Pipeline

### 10.1 Classification Prompt (Claude claude-sonnet-4-20250514)

```
System:
You are an expert personal knowledge organiser. Given a piece of content,
return a JSON object with:
- suggested_folder: array of folder path segments (e.g. ["Learning", "Programming"])
- confidence: float 0–1
- title: concise title (max 60 chars)
- summary: 2–3 sentence plain-English summary
- tags: 3–8 relevant lowercase tags
- entities: { people: [], places: [], organisations: [], concepts: [] }
- content_type_label: human-readable type (e.g. "Research Article", "Product Documentation")

User's existing folder tree: {{folder_tree_json}}
Content type: {{content_type}}
Content: {{first_2000_chars}}

Return only valid JSON. No markdown fences.
```

### 10.2 RAG Chat Architecture

```
User query
    │
    ▼
Query Rewriting (LLM) — expand abbreviations, handle pronouns
    │
    ▼
Dual Retrieval:
  ├── Semantic: pgvector cosine similarity (top-20)
  └── Keyword: Elasticsearch BM25 (top-20)
    │
    ▼
Re-ranking (Cohere Rerank or cross-encoder) → top-8
    │
    ▼
Context assembly: item summaries + snippets (max 8,000 tokens)
    │
    ▼
Claude claude-sonnet-4-20250514 generates response with citations
    │
    ▼
Stream to client via SSE
```

### 10.3 Embedding Strategy
- Embed: `title + summary + raw_text[:2000] + tags joined`
- Model: `text-embedding-3-large` (1536 dims)
- Re-embed on user edit of tags or notes
- Batch embed on bulk import (Celery task, rate-limited)

### 10.4 Image Understanding
```
1. Receive image → store raw in S3
2. AWS Textract → extract any text (OCR)
3. Claude Vision → generate description, tags, detect objects/scenes
4. Combine OCR text + vision description → embed
5. Classify into folder using combined representation
```

---

## 11. File Ingestion Pipeline

```
┌──────────────┐
│  Client      │  Step 1: Request pre-signed S3 URL from API
│  Upload      │  Step 2: PUT file directly to S3 (client-side)
└──────┬───────┘  Step 3: POST /items/ingest with s3_key
       │
┌──────▼───────────────────────────────────────────────────┐
│  Celery Task: ingest_item(item_id)                        │
│                                                           │
│  1. EXTRACT                                               │
│     - PDF → pdfplumber (text) + PyMuPDF (images)          │
│     - DOCX/XLSX/PPTX → python-docx / openpyxl / pptx     │
│     - Image → AWS Textract + Claude Vision                │
│     - URL → Playwright headless scrape → Readability.js   │
│     - Audio → Whisper transcription                       │
│     - Text/MD → direct                                    │
│                                                           │
│  2. CLASSIFY (Claude claude-sonnet-4-20250514)                       │
│     - Returns folder path, title, summary, tags           │
│     - Resolve/create folder in DB                         │
│                                                           │
│  3. EMBED (text-embedding-3-large)                        │
│     - Generate 1536-dim vector                            │
│     - Store in pgvector                                   │
│                                                           │
│  4. INDEX                                                 │
│     - Upsert to Elasticsearch for FTS                     │
│                                                           │
│  5. GRAPH EDGES                                           │
│     - Find top-5 similar items (cosine similarity)        │
│     - Create 'semantic' edges if similarity > 0.75        │
│     - Create 'shared_tag' edges                           │
│                                                           │
│  6. NOTIFY                                                │
│     - WebSocket push: item.ready event                    │
└──────────────────────────────────────────────────────────┘
```

**Retry policy:** Celery exponential back-off, max 3 retries. Failed items move to `dead_letter` state; user notified via in-app banner.

**Idempotency:** Each ingestion task is keyed by item_id. Duplicate uploads of identical file hash → deduplicate, surface existing item.

---

## 12. Mind Map / Knowledge Graph

### 12.1 Data Structure
Nodes and edges are fetched from `/graph` as:
```json
{
  "nodes": [
    {
      "id": "uuid",
      "label": "React Hooks Deep Dive",
      "type": "url",
      "folder": "Programming",
      "tags": ["react", "hooks"],
      "thumbnail_url": "..."
    }
  ],
  "edges": [
    {
      "source": "uuid1",
      "target": "uuid2",
      "type": "semantic",
      "weight": 0.87
    }
  ]
}
```

### 12.2 Rendering

- Library: `react-force-graph-2d` (canvas-based, handles 10k+ nodes)
- 3D toggle: `react-force-graph-3d` (Three.js, opt-in)
- Node size: proportional to `view_count` (frequently accessed items are larger)
- Node colour: matches folder colour
- Edge opacity: proportional to `weight`
- Cluster mode: group nodes by folder with convex hull overlay

### 12.3 Interactions
| Action | Behaviour |
|---|---|
| Click node | Open item detail panel (slide-in) |
| Double-click node | Focus graph on this node + neighbours |
| Hover node | Tooltip with title + summary |
| Drag node | Reposition (layout persisted per session) |
| Right-click node | Context menu: Open / Move / Link / Delete |
| Click edge | Show relationship type + strength |
| "Focus mode" button | Expand selected node to show 2-hop neighbours only |
| Search in graph | Highlight matching nodes, dim others |

### 12.4 Performance
- Initial load: fetch only nodes with edges (orphan nodes shown in "Unconnected" sidebar)
- Pagination: fetch top-500 by recency + connectivity; lazy load rest
- Web Worker: physics simulation runs off main thread
- Memoisation: node/edge arrays memoised; only diff re-renders on new items

---

## 13. Search Architecture

### 13.1 Full-Text Search (Elasticsearch)
- Index fields: `title^3`, `summary^2`, `raw_text`, `tags^2`, `entities`
- Analyser: `english` stemmer + synonyms (e.g. "ML" → "machine learning")
- Filters: `user_id`, `folder_id`, `content_type`, `date_range`, `tags`
- Highlight: matched snippets returned with `<em>` tags

### 13.2 Semantic Search (pgvector)
- Cosine similarity on `embedding` column
- Combined score: `0.6 * semantic_score + 0.4 * bm25_score` (Reciprocal Rank Fusion)
- Threshold: minimum similarity 0.60 to surface

### 13.3 Search UX
- Debounce: 300ms after keystroke before query fires
- Instant mode: FTS results appear in < 200ms
- Semantic enrichment: appended after FTS within 800ms
- Query suggestions: autocomplete from user's own tags + titles (Redis prefix cache)
- Zero results: LLM paraphrases query and retries once; suggests related folders

---

## 14. UI/UX Specification

### 14.1 Navigation Structure

```
Bottom tab bar (mobile) / Left sidebar (web):
├── Inbox        — unreviewed / recently added items
├── Library      — folder tree view (main organisation)
├── Graph        — knowledge graph / mind map
├── Search       — unified search
└── Chat         — LLM assistant
```

### 14.2 Key Screens

**Inbox View**
- Card grid with thumbnail, AI title, folder badge, confidence indicator
- Swipe right → Approve AI classification
- Swipe left → Move to manual review
- Batch select + bulk-move available

**Library View**
- Sidebar folder tree (collapsible)
- Main area: grid (default) or list toggle
- Sort by: Date added, Title, Frequency, File size
- Filter chips (type, tags)

**Item Detail**
- Full-screen preview (PDF viewer, image zoom, video player, web archive)
- Collapsible AI metadata panel: summary, tags, entities
- User notes (TipTap rich text)
- Related items carousel (vector similarity)
- Backlinks list

**Graph View**
- Full-screen canvas
- Mini-map (bottom-right corner)
- Toolbar: zoom, cluster toggle, 3D toggle, search-in-graph
- Right panel: item detail on click

**Chat View**
- Persistent conversation history (sessions)
- Chat bubbles with streaming response
- Inline item cards for citations (thumbnail + title)
- Suggested prompts on empty state: "What did I save last week?", "Find my notes on machine learning"

### 14.3 Mobile Share Sheet (iOS / Android)
- User shares any content to SecondBrain from any app
- Sheet appears: shows AI-predicted folder (< 2s), tags
- One-tap confirm or change folder
- Background upload continues after dismiss

### 14.4 Browser Extension
- Toolbar button: save current page
- Selection save: highlight text → right-click → "Save to SecondBrain"
- Shows notification badge with AI folder assignment
- Optional clip mode: full page archive vs. reader-mode extract

---

## 15. Security & Privacy

### Authentication
- Supabase Auth: email/password + Google OAuth + Apple Sign-In
- MFA: TOTP (Authenticator apps)
- Session: 7-day rotating JWTs, refresh tokens stored httpOnly

### Authorisation
- Row-Level Security (RLS) in Postgres: all queries scoped to `user_id`
- API Gateway validates JWT before any request reaches services

### Data Encryption
- At rest: AES-256 (S3 default encryption, Supabase encryption at rest)
- In transit: TLS 1.3 enforced
- User-level encryption (Phase 2): optional client-side key, zero-knowledge mode

### Privacy
- AI processing: content sent to OpenAI/Anthropic APIs under DPA agreements
- No training on user data: explicit opt-out clauses in ToS
- GDPR/DPDP compliance: right to export (JSON/ZIP), right to erasure (cascade delete)
- Data residency: AWS ap-south-1 (Mumbai) for Indian users by default

### Threat Model
| Threat | Mitigation |
|---|---|
| Unauthorised data access | RLS + JWT validation |
| File upload abuse | MIME-type validation, AV scan (ClamAV on S3 Lambda) |
| Prompt injection via user content | Content sanitised before LLM; system prompt hardened |
| Scraping | Rate limiting at API Gateway (100 req/min per user) |
| SSRF via URL ingestion | URL allowlist/denylist, private IP blocked, timeout 10s |

---

## 16. Storage Strategy

### Tiers

| Plan | Storage | Item Limit |
|---|---|---|
| Free | 1 GB | 500 items |
| Pro ($8/mo) | 20 GB | Unlimited |
| Team ($20/user/mo) | 100 GB shared | Unlimited |

### S3 Object Layout
```
s3://secondbrain-prod/
  users/{user_id}/
    originals/{item_id}.{ext}     # original file
    thumbnails/{item_id}_thumb.webp
    archives/{item_id}.html        # web page archive
    exports/{timestamp}_export.zip
```

### Lifecycle Policy
- Originals: Standard → Infrequent Access after 90 days if not viewed
- Thumbnails: CloudFront CDN, 365-day cache
- Deleted items: 30-day soft delete grace period → permanent purge

---

## 17. Notifications & Integrations

### Push Notifications
- "Item organised": brief push after ingestion (optional, off by default)
- "Weekly Digest": summary of items added, graph growth, top topics
- "Review needed": when low-confidence items queue up > 5

### Integrations (Phase 1)
| Integration | Mechanism |
|---|---|
| iOS Share Sheet | Native share extension |
| Android Share | Android intent handler |
| Chrome Extension | Manifest V3 extension |
| Safari Extension | Safari Web Extension |
| Email-to-save | Unique inbound address (e.g. save@user.secondbrain.app → Mailgun webhook) |

### Integrations (Phase 2)
| Integration | Mechanism |
|---|---|
| WhatsApp Bot | WhatsApp Business API webhook |
| Telegram Bot | Telegram Bot API |
| Slack | Slash command `/save` |
| Notion import | Notion API export → bulk ingest |
| Obsidian sync | Plugin for two-way sync |

---

## 18. Monetisation Model

### Plans

**Free**
- 1 GB storage, 500 items
- Basic search (keyword only)
- 10 AI chat messages/day
- No graph export

**Pro — $8/month (₹499/month India)**
- 20 GB storage, unlimited items
- Semantic search + full RAG chat (unlimited)
- Knowledge graph with 3D mode
- Browser extension + email-to-save
- Obsidian/Notion import
- Priority processing queue

**Team — $20/user/month**
- All Pro features
- Shared workspaces + shared folders
- Admin panel + usage analytics
- SSO (SAML)
- 99.9% SLA

### Revenue Projections (Y1)
- 50,000 MAU, 8% conversion = 4,000 paying users
- Blended ARPU: $7.5/mo
- MRR target: $30,000 → ARR $360,000 by Month 12

---

## 19. Engineering Milestones & Sprints

### Phase 0 — Foundation (Weeks 1–4)
- [ ] Monorepo setup (Turborepo): `apps/web`, `apps/mobile`, `packages/api`, `packages/ai`
- [ ] Supabase project: schema migrations, RLS policies
- [ ] FastAPI skeleton: auth middleware, health checks
- [ ] S3 bucket + pre-signed URL upload flow
- [ ] CI/CD: GitHub Actions → ECS Fargate
- [ ] Basic item CRUD (no AI yet)

### Phase 1 — Core Ingestion (Weeks 5–8)
- [ ] Celery + Redis task queue
- [ ] File extraction workers (PDF, DOCX, image OCR)
- [ ] URL scraping worker (Playwright)
- [ ] Claude classification pipeline
- [ ] pgvector embedding storage
- [ ] Elasticsearch indexing
- [ ] WebSocket item.ready events
- [ ] Folder auto-creation logic

### Phase 2 — UI (Weeks 9–12)
- [ ] Web app: Inbox, Library, Item Detail
- [ ] Mobile app: Inbox, Library, Share Sheet extension
- [ ] Unified search (keyword + semantic)
- [ ] Browser extension (Chrome first)

### Phase 3 — Graph + Chat (Weeks 13–16)
- [ ] Graph data API
- [ ] D3.js force graph component (web)
- [ ] RAG chat pipeline (LangChain + Claude)
- [ ] Chat UI with streaming SSE + citations
- [ ] Edge creation (semantic + tag)

### Phase 4 — Polish & Launch (Weeks 17–20)
- [ ] Mobile graph view (react-native-d3)
- [ ] Weekly digest email
- [ ] Onboarding flow (guided first-save)
- [ ] Payment integration (Stripe + Razorpay for India)
- [ ] Performance audit (< 200ms search, < 5s ingest)
- [ ] Security audit
- [ ] App Store + Play Store submission
- [ ] ProductHunt launch

### Phase 5 — Growth (Weeks 21–28)
- [ ] WhatsApp bot
- [ ] Obsidian import plugin
- [ ] Team workspaces
- [ ] API for third-party integrations
- [ ] iOS widget + Android widget

---

## 20. Non-Functional Requirements

| Requirement | Target |
|---|---|
| API p95 latency | < 200ms (excluding AI calls) |
| AI classification | < 4s p95 |
| RAG chat first token | < 1.5s p95 |
| Search results | < 300ms p95 |
| Uptime | 99.9% (< 8.7 hrs downtime/year) |
| File upload (10MB) | < 8s on 4G |
| Graph render (1000 nodes) | < 2s initial, 60fps interaction |
| Concurrent users | 10,000 (horizontal Fargate scaling) |
| Data durability | 99.999999999% (S3 11-nines) |
| GDPR erasure | < 30 days |
| Mobile app size | < 30 MB (iOS), < 25 MB (Android) |

---

## 21. Testing Strategy

### Unit Tests (pytest / Jest)
- All FastAPI route handlers
- Celery task logic (mocked LLM calls)
- Frontend components (React Testing Library)
- Data model validations

### Integration Tests
- Full ingestion pipeline (PDF, URL, image) with real S3/DB in CI
- Search accuracy benchmark against labelled test set (target > 92% top-3 recall)
- RAG chat: 50-question eval set with expected citations

### End-to-End Tests (Playwright)
- Upload flow → item appears in Library
- Search → correct item returned
- Chat query → correct citation
- Folder auto-creation after AI classification

### Performance Tests (k6)
- 1,000 concurrent ingestion requests
- 5,000 concurrent search requests
- Graph API with 10,000-node dataset

### AI Evaluation
- Classification accuracy: human-labelled 200-item test set, track `classification_correction_rate` in Datadog
- Chat quality: LLM-as-judge scoring on 50 QA pairs (helpfulness, accuracy, citation precision)
- Embedding drift: monthly cosine similarity distribution check

### Error Monitoring
- Sentry: all backend exceptions, React error boundaries
- Datadog: pipeline task failure rate dashboard, alerts if > 2% failures

---

## 22. Open Questions & Future Roadmap

### Open Questions
1. **OCR language support**: Prioritise English + Hindi for Indian market, or full multilingual from launch?
2. **Offline mode**: Should mobile app cache last 100 items for offline access? (IndexedDB + React Query persistence)
3. **Zero-knowledge encryption**: High privacy demand vs. server-side AI processing conflict — offer as opt-in with degraded AI features?
4. **Graph layout persistence**: Store user-repositioned node coordinates in DB or keep ephemeral?

### Future Roadmap (Post-Launch)
| Feature | Quarter |
|---|---|
| Voice query in chat ("Hey SecondBrain, find my...") | Q3 2026 |
| Collaborative sharing (share item/folder with link) | Q3 2026 |
| PDF annotation + highlight sync | Q4 2026 |
| Spaced repetition flashcards from saved content | Q4 2026 |
| AI-generated weekly synthesis ("Here's what you learned this week") | Q1 2027 |
| Plugin marketplace (third-party graph plugins) | Q1 2027 |
| Local LLM mode (Ollama) for enterprise privacy | Q2 2027 |
| Vision board mode (pure visual layout) | Q2 2027 |

---

## Appendix A — Folder Taxonomy (AI Seed Categories)

The classifier is seeded with these top-level categories; it expands dynamically based on user content:

```
Personal/
  Health & Fitness
  Finance & Budgeting
  Relationships
  Goals & Planning
Work/
  Projects
  Meetings & Notes
  Reference
  Career
Learning/
  Courses
  Research Papers
  Books
  Videos & Talks
Creative/
  Design Inspiration
  Writing
  Music
  Photography
Tech/
  Programming
  Tools & Software
  AI & ML
  Security
Travel/
  Destinations
  Itineraries
  Tips & Guides
Shopping/
  Wishlist
  Receipts & Orders
News & Media/
  Articles
  Podcasts
  Opinion
Miscellaneous/
```

---

## Appendix B — Key Third-Party Dependencies & Licences

| Package | Licence | Use |
|---|---|---|
| FastAPI | MIT | API framework |
| Celery | BSD | Task queue |
| LangChain | MIT | RAG orchestration |
| pdfplumber | MIT | PDF text extraction |
| python-docx | MIT | DOCX extraction |
| Playwright | Apache 2.0 | URL scraping |
| react-force-graph | MIT | Graph rendering |
| TipTap | MIT | Rich text editor |
| shadcn/ui | MIT | UI components |
| Expo | MIT | React Native |
| OpenAI SDK | MIT | Embeddings, Whisper |
| Anthropic SDK | MIT | Claude API |

---

*Document Owner: Product Lead*
*Last Updated: May 2026*
*Next Review: July 2026*
