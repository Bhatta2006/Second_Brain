# 🚀 SecondBrain Setup Guide

This guide will help you set up the SecondBrain application using Docker.

## Prerequisites

- **Docker** (v20.10+) and **Docker Compose** (v2.0+)
- **Git**
- **pnpm** (for local web development, optional)
- At least **8GB RAM** available for Docker
- **10GB** free disk space

## Quick Start

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd Second_Brain
```

### 2. Configure Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your actual credentials
# At minimum, you need to configure:
# - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET
# - GITHUB_TOKEN (for AI models)
# - AWS credentials (if using S3)
```

### 3. Create Required Directories

```bash
# Create the database initialization directory
mkdir -p infra/db
```

### 4. Create Database Initialization Script

Create `infra/db/init.sql`:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create initial schema (Alembic will handle the rest)
-- This file can be empty if you prefer to let Alembic handle everything
```

### 5. Start All Services

```bash
# Navigate to the Second_Brain directory
cd Second_Brain

# Start all services in detached mode
docker-compose up -d

# View logs (optional)
docker-compose logs -f
```

### 6. Wait for Services to be Healthy

```bash
# Check service status
docker-compose ps

# Wait for all services to show "healthy" or "running"
# This may take 2-3 minutes on first startup
```

### 7. Run Database Migrations

```bash
# Run Alembic migrations
docker-compose exec api alembic upgrade head
```

### 8. Set Up Neo4j Schema (Optional)

```bash
# If using Neo4j knowledge graph
docker-compose exec api python scripts/setup_neo4j_schema.py
```

### 9. Access the Application

- **Web UI**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs
- **Neo4j Browser**: http://localhost:7474 (user: neo4j, password: secondbrain)
- **Elasticsearch**: http://localhost:9200

## Detailed Docker Commands

### Starting Services

```bash
# Start all services
docker-compose up -d

# Start specific services
docker-compose up -d postgres redis neo4j

# Start with build (if you made code changes)
docker-compose up -d --build

# Start and view logs
docker-compose up
```

### Stopping Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ deletes all data)
docker-compose down -v

# Stop specific service
docker-compose stop api
```

### Viewing Logs

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f api
docker-compose logs -f worker
docker-compose logs -f web

# View last 100 lines
docker-compose logs --tail=100 api
```

### Restarting Services

```bash
# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart api
docker-compose restart worker
```

### Executing Commands in Containers

```bash
# Run Alembic migrations
docker-compose exec api alembic upgrade head

# Create a new migration
docker-compose exec api alembic revision --autogenerate -m "description"

# Access Python shell in API container
docker-compose exec api python

# Access PostgreSQL
docker-compose exec postgres psql -U secondbrain -d secondbrain

# Access Redis CLI
docker-compose exec redis redis-cli

# Run Neo4j setup script
docker-compose exec api python scripts/setup_neo4j_schema.py

# Rebuild Neo4j graph
docker-compose exec api python scripts/rebuild_neo4j.py
```

### Rebuilding Containers

```bash
# Rebuild all containers
docker-compose build

# Rebuild specific service
docker-compose build api
docker-compose build web

# Rebuild without cache
docker-compose build --no-cache

# Rebuild and restart
docker-compose up -d --build
```

### Checking Service Health

```bash
# Check status of all services
docker-compose ps

# Check specific service
docker-compose ps api

# View resource usage
docker stats

# Inspect a service
docker-compose exec api env
```

### Managing Volumes

```bash
# List volumes
docker volume ls

# Inspect a volume
docker volume inspect secondbrain_postgres_data

# Remove unused volumes
docker volume prune

# Backup PostgreSQL data
docker-compose exec postgres pg_dump -U secondbrain secondbrain > backup.sql

# Restore PostgreSQL data
docker-compose exec -T postgres psql -U secondbrain secondbrain < backup.sql
```

## Troubleshooting

### Services Won't Start

```bash
# Check logs for errors
docker-compose logs

# Check if ports are already in use
netstat -an | grep -E "3000|8000|5432|6379|7474|7687|9200"

# Remove old containers and volumes
docker-compose down -v
docker-compose up -d
```

### Database Connection Issues

```bash
# Check if PostgreSQL is healthy
docker-compose exec postgres pg_isready -U secondbrain

# Verify connection string
docker-compose exec api env | grep DATABASE_URL

# Check PostgreSQL logs
docker-compose logs postgres
```

### Neo4j Connection Issues

```bash
# Check Neo4j status
docker-compose logs neo4j

# Verify Neo4j is accessible
curl http://localhost:7474

# Check Bolt connection
docker-compose exec api python -c "from neo4j import GraphDatabase; driver = GraphDatabase.driver('bolt://neo4j:7687', auth=('neo4j', 'secondbrain')); driver.verify_connectivity(); print('Connected!')"
```

### Elasticsearch Issues

```bash
# Check Elasticsearch health
curl http://localhost:9200/_cluster/health

# View Elasticsearch logs
docker-compose logs elasticsearch

# Increase memory if needed (edit docker-compose.yml)
# ES_JAVA_OPTS=-Xms1g -Xmx2g
```

### Worker/Celery Issues

```bash
# Check worker logs
docker-compose logs worker

# Check Redis connection
docker-compose exec redis redis-cli ping

# Restart worker
docker-compose restart worker beat
```

### Web App Issues

```bash
# Check web logs
docker-compose logs web

# Rebuild web container
docker-compose build web
docker-compose up -d web

# Check if API is accessible from web container
docker-compose exec web curl http://api:8000/health
```

### Clean Slate Reset

```bash
# Stop everything
docker-compose down -v

# Remove all containers, networks, and volumes
docker system prune -a --volumes

# Start fresh
docker-compose up -d --build
```

## Development Workflow

### Making Code Changes

```bash
# API changes (auto-reload enabled)
# Edit files in apps/api/
# Changes will be reflected automatically

# Web changes (auto-reload enabled)
# Edit files in apps/web/
# Changes will be reflected automatically

# If changes don't reflect, rebuild:
docker-compose up -d --build api
docker-compose up -d --build web
```

### Running Tests

```bash
# Run API tests
docker-compose exec api pytest

# Run specific test file
docker-compose exec api pytest tests/test_items.py

# Run with coverage
docker-compose exec api pytest --cov=app
```

### Database Migrations

```bash
# Create a new migration
docker-compose exec api alembic revision --autogenerate -m "add new field"

# Apply migrations
docker-compose exec api alembic upgrade head

# Rollback one migration
docker-compose exec api alembic downgrade -1

# View migration history
docker-compose exec api alembic history
```

## Production Deployment

For production deployment, consider:

1. **Use production-grade environment variables**
2. **Enable SSL/TLS for all services**
3. **Use managed databases** (AWS RDS, Supabase, etc.)
4. **Set up proper monitoring** (Prometheus, Grafana)
5. **Configure backups** for PostgreSQL and Neo4j
6. **Use a reverse proxy** (Nginx, Traefik)
7. **Implement rate limiting**
8. **Set up log aggregation** (ELK stack, CloudWatch)

## Useful Commands Cheat Sheet

```bash
# Start everything
docker-compose up -d

# Stop everything
docker-compose down

# View logs
docker-compose logs -f [service]

# Restart a service
docker-compose restart [service]

# Rebuild and restart
docker-compose up -d --build [service]

# Run migrations
docker-compose exec api alembic upgrade head

# Access database
docker-compose exec postgres psql -U secondbrain -d secondbrain

# Check service status
docker-compose ps

# View resource usage
docker stats

# Clean up
docker-compose down -v
docker system prune -a
```

## Next Steps

1. Configure your Supabase project and update `.env`
2. Set up GitHub token for AI models
3. Configure AWS S3 for file storage (optional)
4. Explore the API documentation at http://localhost:8000/docs
5. Start building your knowledge base!

## Support

For issues and questions:
- Check the logs: `docker-compose logs -f`
- Review the documentation in `/docs`
- Open an issue on GitHub

---

**Happy Knowledge Building! 🧠**
