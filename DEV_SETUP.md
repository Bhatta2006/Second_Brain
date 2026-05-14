# Dev Setup — Running Without Docker

> **Services that run in Docker:** PostgreSQL, Redis, Elasticsearch  
> **Everything else runs natively** on your machine.

---

## 1. Start Infrastructure (Docker)

Run these three containers first. They must be up before starting the backend.

```powershell
# PostgreSQL (Run this if you have not installed the PostgreSQL database)
docker run -d --name pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=Sathish123 -e POSTGRES_DB=secondbrain -p 5432:5432 postgres:16

# Redis
docker run -d --name redis -p 6379:6379 redis:7

# Elasticsearch
docker run -d --name es -e discovery.type=single-node -e xpack.security.enabled=false -p 9200:9200 elasticsearch:8.13.0
```

> If the containers already exist from a previous run, just start them:
>
> ```powershell
> docker start pg redis es
> ```

---

## 2. Activate the Python Virtual Environment

Open a terminal in `backend/`:

> If you have not created the virtual environment, run the following command first:
>
> ```powershell
> python -m venv .venv
> ```

```powershell
cd d:\Agents\Second_Brain\backend
.\.venv\Scripts\Activate.ps1
```

---

## 3. Apply Database Migrations

```powershell
.\.venv\Scripts\alembic.exe upgrade head
```

# Run the neo4j Script:

```powershell
.\.venv\Scripts\python.exe scripts\setup_neo4j_schema.py
```

---

## 4. Start the FastAPI Backend

```powershell
.\.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend will be available at `http://localhost:8000`.  
API docs at `http://localhost:8000/docs`.

---

## 5. Start the Celery Worker

Open a **second terminal** in `backend/` and activate the venv again:

```powershell
cd d:\Agents\Second_Brain\backend
.\.venv\Scripts\Activate.ps1

.\.venv\Scripts\python.exe -m celery -A app.tasks.celery_app:celery_app worker --loglevel=info --concurrency=2 --pool=solo
```

> `--pool=solo` is required on Windows to avoid asyncio event loop conflicts.

---

## 6. Start the Frontend

Open a **third terminal** in `frontend/`:

```powershell
cd d:\Agents\Second_Brain\frontend
npm run dev
```

Frontend will be available at `http://localhost:3000`.

---

## Summary — Terminal Layout

| Terminal | Command                                 |
| -------- | --------------------------------------- |
| 1        | Docker containers (one-time)            |
| 2        | `uvicorn` — FastAPI backend             |
| 3        | `celery worker` — async task processing |
| 4        | `npm run dev` — Next.js frontend        |

---

## Environment Variables

All backend config lives in `backend/.env`. Key values:

| Variable             | Value                                                                 |
| -------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`       | `postgresql+asyncpg://postgres:Sathish123@localhost:5432/secondbrain` |
| `REDIS_URL`          | `redis://localhost:6379/0`                                            |
| `ELASTICSEARCH_URL`  | `http://localhost:9200`                                               |
| `GITHUB_TOKEN`       | Your GitHub PAT (used for AI embeddings + LLM)                        |
| `EMBEDDING_ENDPOINT` | `https://models.github.ai/inference`                                  |

---

## Verify Everything Is Up

```powershell
# Postgres
docker exec pg pg_isready

# Redis
docker exec redis redis-cli ping

# Elasticsearch
curl http://localhost:9200/_cluster/health

# FastAPI
curl http://localhost:8000/healthz
```
