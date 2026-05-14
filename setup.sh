#!/bin/bash

# SecondBrain Setup Script
# This script automates the initial setup of SecondBrain

set -e  # Exit on error

echo "🧠 SecondBrain Setup Script"
echo "=========================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your actual credentials before proceeding!"
    echo "   Required: SUPABASE_URL, SUPABASE_ANON_KEY, GITHUB_TOKEN"
    echo ""
    read -p "Press Enter after you've configured .env file..."
else
    echo "✅ .env file already exists"
fi

echo ""
echo "🚀 Starting Docker services..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be healthy (this may take 2-3 minutes)..."
sleep 10

# Wait for PostgreSQL
echo "   Waiting for PostgreSQL..."
until docker-compose exec -T postgres pg_isready -U secondbrain -d secondbrain &> /dev/null; do
    echo -n "."
    sleep 2
done
echo " ✅"

# Wait for Redis
echo "   Waiting for Redis..."
until docker-compose exec -T redis redis-cli ping &> /dev/null; do
    echo -n "."
    sleep 2
done
echo " ✅"

# Wait for Elasticsearch
echo "   Waiting for Elasticsearch..."
until curl -s http://localhost:9200/_cluster/health &> /dev/null; do
    echo -n "."
    sleep 2
done
echo " ✅"

# Wait for Neo4j
echo "   Waiting for Neo4j..."
until curl -s http://localhost:7474 &> /dev/null; do
    echo -n "."
    sleep 2
done
echo " ✅"

echo ""
echo "🔄 Running database migrations..."
docker-compose exec -T api alembic upgrade head

echo ""
echo "🕸️  Setting up Neo4j schema..."
docker-compose exec -T api python scripts/setup_neo4j_schema.py || echo "⚠️  Neo4j setup skipped (optional)"

echo ""
echo "✅ Setup complete!"
echo ""
echo "🌐 Access your application:"
echo "   - Web UI:        http://localhost:3000"
echo "   - API Docs:      http://localhost:8000/docs"
echo "   - Neo4j Browser: http://localhost:7474 (neo4j/secondbrain)"
echo "   - Elasticsearch: http://localhost:9200"
echo ""
echo "📋 Useful commands:"
echo "   - View logs:     docker-compose logs -f"
echo "   - Stop services: docker-compose down"
echo "   - Restart:       docker-compose restart"
echo ""
echo "Happy knowledge building! 🧠"
