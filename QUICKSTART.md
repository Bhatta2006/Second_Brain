# ⚡ SecondBrain Quick Start

Get up and running in 5 minutes!

## Prerequisites

- Docker & Docker Compose installed
- 8GB RAM available
- 10GB disk space

## Setup (Choose One Method)

### Method 1: Automated Setup (Recommended)

**Windows:**
```cmd
cd Second_Brain
setup.bat
```

**Linux/Mac:**
```bash
cd Second_Brain
chmod +x setup.sh
./setup.sh
```

### Method 2: Manual Setup

```bash
# 1. Navigate to project
cd Second_Brain

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials (SUPABASE_URL, GITHUB_TOKEN, etc.)

# 3. Start services
docker-compose up -d

# 4. Wait 2-3 minutes, then run migrations
docker-compose exec api alembic upgrade head

# 5. Setup Neo4j (optional)
docker-compose exec api python scripts/setup_neo4j_schema.py
```

## Access Your Application

| Service | URL | Credentials |
|---------|-----|-------------|
| **Web UI** | http://localhost:3000 | - |
| **API Docs** | http://localhost:8000/docs | - |
| **Neo4j Browser** | http://localhost:7474 | neo4j / secondbrain |
| **Elasticsearch** | http://localhost:9200 | - |

## Essential Commands

```bash
# View logs
docker-compose logs -f

# Stop everything
docker-compose down

# Restart a service
docker-compose restart api

# Check status
docker-compose ps

# Access database
docker-compose exec postgres psql -U secondbrain -d secondbrain

# Run migrations
docker-compose exec api alembic upgrade head
```

## Troubleshooting

**Services won't start?**
```bash
docker-compose down -v
docker-compose up -d
```

**Check logs for errors:**
```bash
docker-compose logs api
docker-compose logs postgres
```

**Port already in use?**
```bash
# Check what's using the port
netstat -ano | findstr :8000  # Windows
lsof -i :8000                 # Linux/Mac
```

## Next Steps

1. ✅ Configure `.env` with your API keys
2. ✅ Access the web UI at http://localhost:3000
3. ✅ Explore API docs at http://localhost:8000/docs
4. ✅ Start uploading your knowledge!

## Need More Help?

- 📖 Full setup guide: [SETUP.md](SETUP.md)
- 🐳 Docker commands: [DOCKER_COMMANDS.md](DOCKER_COMMANDS.md)
- 📋 Check logs: `docker-compose logs -f`

---

**Happy Knowledge Building! 🧠**
