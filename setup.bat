@echo off
REM SecondBrain Setup Script for Windows
REM This script automates the initial setup of SecondBrain

echo.
echo 🧠 SecondBrain Setup Script
echo ==========================
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not installed. Please install Docker Desktop first.
    pause
    exit /b 1
)

REM Check if Docker Compose is installed
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker Compose is not installed. Please install Docker Compose first.
    pause
    exit /b 1
)

echo ✅ Docker and Docker Compose are installed
echo.

REM Check if .env file exists
if not exist .env (
    echo 📝 Creating .env file from .env.example...
    copy .env.example .env
    echo ⚠️  Please edit .env file with your actual credentials before proceeding!
    echo    Required: SUPABASE_URL, SUPABASE_ANON_KEY, GITHUB_TOKEN
    echo.
    pause
) else (
    echo ✅ .env file already exists
)

echo.
echo 🚀 Starting Docker services...
docker-compose up -d

echo.
echo ⏳ Waiting for services to be healthy (this may take 2-3 minutes)...
timeout /t 10 /nobreak >nul

REM Wait for PostgreSQL
echo    Waiting for PostgreSQL...
:wait_postgres
docker-compose exec -T postgres pg_isready -U secondbrain -d secondbrain >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto wait_postgres
)
echo    ✅ PostgreSQL ready

REM Wait for Redis
echo    Waiting for Redis...
:wait_redis
docker-compose exec -T redis redis-cli ping >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto wait_redis
)
echo    ✅ Redis ready

REM Wait for Elasticsearch
echo    Waiting for Elasticsearch...
:wait_elasticsearch
curl -s http://localhost:9200/_cluster/health >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto wait_elasticsearch
)
echo    ✅ Elasticsearch ready

REM Wait for Neo4j
echo    Waiting for Neo4j...
:wait_neo4j
curl -s http://localhost:7474 >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto wait_neo4j
)
echo    ✅ Neo4j ready

echo.
echo 🔄 Running database migrations...
docker-compose exec -T api alembic upgrade head

echo.
echo 🕸️  Setting up Neo4j schema...
docker-compose exec -T api python scripts/setup_neo4j_schema.py 2>nul || echo ⚠️  Neo4j setup skipped (optional)

echo.
echo ✅ Setup complete!
echo.
echo 🌐 Access your application:
echo    - Web UI:        http://localhost:3000
echo    - API Docs:      http://localhost:8000/docs
echo    - Neo4j Browser: http://localhost:7474 (neo4j/secondbrain)
echo    - Elasticsearch: http://localhost:9200
echo.
echo 📋 Useful commands:
echo    - View logs:     docker-compose logs -f
echo    - Stop services: docker-compose down
echo    - Restart:       docker-compose restart
echo.
echo Happy knowledge building! 🧠
echo.
pause
