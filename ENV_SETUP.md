# 🔐 Environment Configuration Guide

Complete guide to configuring your `.env` file for SecondBrain.

## Quick Setup

```bash
# Copy the example file
cp .env.example .env

# Edit with your favorite editor
nano .env  # or vim, code, notepad, etc.
```

## Required Configuration

### 1. Supabase (Authentication & Database)

**Get your credentials:**
1. Go to https://supabase.com
2. Create a new project (or use existing)
3. Go to Settings → API

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_JWT_SECRET=your-jwt-secret-from-supabase
```

**Where to find:**
- `SUPABASE_URL`: Settings → API → Project URL
- `SUPABASE_ANON_KEY`: Settings → API → Project API keys → anon public
- `SUPABASE_SERVICE_ROLE_KEY`: Settings → API → Project API keys → service_role (⚠️ Keep secret!)
- `SUPABASE_JWT_SECRET`: Settings → API → JWT Settings → JWT Secret

### 2. GitHub Token (AI Models)

SecondBrain uses GitHub Models for AI features (free tier available).

**Get your token:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `read:user`, `read:org`
4. Copy the token

```env
GITHUB_TOKEN=github_pat_11AAAAAAA0XXXXXXXXXXXXXXXXX
GITHUB_MODELS_ENDPOINT=https://models.github.ai/inference
```

**Models used:**
```env
EMBEDDING_MODEL=openai/text-embedding-3-large
CLASSIFICATION_MODEL=openai/gpt-4o
SUMMARISATION_MODEL=openai/gpt-4o-mini
```

### 3. AWS S3 (File Storage)

**Option A: Use AWS S3**
1. Create an S3 bucket in AWS Console
2. Create IAM user with S3 access
3. Generate access keys

```env
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=ap-south-1
S3_BUCKET=secondbrain-production
```

**Option B: Use MinIO (Local S3-compatible storage)**
```bash
# Add to docker-compose.yml
minio:
  image: minio/minio
  ports:
    - "9000:9000"
    - "9001:9001"
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin
  command: server /data --console-address ":9001"
```

```env
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
S3_BUCKET=secondbrain-local
AWS_ENDPOINT_URL=http://minio:9000  # Add this line
```

## Optional Configuration

### Database URLs (Auto-configured in Docker)

These are automatically set in `docker-compose.yml`, but you can override:

```env
DATABASE_URL=postgresql+asyncpg://secondbrain:secondbrain@localhost:5432/secondbrain
DATABASE_URL_SYNC=postgresql://secondbrain:secondbrain@localhost:5432/secondbrain
```

### Redis (Auto-configured in Docker)

```env
REDIS_URL=redis://localhost:6379/0
```

### Neo4j (Auto-configured in Docker)

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=secondbrain
```

### Elasticsearch (Auto-configured in Docker)

```env
ELASTICSEARCH_URL=http://localhost:9200
```

### Feature Flags

```env
# Enable/disable Neo4j knowledge graph
USE_NEO4J_GRAPH=true  # Set to false to use PostgreSQL edges table instead
```

### API Configuration

```env
API_ENV=development  # or production
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

### Next.js (Web App)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

## Environment-Specific Configurations

### Development (Local)

```env
API_ENV=development
CORS_ORIGINS=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Production

```env
API_ENV=production
CORS_ORIGINS=https://yourdomain.com
NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# Use production-grade secrets
SUPABASE_JWT_SECRET=<strong-random-secret>

# Enable HTTPS
# Configure reverse proxy (Nginx, Traefik, etc.)
```

### Staging

```env
API_ENV=staging
CORS_ORIGINS=https://staging.yourdomain.com
NEXT_PUBLIC_API_URL=https://api-staging.yourdomain.com
```

## Complete Example

Here's a complete `.env` file with all required values:

```env
# ─── PostgreSQL ────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://secondbrain:secondbrain@postgres:5432/secondbrain
DATABASE_URL_SYNC=postgresql://secondbrain:secondbrain@postgres:5432/secondbrain

# ─── Redis ─────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ─── Neo4j ─────────────────────────────────────────────
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=secondbrain

# ─── Elasticsearch ─────────────────────────────────────
ELASTICSEARCH_URL=http://elasticsearch:9200

# ─── Supabase Auth ─────────────────────────────────────
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYxNjE2MTYxNiwiZXhwIjoxOTMxNzM3NjE2fQ.example
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjE2MTYxNjE2LCJleHAiOjE5MzE3Mzc2MTZ9.example
SUPABASE_JWT_SECRET=your-super-secret-jwt-secret-min-32-characters

# ─── AWS / S3 ──────────────────────────────────────────
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=ap-south-1
S3_BUCKET=secondbrain-production

# ─── GitHub Models ─────────────────────────────────────
GITHUB_TOKEN=github_pat_11AAAAAAA0XXXXXXXXXXXXXXXXX
GITHUB_MODELS_ENDPOINT=https://models.github.ai/inference
EMBEDDING_MODEL=openai/text-embedding-3-large
CLASSIFICATION_MODEL=openai/gpt-4o
SUMMARISATION_MODEL=openai/gpt-4o-mini

# ─── Feature flags ─────────────────────────────────────
USE_NEO4J_GRAPH=true

# ─── App ───────────────────────────────────────────────
API_ENV=development
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=http://localhost:3000

# ─── Next.js ───────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

## Validation

After configuring your `.env`, validate it:

```bash
# Check if all required variables are set
docker-compose config

# Test database connection
docker-compose exec api python -c "from app.database import engine; print('DB OK')"

# Test Redis connection
docker-compose exec api python -c "from app.cache.redis_client import redis_client; print('Redis OK')"

# Test Supabase connection
curl -H "apikey: YOUR_ANON_KEY" https://your-project.supabase.co/rest/v1/

# Test GitHub Models
curl -H "Authorization: Bearer YOUR_GITHUB_TOKEN" https://models.github.ai/inference/models
```

## Security Best Practices

### ⚠️ Never Commit Secrets

```bash
# Ensure .env is in .gitignore
echo ".env" >> .gitignore

# Check for accidentally committed secrets
git log -p | grep -i "password\|secret\|key"
```

### 🔐 Use Strong Secrets

```bash
# Generate strong random secrets
openssl rand -base64 32

# Or use Python
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 🔒 Rotate Secrets Regularly

- Rotate API keys every 90 days
- Rotate database passwords every 180 days
- Immediately rotate if compromised

### 🛡️ Principle of Least Privilege

- Use service-specific credentials
- Limit IAM permissions to minimum required
- Use read-only keys where possible

## Troubleshooting

### "Missing required environment variable"

```bash
# Check which variables are missing
docker-compose config | grep -i "error\|warning"

# Verify .env file exists
ls -la .env

# Check .env file content (be careful not to expose secrets)
cat .env | grep -v "KEY\|SECRET\|PASSWORD"
```

### "Invalid Supabase credentials"

```bash
# Test Supabase connection
curl -H "apikey: YOUR_ANON_KEY" \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     https://your-project.supabase.co/rest/v1/

# Should return 200 OK
```

### "GitHub token invalid"

```bash
# Test GitHub token
curl -H "Authorization: Bearer YOUR_GITHUB_TOKEN" \
     https://api.github.com/user

# Should return your GitHub user info
```

### "AWS credentials invalid"

```bash
# Test AWS credentials
docker-compose exec api python -c "
import boto3
s3 = boto3.client('s3')
print(s3.list_buckets())
"
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection URL (async) |
| `DATABASE_URL_SYNC` | Yes | - | PostgreSQL connection URL (sync) |
| `REDIS_URL` | Yes | - | Redis connection URL |
| `NEO4J_URI` | Yes | - | Neo4j Bolt connection URI |
| `NEO4J_USER` | Yes | - | Neo4j username |
| `NEO4J_PASSWORD` | Yes | - | Neo4j password |
| `ELASTICSEARCH_URL` | Yes | - | Elasticsearch connection URL |
| `SUPABASE_URL` | Yes | - | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | - | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | - | Supabase service role key |
| `SUPABASE_JWT_SECRET` | Yes | - | Supabase JWT secret |
| `AWS_ACCESS_KEY_ID` | Yes | - | AWS access key ID |
| `AWS_SECRET_ACCESS_KEY` | Yes | - | AWS secret access key |
| `AWS_REGION` | Yes | - | AWS region |
| `S3_BUCKET` | Yes | - | S3 bucket name |
| `GITHUB_TOKEN` | Yes | - | GitHub personal access token |
| `GITHUB_MODELS_ENDPOINT` | No | https://models.github.ai/inference | GitHub Models API endpoint |
| `EMBEDDING_MODEL` | No | openai/text-embedding-3-large | Embedding model name |
| `CLASSIFICATION_MODEL` | No | openai/gpt-4o | Classification model name |
| `SUMMARISATION_MODEL` | No | openai/gpt-4o-mini | Summarization model name |
| `USE_NEO4J_GRAPH` | No | true | Enable Neo4j knowledge graph |
| `API_ENV` | No | development | Environment (development/staging/production) |
| `API_HOST` | No | 0.0.0.0 | API host |
| `API_PORT` | No | 8000 | API port |
| `CORS_ORIGINS` | No | http://localhost:3000 | Allowed CORS origins |

---

**Need help? Check the [SETUP.md](SETUP.md) for more details.**
