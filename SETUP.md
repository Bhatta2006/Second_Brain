# SecondBrain — Local Development Setup

Complete guide to get the project running on your machine from scratch. No external reference needed.

---

## What you're setting up

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (React, TypeScript, TailwindCSS) |
| Backend API | FastAPI (Python 3.12) |
| Task queue | Celery + Redis |
| Graph DB | Neo4j |
| Primary DB | PostgreSQL + pgvector |
| AI | GitHub Models API (GPT-4o, embeddings) |
| Auth + Storage | Supabase (external — shared project) |

Everything except Supabase runs locally inside Docker. You do **not** need to create your own Supabase project — you'll get the keys from the project owner.

---

## Prerequisites

Install these before anything else.

### 1. Git
- **Windows**: Download from https://git-scm.com/download/win — use all defaults
- **macOS**: Run `xcode-select --install` in Terminal
- **Linux (Ubuntu/Debian)**: `sudo apt install git`

Verify: `git --version`

### 2. Docker Desktop
Downloads:
- **Windows/macOS**: https://www.docker.com/products/docker-desktop/
- **Linux**: https://docs.docker.com/engine/install/

> **Windows users**: During install, enable "Use WSL 2 instead of Hyper-V" when prompted. After install, open Docker Desktop and wait until the whale icon in the taskbar shows "Docker Desktop is running" before proceeding.

Verify: `docker --version` and `docker compose version`

### 3. Node.js 22
- Download the LTS installer from https://nodejs.org (pick v22.x)
- Use all defaults

Verify: `node --version` (should show v22.x.x)

### 4. pnpm 9
After Node is installed, run:
```bash
npm install -g pnpm@9
```

Verify: `pnpm --version` (should show 9.x.x)

### 5. Python 3.12
- **Windows/macOS**: Download from https://www.python.org/downloads/ — pick the 3.12.x installer
  - **Windows**: Check "Add Python to PATH" during install
- **Linux**: `sudo apt install python3.12 python3.12-venv python3-pip`

Verify: `python --version` or `python3 --version` (should show 3.12.x)

---

## Step 1 — Clone the repo

```bash
git clone https://github.com/Bhatta2006/Second_Brain.git
cd Second_Brain
```

---

## Step 2 — Get the .env file

The `.env` file contains real API keys and is **never committed to git**. Ask the project owner (Hemanth) for it and place it at the **root of the repo** (same level as `docker-compose.yml`).

It should look like this (with real values filled in):
```
DATABASE_URL=postgresql+asyncpg://secondbrain:secondbrain@localhost:5432/secondbrain
DATABASE_URL_SYNC=postgresql://secondbrain:secondbrain@localhost:5432/secondbrain
REDIS_URL=redis://localhost:6379/0
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=secondbrain
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-south-1
S3_BUCKET=...
GITHUB_TOKEN=github_pat_...
GITHUB_MODELS_ENDPOINT=https://models.github.ai/inference
EMBEDDING_MODEL=openai/text-embedding-3-large
CLASSIFICATION_MODEL=openai/gpt-4o
SUMMARISATION_MODEL=openai/gpt-4o-mini
USE_NEO4J_GRAPH=true
API_ENV=development
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

> **Do not commit this file.** It is already in `.gitignore`.

---

## Step 3 — Install frontend dependencies

Run this from the repo root:

```bash
pnpm install
```

This installs all Node packages for the entire monorepo at once.

---

## Step 4 — Set up Python environment for the API

```bash
cd apps/api
python -m venv .venv
```

Activate the virtual environment:

**Windows (PowerShell):**
```powershell
.venv\Scripts\Activate.ps1
```

**Windows (Command Prompt):**
```cmd
.venv\Scripts\activate.bat
```

**macOS / Linux:**
```bash
source .venv/bin/activate
```

Install Python dependencies:
```bash
pip install -r requirements.txt
```

Go back to the repo root when done:
```bash
cd ../..
```

> You only need to activate the venv if you want to run the API directly (without Docker). For the Docker path in Step 5, you can skip activating it.

---

## Step 5 — Start all services with Docker

Make sure Docker Desktop is running, then from the repo root:

```bash
docker compose up --build
```

First run takes 5–10 minutes to build images and pull dependencies. Subsequent starts are fast.

You'll know it's ready when you see output like:
```
secondbrain-api    | INFO:     Application startup complete.
secondbrain-worker | ready.
secondbrain-web    | ▲ Next.js 14.2.18
secondbrain-web    | - Local: http://localhost:3000
```

### What's running:

| Service | URL |
|---|---|
| Frontend (Next.js) | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |
| Neo4j browser | http://localhost:7474 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

---

## Step 6 — Run database migrations

Open a new terminal (keep Docker running), navigate to the repo, and run:

```bash
docker compose exec api alembic upgrade head
```

This applies all database schema migrations. You only need to run this once (and again whenever new migrations are added).

---

## Verify everything works

1. Open http://localhost:3000 — you should see the SecondBrain login page
2. Open http://localhost:8000/health — should return `{"status":"ok","database":"connected"}`
3. Log in with your Supabase account (ask the project owner to invite you to the Supabase project, or create an account via the app's sign-up page)

---

## Daily workflow

### Start the project
```bash
docker compose up
```
(omit `--build` after the first time unless you changed a Dockerfile or `requirements.txt`)

### Stop the project
```bash
docker compose down
```

### View logs for a specific service
```bash
docker compose logs -f api       # API logs
docker compose logs -f worker    # Celery worker logs
docker compose logs -f web       # Next.js logs
```

### Restart a single service (e.g. after changing Python code)
```bash
docker compose restart api
```

> The API has hot-reload enabled (`--reload`), so most Python changes apply automatically without a restart. Next.js also hot-reloads automatically.

---

## Making code changes

### Frontend (Next.js)
- Files are in `apps/web/src/`
- Changes are reflected immediately in the browser (hot reload)
- If you add a new npm package: `pnpm --filter @secondbrain/web add <package-name>`, then restart the `web` container

### Backend (FastAPI)
- Files are in `apps/api/app/`
- Changes are reflected automatically (uvicorn `--reload` is on)
- If you add a new Python package: add it to `apps/api/requirements.txt`, then run `docker compose up --build api`

### New database migration
```bash
docker compose exec api alembic revision --autogenerate -m "describe your change"
docker compose exec api alembic upgrade head
```

---

## Troubleshooting

### `docker compose up` fails with "port already in use"
Another service on your machine is using port 5432, 6379, 7474, 7687, 8000, or 3000. Stop the conflicting service, or temporarily edit the port mapping in `docker-compose.yml` (left side is host port).

### Windows: `Activate.ps1 cannot be loaded` error
Run this once in PowerShell as Administrator:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### `pnpm install` fails with lockfile error
```bash
pnpm install --no-frozen-lockfile
```

### API container keeps restarting
Check logs: `docker compose logs api`. Usually means a missing or wrong value in `.env`. Double-check the Supabase and GitHub token values.

### Neo4j browser at localhost:7474 asks for login
Username: `neo4j` — Password: `secondbrain`

### `alembic upgrade head` fails with "relation already exists"
The database already has tables (from a previous run). This is fine — run:
```bash
docker compose exec api alembic stamp head
```

### Frontend shows "CORS error" or "Network Error"
Make sure `CORS_ORIGINS=http://localhost:3000` is in your `.env` and the API is running at port 8000.

---

## Project structure reference

```
Second_Brain/
├── apps/
│   ├── api/                  # FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py       # FastAPI app entry
│   │   │   ├── config.py     # All env var settings
│   │   │   ├── routers/      # API endpoints
│   │   │   ├── models/       # SQLAlchemy DB models
│   │   │   ├── tasks/        # Celery background tasks
│   │   │   ├── ai/           # GitHub Models integration
│   │   │   └── graph/        # Neo4j graph logic
│   │   ├── alembic/          # DB migrations
│   │   └── requirements.txt
│   └── web/                  # Next.js frontend
│       └── src/
│           ├── app/          # Pages (App Router)
│           ├── components/   # React components
│           ├── lib/          # API client, Supabase client
│           └── stores/       # Zustand state
├── infra/db/init.sql         # DB extensions setup
├── docker-compose.yml        # Local dev orchestration
├── .env                      # Your secrets (never commit)
└── .env.example              # Template (safe to commit)
```
