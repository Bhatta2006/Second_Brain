# 🐳 SecondBrain Docker Setup - Complete Guide

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Essential Commands](#essential-commands)
3. [Service URLs](#service-urls)
4. [Troubleshooting](#troubleshooting)
5. [Documentation](#documentation)

---

## 🚀 Quick Start

### Prerequisites
- Docker Desktop installed and running
- 8GB RAM available
- 10GB disk space

### Setup in 3 Steps

**Step 1: Configure Environment**
```bash
cd Second_Brain
cp .env.example .env
# Edit .env with your credentials (see ENV_SETUP.md)
```

**Step 2: Start Services**
```bash
docker-compose up -d
```

**Step 3: Run Migrations**
```bash
# Wait 2-3 minutes for services to start, then:
docker-compose exec api alembic upgrade head
```

**Done!** Access your app at http://localhost:3000

---

## ⚡ Essential Commands

### Daily Operations

```bash
# Start everything
docker-compose up -d

# Stop everything
docker-compose down

# View logs
docker-compose logs -f

# Check status
docker-compose ps

# Restart a service
docker-compose restart api
```

### Development

```bash
# Rebuild after code changes
docker-compose up -d --build api

# View API logs
docker-compose logs -f api

# Access Python shell
docker-compose exec api python

# Run tests
docker-compose exec api pytest
```

### Database

```bash
# Run migrations
docker-compose exec api alembic upgrade head

# Access PostgreSQL
docker-compose exec postgres psql -U secondbrain -d secondbrain

# Backup database
docker-compose exec postgres pg_dump -U secondbrain secondbrain > backup.sql

# Restore database
docker-compose exec -T postgres psql -U secondbrain secondbrain < backup.sql
```

### Debugging

```bash
# Check service health
docker-compose ps

# View specific service logs
docker-compose logs api
docker-compose logs postgres
docker-compose logs redis

# Check resource usage
docker stats

# Access container shell
docker-compose exec api bash
```

---

## 🌐 Service URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| **Web UI** | http://localhost:3000 | - |
| **API Documentation** | http://localhost:8000/docs | - |
| **API Health Check** | http://localhost:8000/health | - |
| **Neo4j Browser** | http://localhost:7474 | neo4j / secondbrain |
| **Elasticsearch** | http://localhost:9200 | - |
| **PostgreSQL** | localhost:5432 | secondbrain / secondbrain |
| **Redis** | localhost:6379 | - |

---

## 🔧 Troubleshooting

### Services Won't Start

```bash
# Check logs for errors
docker-compose logs

# Reset everything
docker-compose down -v
docker-compose up -d
```

### Port Already in Use

```bash
# Windows: Check what's using the port
netstat -ano | findstr :8000

# Linux/Mac: Check what's using the port
lsof -i :8000

# Kill the process or change port in docker-compose.yml
```

### Database Connection Failed

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Check PostgreSQL logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres pg_isready -U secondbrain
```

### Out of Memory

```bash
# Check Docker resource usage
docker stats

# Increase Docker Desktop memory:
# Docker Desktop → Settings → Resources → Memory → 8GB+
```

### Slow Performance

```bash
# Check resource usage
docker stats

# Restart services
docker-compose restart

# Prune unused resources
docker system prune
```

---

## 📚 Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Get started in 5 minutes
- **[SETUP.md](SETUP.md)** - Detailed setup guide
- **[ENV_SETUP.md](ENV_SETUP.md)** - Environment configuration
- **[DOCKER_COMMANDS.md](DOCKER_COMMANDS.md)** - Complete Docker reference

---

## 🎯 Common Workflows

### First Time Setup

```bash
# 1. Clone and navigate
cd Second_Brain

# 2. Configure
cp .env.example .env
# Edit .env with your credentials

# 3. Start services
docker-compose up -d

# 4. Wait for services (2-3 minutes)
docker-compose ps

# 5. Run migrations
docker-compose exec api alembic upgrade head

# 6. Setup Neo4j (optional)
docker-compose exec api python scripts/setup_neo4j_schema.py

# 7. Access app
# Open http://localhost:3000
```

### Daily Development

```bash
# Start your day
docker-compose up -d
docker-compose logs -f api

# Make code changes
# (Auto-reload is enabled)

# If changes don't reflect
docker-compose restart api

# End your day
docker-compose down
```

### Updating Dependencies

```bash
# Python (API)
docker-compose exec api pip install new-package
docker-compose exec api pip freeze > requirements.txt
docker-compose up -d --build api

# Node.js (Web)
docker-compose exec web pnpm add new-package
docker-compose up -d --build web
```

### Database Migrations

```bash
# Create new migration
docker-compose exec api alembic revision --autogenerate -m "add new field"

# Review migration file
# Edit apps/api/alembic/versions/xxx_add_new_field.py

# Apply migration
docker-compose exec api alembic upgrade head

# Rollback if needed
docker-compose exec api alembic downgrade -1
```

### Backup & Restore

```bash
# Backup everything
docker-compose exec postgres pg_dump -U secondbrain secondbrain > backup_$(date +%Y%m%d).sql

# Restore
docker-compose exec -T postgres psql -U secondbrain secondbrain < backup.sql

# Backup volumes
docker run --rm -v secondbrain_postgres_data:/data -v $(pwd):/backup ubuntu tar czf /backup/postgres_backup.tar.gz /data
```

---

## 🆘 Emergency Commands

### Complete Reset

```bash
# ⚠️ WARNING: This deletes ALL data!

# Stop and remove everything
docker-compose down -v

# Remove all Docker resources
docker system prune -a --volumes

# Start fresh
docker-compose up -d --build
```

### Fix Stuck Containers

```bash
# Force remove stuck container
docker rm -f secondbrain-api

# Restart Docker Desktop
# (Use Docker Desktop UI or system tray)
```

### Clear Logs

```bash
# Clear all Docker logs
truncate -s 0 $(docker inspect --format='{{.LogPath}}' secondbrain-api)
```

---

## 📊 Service Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Client Layer                         │
│              (Web Browser / Mobile App)                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   Next.js Web App                        │
│                  (Port 3000)                             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   FastAPI Backend                        │
│                  (Port 8000)                             │
└─────┬──────┬──────┬──────┬──────┬──────────────────────┘
      │      │      │      │      │
      ▼      ▼      ▼      ▼      ▼
   ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────────┐
   │ PG │ │Neo4│ │ ES │ │Redis│ │Celery │
   │5432│ │7687│ │9200│ │6379 │ │Worker │
   └────┘ └────┘ └────┘ └────┘ └────────┘
```

---

## 🔐 Security Checklist

- [ ] `.env` file is in `.gitignore`
- [ ] Strong passwords for all services
- [ ] Supabase service role key is kept secret
- [ ] AWS credentials have minimal permissions
- [ ] GitHub token has minimal scopes
- [ ] CORS origins are properly configured
- [ ] Production uses HTTPS
- [ ] Database backups are automated

---

## 🎓 Learning Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Neo4j Documentation](https://neo4j.com/docs/)

---

## 💡 Tips & Tricks

### Use Docker Compose Aliases

Add to your shell config (`.bashrc`, `.zshrc`):

```bash
alias dc='docker-compose'
alias dcu='docker-compose up -d'
alias dcd='docker-compose down'
alias dcl='docker-compose logs -f'
alias dcp='docker-compose ps'
```

### Monitor Resource Usage

```bash
# Real-time monitoring
watch docker stats

# Or use Docker Desktop dashboard
```

### Speed Up Builds

```bash
# Use BuildKit for faster builds
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

docker-compose build
```

### Cleanup Regularly

```bash
# Weekly cleanup
docker system prune -a

# Remove unused volumes
docker volume prune
```

---

## 📞 Support

**Need help?**

1. Check the logs: `docker-compose logs -f`
2. Review documentation in `/docs`
3. Search existing issues on GitHub
4. Open a new issue with logs and error messages

---

**Built with ❤️ for the future of knowledge. Happy building! 🧠**
