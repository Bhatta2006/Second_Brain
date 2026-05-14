# 🐳 Docker Commands Reference

Quick reference for all Docker commands used in SecondBrain.

## 🚀 Quick Start Commands

### Initial Setup (Automated)

**Linux/Mac:**
```bash
cd Second_Brain
chmod +x setup.sh
./setup.sh
```

**Windows:**
```cmd
cd Second_Brain
setup.bat
```

### Manual Setup

```bash
# 1. Navigate to project directory
cd Second_Brain

# 2. Copy environment file
cp .env.example .env

# 3. Edit .env with your credentials
# (Use your favorite text editor)

# 4. Start all services
docker-compose up -d

# 5. Wait for services to be ready (2-3 minutes)
docker-compose ps

# 6. Run database migrations
docker-compose exec api alembic upgrade head

# 7. Setup Neo4j (optional)
docker-compose exec api python scripts/setup_neo4j_schema.py
```

## 📦 Service Management

### Starting Services

```bash
# Start all services in background
docker-compose up -d

# Start all services with logs visible
docker-compose up

# Start specific services only
docker-compose up -d postgres redis neo4j

# Start with forced rebuild
docker-compose up -d --build

# Start and scale workers
docker-compose up -d --scale worker=3
```

### Stopping Services

```bash
# Stop all services (keeps data)
docker-compose stop

# Stop and remove containers (keeps data)
docker-compose down

# Stop and remove everything including volumes (⚠️ DELETES ALL DATA)
docker-compose down -v

# Stop specific service
docker-compose stop api
```

### Restarting Services

```bash
# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart api

# Restart multiple services
docker-compose restart api worker beat
```

## 📊 Monitoring & Logs

### Viewing Logs

```bash
# View all logs (follow mode)
docker-compose logs -f

# View specific service logs
docker-compose logs -f api
docker-compose logs -f worker
docker-compose logs -f web
docker-compose logs -f postgres

# View last N lines
docker-compose logs --tail=50 api

# View logs since timestamp
docker-compose logs --since 2024-01-01T00:00:00 api

# View logs without following
docker-compose logs api
```

### Service Status

```bash
# Check status of all services
docker-compose ps

# Check detailed status
docker-compose ps -a

# Check resource usage
docker stats

# Check specific service
docker inspect secondbrain-api
```

## 🔧 Container Operations

### Executing Commands

```bash
# Access bash shell in API container
docker-compose exec api bash

# Access Python shell
docker-compose exec api python

# Run a one-off command
docker-compose exec api ls -la

# Run command without TTY (for scripts)
docker-compose exec -T api python script.py
```

### Database Operations

```bash
# Access PostgreSQL
docker-compose exec postgres psql -U secondbrain -d secondbrain

# Run SQL query
docker-compose exec postgres psql -U secondbrain -d secondbrain -c "SELECT COUNT(*) FROM items;"

# Dump database
docker-compose exec postgres pg_dump -U secondbrain secondbrain > backup.sql

# Restore database
docker-compose exec -T postgres psql -U secondbrain secondbrain < backup.sql

# Check database size
docker-compose exec postgres psql -U secondbrain -d secondbrain -c "SELECT pg_size_pretty(pg_database_size('secondbrain'));"
```

### Redis Operations

```bash
# Access Redis CLI
docker-compose exec redis redis-cli

# Check Redis info
docker-compose exec redis redis-cli INFO

# Monitor Redis commands
docker-compose exec redis redis-cli MONITOR

# Check Redis keys
docker-compose exec redis redis-cli KEYS "*"

# Flush Redis (⚠️ clears all cache)
docker-compose exec redis redis-cli FLUSHALL
```

### Neo4j Operations

```bash
# Access Neo4j Cypher shell
docker-compose exec neo4j cypher-shell -u neo4j -p secondbrain

# Run Cypher query
docker-compose exec neo4j cypher-shell -u neo4j -p secondbrain "MATCH (n) RETURN count(n);"

# Check Neo4j status
curl http://localhost:7474

# Setup Neo4j schema
docker-compose exec api python scripts/setup_neo4j_schema.py

# Rebuild Neo4j graph
docker-compose exec api python scripts/rebuild_neo4j.py
```

### Elasticsearch Operations

```bash
# Check cluster health
curl http://localhost:9200/_cluster/health?pretty

# List indices
curl http://localhost:9200/_cat/indices?v

# Check specific index
curl http://localhost:9200/items/_search?pretty

# Delete index (⚠️ deletes data)
curl -X DELETE http://localhost:9200/items

# Get cluster stats
curl http://localhost:9200/_cluster/stats?pretty
```

## 🗄️ Database Migrations

### Alembic Commands

```bash
# Run all pending migrations
docker-compose exec api alembic upgrade head

# Rollback one migration
docker-compose exec api alembic downgrade -1

# Rollback to specific version
docker-compose exec api alembic downgrade <revision_id>

# Create new migration (auto-generate)
docker-compose exec api alembic revision --autogenerate -m "description"

# Create empty migration
docker-compose exec api alembic revision -m "description"

# View migration history
docker-compose exec api alembic history

# View current version
docker-compose exec api alembic current

# Show SQL without executing
docker-compose exec api alembic upgrade head --sql
```

## 🏗️ Building & Rebuilding

### Building Images

```bash
# Build all images
docker-compose build

# Build specific service
docker-compose build api
docker-compose build web

# Build without cache (clean build)
docker-compose build --no-cache

# Build with progress output
docker-compose build --progress=plain

# Build and start
docker-compose up -d --build
```

### Cleaning Up

```bash
# Remove stopped containers
docker-compose rm

# Remove all containers, networks, volumes
docker-compose down -v

# Remove unused Docker resources
docker system prune

# Remove everything (⚠️ including images)
docker system prune -a

# Remove specific volume
docker volume rm secondbrain_postgres_data

# Remove all unused volumes
docker volume prune
```

## 🧪 Testing & Development

### Running Tests

```bash
# Run all tests
docker-compose exec api pytest

# Run specific test file
docker-compose exec api pytest tests/test_items.py

# Run with coverage
docker-compose exec api pytest --cov=app

# Run with verbose output
docker-compose exec api pytest -v

# Run specific test
docker-compose exec api pytest tests/test_items.py::test_create_item
```

### Development Workflow

```bash
# Watch API logs during development
docker-compose logs -f api

# Restart API after code changes (if auto-reload fails)
docker-compose restart api

# Rebuild after dependency changes
docker-compose up -d --build api

# Install new Python package
docker-compose exec api pip install package-name
docker-compose exec api pip freeze > requirements.txt

# Install new npm package (web)
docker-compose exec web pnpm add package-name
```

## 🔍 Debugging

### Inspecting Containers

```bash
# View container details
docker inspect secondbrain-api

# View container environment variables
docker-compose exec api env

# View container processes
docker-compose exec api ps aux

# View container filesystem
docker-compose exec api ls -la /app

# Check container networking
docker network inspect secondbrain_default
```

### Health Checks

```bash
# Check PostgreSQL
docker-compose exec postgres pg_isready -U secondbrain

# Check Redis
docker-compose exec redis redis-cli ping

# Check API health endpoint
curl http://localhost:8000/health

# Check Elasticsearch
curl http://localhost:9200/_cluster/health

# Check Neo4j
curl http://localhost:7474
```

### Troubleshooting

```bash
# View container resource usage
docker stats

# Check disk usage
docker system df

# View Docker events
docker events

# Check container exit code
docker-compose ps -a

# View full container logs
docker logs secondbrain-api

# Follow logs from container start
docker logs -f --since 1h secondbrain-api
```

## 💾 Backup & Restore

### PostgreSQL Backup

```bash
# Full database backup
docker-compose exec postgres pg_dump -U secondbrain secondbrain > backup_$(date +%Y%m%d).sql

# Backup with compression
docker-compose exec postgres pg_dump -U secondbrain secondbrain | gzip > backup_$(date +%Y%m%d).sql.gz

# Backup specific tables
docker-compose exec postgres pg_dump -U secondbrain -t items -t folders secondbrain > backup_tables.sql

# Restore from backup
docker-compose exec -T postgres psql -U secondbrain secondbrain < backup.sql

# Restore from compressed backup
gunzip -c backup.sql.gz | docker-compose exec -T postgres psql -U secondbrain secondbrain
```

### Neo4j Backup

```bash
# Export all data
docker-compose exec neo4j cypher-shell -u neo4j -p secondbrain "CALL apoc.export.cypher.all('backup.cypher', {})"

# Backup Neo4j data directory
docker cp secondbrain-neo4j:/data ./neo4j_backup

# Restore Neo4j data
docker cp ./neo4j_backup secondbrain-neo4j:/data
docker-compose restart neo4j
```

### Volume Backup

```bash
# Backup PostgreSQL volume
docker run --rm -v secondbrain_postgres_data:/data -v $(pwd):/backup ubuntu tar czf /backup/postgres_backup.tar.gz /data

# Restore PostgreSQL volume
docker run --rm -v secondbrain_postgres_data:/data -v $(pwd):/backup ubuntu tar xzf /backup/postgres_backup.tar.gz -C /
```

## 🌐 Networking

### Network Commands

```bash
# List networks
docker network ls

# Inspect network
docker network inspect secondbrain_default

# Connect container to network
docker network connect secondbrain_default my-container

# Disconnect container from network
docker network disconnect secondbrain_default my-container

# Test connectivity between containers
docker-compose exec api ping postgres
docker-compose exec api curl http://redis:6379
```

## 📈 Performance

### Resource Management

```bash
# Limit container resources (edit docker-compose.yml)
# Add under service:
#   deploy:
#     resources:
#       limits:
#         cpus: '0.5'
#         memory: 512M

# View resource usage
docker stats --no-stream

# View resource usage for specific container
docker stats secondbrain-api --no-stream
```

## 🔐 Security

### Security Commands

```bash
# Scan image for vulnerabilities
docker scan secondbrain-api

# View container security options
docker inspect --format='{{.HostConfig.SecurityOpt}}' secondbrain-api

# Run container with read-only filesystem
# (Add to docker-compose.yml: read_only: true)

# Check for exposed secrets
docker-compose config | grep -i "password\|secret\|key"
```

## 📝 Useful Aliases

Add these to your `.bashrc` or `.zshrc`:

```bash
# Docker Compose shortcuts
alias dc='docker-compose'
alias dcu='docker-compose up -d'
alias dcd='docker-compose down'
alias dcl='docker-compose logs -f'
alias dcp='docker-compose ps'
alias dcr='docker-compose restart'

# SecondBrain specific
alias sb-logs='docker-compose logs -f api worker'
alias sb-restart='docker-compose restart api worker beat'
alias sb-migrate='docker-compose exec api alembic upgrade head'
alias sb-shell='docker-compose exec api python'
alias sb-db='docker-compose exec postgres psql -U secondbrain -d secondbrain'
```

## 🆘 Emergency Commands

### When Things Go Wrong

```bash
# Nuclear option: Reset everything
docker-compose down -v
docker system prune -a --volumes
docker-compose up -d --build

# Fix permission issues
docker-compose exec api chown -R root:root /app

# Clear all logs
truncate -s 0 $(docker inspect --format='{{.LogPath}}' secondbrain-api)

# Force remove stuck container
docker rm -f secondbrain-api

# Restart Docker daemon (Linux)
sudo systemctl restart docker

# Restart Docker Desktop (Windows/Mac)
# Use Docker Desktop UI or restart from system tray
```

---

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Next.js Documentation](https://nextjs.org/docs)

---

**Need help? Check the logs first: `docker-compose logs -f`**
