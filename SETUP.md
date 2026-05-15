# SecondBrain — Local Development Setup

Complete guide to get the project running on your machine from scratch. Follow every step in order. Do not skip steps.

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
| Auth + Storage | Supabase (shared external project) |

Everything except Supabase runs locally inside Docker. You do **not** need to create your own Supabase project.

---

## Prerequisites

Install all of these before doing anything else.

### 1. Git
- **Windows**: Download from https://git-scm.com/download/win — use all defaults
- **macOS**: Run `xcode-select --install` in Terminal
- **Linux**: `sudo apt install git`

Verify: `git --version`

### 2. Docker Desktop
- **Windows / macOS**: https://www.docker.com/products/docker-desktop/
- **Linux**: https://docs.docker.com/engine/install/

> **Windows users**: During install, enable "Use WSL 2 instead of Hyper-V" when prompted. After install, open Docker Desktop and wait until the whale icon in the taskbar says "Docker Desktop is running" before continuing.

Verify: `docker --version` and `docker compose version`

### 3. Node.js 22
Download the v22.x LTS installer from https://nodejs.org — use all defaults.

Verify: `node --version` (should show v22.x.x)

> **Do NOT install pnpm** — it is not needed. Docker handles all package installation internally.

---

## Step 1 — Clone the repo

```bash
git clone https://github.com/Bhatta2006/Second_Brain.git
cd Second_Brain
```

All remaining commands must be run from inside the `Second_Brain` folder.

---

## Step 2 — Create your .env file

Create a file named exactly `.env` (no other extension) at the **root of the repo** — the same folder that contains `docker-compose.yml`.

Copy the entire block below into it and fill in the values:

```
# ── Local services — same for everyone, do not change these ────────────────
DATABASE_URL=postgresql+asyncpg://secondbrain:secondbrain@localhost:5432/secondbrain
DATABASE_URL_SYNC=postgresql://secondbrain:secondbrain@localhost:5432/secondbrain
REDIS_URL=redis://localhost:6379/0
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=secondbrain
USE_NEO4J_GRAPH=true
API_ENV=development
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000
GITHUB_MODELS_ENDPOINT=https://models.github.ai/inference
EMBEDDING_MODEL=openai/text-embedding-3-large
CLASSIFICATION_MODEL=openai/gpt-4o
SUMMARISATION_MODEL=openai/gpt-4o-mini

# ── Get these from Hemanth (same for all team members) ─────────────────────
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-south-1
S3_BUCKET=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# ── Generate your own (personal, cannot be shared) ──────────────────────────
GITHUB_TOKEN=
```

> **Never commit this file.** It is already in `.gitignore`.

### How to get the Supabase + AWS values
Ask Hemanth to share them privately (WhatsApp/DM). They are identical for all team members.

### How to generate your GITHUB_TOKEN
Each person needs their own — it is tied to your GitHub account.

1. Go to https://github.com/settings/tokens?type=beta
2. Click **Generate new token**
3. Name it `secondbrain-models`, set expiration to 90 days
4. Under **Permissions → Account permissions**, set **Models** to **Read-only**
5. Click **Generate token**, copy it immediately
6. Paste it as `GITHUB_TOKEN=github_pat_xxxx...` in your `.env`

---

## Step 3 — Build and start everything

Make sure Docker Desktop is open and running, then run:

```bash
docker compose build --no-cache web
docker compose up
```

> Run these one at a time — wait for the first to finish before running the second.

The first build takes **5–10 minutes**. You'll see a lot of output. It is done when you see:

```
secondbrain-web  |  ✓ Ready in 73ms
secondbrain-api  | INFO:     Application startup complete.
secondbrain-worker | celery@... ready.
```

### What's running once it's up:

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API health check | http://localhost:8000/health |
| Neo4j browser | http://localhost:7474 |

---

## Step 4 — Set up the database

Open a **new terminal window** (keep the Docker terminal running), go to the repo folder, and run:

```bash
docker compose exec api alembic upgrade head
```

**If you get `Can't locate revision identified by '...'`**, run these instead:

```bash
docker compose exec postgres psql -U secondbrain -d secondbrain -c "DELETE FROM alembic_version;"
docker compose exec api alembic upgrade head
```

**If you get `relation "users" already exists`**, the tables already exist. Just sync alembic's state:

```bash
docker compose exec api alembic stamp 002
```

You only need to run this step once on first setup.

---

## Step 5 — Open the app

Go to http://localhost:3000/login in your browser. You should see the SecondBrain login page.

Sign up or log in using your email. Use the same Supabase project as the team — your account will be created automatically on first login.

---

## Daily workflow

### Start
```bash
docker compose up
```

### Stop
Press `Ctrl+C` in the terminal where Docker is running, then:
```bash
docker compose down
```

### View logs for a specific service
```bash
docker compose logs -f web      # frontend
docker compose logs -f api      # backend
docker compose logs -f worker   # celery
```

### After pulling new code from git
If someone changed the Dockerfile or `requirements.txt`:
```bash
git pull
docker compose build --no-cache web
docker compose up
```

If only source code changed (no Dockerfile changes):
```bash
git pull
docker compose up
```

---

## Troubleshooting

### White screen at localhost:3000
The Supabase URL is not baked into the build. Make sure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are filled in your `.env`, then rebuild:
```bash
docker compose build --no-cache web
docker compose up
```

### `docker compose up` fails — "port already in use"
Something on your machine is using one of these ports: 3000, 5432, 6379, 7474, 7687, 8000.
- On Windows: open Task Manager → find and end the conflicting process
- Or change the left side of the port mapping in `docker-compose.yml` (e.g. `"3001:3000"`)

### `Cannot find module '/app/node_modules/next/dist/bin/next'`
Rebuild with no cache:
```bash
docker compose build --no-cache web
docker compose up
```

### `Cannot find module '/app/pnpm'`
The compose file is using an old cached image. Pull latest code and rebuild:
```bash
git pull
docker compose build --no-cache web
docker compose up
```

### `alembic upgrade head` — `Can't locate revision identified by '...'`
```bash
docker compose exec postgres psql -U secondbrain -d secondbrain -c "DELETE FROM alembic_version;"
docker compose exec api alembic upgrade head
```

### `alembic upgrade head` — `relation "users" already exists`
Tables already exist from a previous run. Just sync the state:
```bash
docker compose exec api alembic stamp 002
```

### API container keeps restarting
Check logs: `docker compose logs api`
Usually means a missing or wrong value in `.env`. Double-check your Supabase keys and GitHub token.

### Neo4j browser at localhost:7474 asks for a password
Username: `neo4j` — Password: `secondbrain`

### Windows: `Activate.ps1 cannot be loaded`
You don't need a Python venv — Docker handles Python. If you see this error, you accidentally activated one. Run `deactivate` and continue with Docker.

### `pnpm` command not found
You don't need pnpm installed on your machine — Docker handles it internally. Ignore any pnpm-related instructions if you see them elsewhere.

---

## Project structure reference

```
Second_Brain/
├── apps/
│   ├── api/                  # FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py       # App entry point
│   │   │   ├── config.py     # All env var settings
│   │   │   ├── routers/      # API endpoints
│   │   │   ├── models/       # Database models
│   │   │   ├── tasks/        # Celery background jobs
│   │   │   ├── ai/           # GitHub Models integration
│   │   │   └── graph/        # Neo4j graph logic
│   │   ├── alembic/          # Database migrations
│   │   └── requirements.txt
│   └── web/                  # Next.js frontend
│       └── src/
│           ├── app/          # Pages
│           ├── components/   # React components
│           ├── lib/          # API client, Supabase
│           └── stores/       # Zustand state
├── docker-compose.yml        # Runs all services locally
├── .env                      # Your secrets — never commit
└── .env.example              # Template
```
