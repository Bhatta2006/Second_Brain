# 🏗️ SecondBrain Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Web Browser │  │  Mobile App  │  │   Browser    │          │
│  │  (Next.js)   │  │ (React Native)│  │  Extension   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼──────────────────┼──────────────────┼─────────────────┘
          │                  │                  │
          └──────────────────┴──────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Gateway Layer                            │
│  ┌────────────────────────────────────────────────────────┐     │
│  │              FastAPI Backend (Port 8000)               │     │
│  │  • REST API endpoints                                  │     │
│  │  • WebSocket connections                               │     │
│  │  • Authentication middleware                           │     │
│  │  • Request validation                                  │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Auth Service   │ │  Core Services  │ │  AI Services    │
│  (Supabase)     │ │                 │ │                 │
│  • JWT Auth     │ │  • Items CRUD   │ │  • Embeddings   │
│  • User Mgmt    │ │  • Folders      │ │  • Classification│
│  • Sessions     │ │  • Search       │ │  • Summarization│
└─────────────────┘ └─────────────────┘ └─────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   PostgreSQL    │ │     Neo4j       │ │ Elasticsearch   │
│   (Port 5432)   │ │  (Port 7687)    │ │  (Port 9200)    │
│                 │ │                 │ │                 │
│  • Items        │ │  • Nodes        │ │  • Full-text    │
│  • Folders      │ │  • Edges        │ │    search       │
│  • Users        │ │  • Properties   │ │  • Aggregations │
│  • Embeddings   │ │  • Graph queries│ │                 │
│    (pgvector)   │ │                 │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Background Processing                         │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │ Celery Worker  │  │  Celery Beat   │  │     Redis      │    │
│  │                │  │                │  │  (Port 6379)   │    │
│  │ • AI tasks     │  │ • Scheduled    │  │                │    │
│  │ • Embeddings   │  │   tasks        │  │ • Task queue   │    │
│  │ • Edge gen     │  │ • Sync jobs    │  │ • Cache        │    │
│  │ • Processing   │  │                │  │ • Sessions     │    │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │  GitHub Models │  │     AWS S3     │  │   Supabase     │    │
│  │                │  │                │  │                │    │
│  │ • GPT-4o       │  │ • File storage │  │ • Auth         │    │
│  │ • Embeddings   │  │ • Media files  │  │ • Database     │    │
│  │ • Claude       │  │ • Backups      │  │ • Storage      │    │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Item Ingestion Flow

```
User uploads file
       │
       ▼
┌─────────────────┐
│   Web UI        │
│  (Next.js)      │
└────────┬────────┘
         │ HTTP POST /api/items
         ▼
┌─────────────────┐
│   FastAPI       │
│   • Validate    │
│   • Auth check  │
└────────┬────────┘
         │
         ├─────────────────────┐
         │                     │
         ▼                     ▼
┌─────────────────┐   ┌─────────────────┐
│   PostgreSQL    │   │   Celery Task   │
│   • Save item   │   │   (async)       │
│   • Metadata    │   └────────┬────────┘
└─────────────────┘            │
                               ├──────────────────┐
                               │                  │
                               ▼                  ▼
                      ┌─────────────────┐ ┌─────────────────┐
                      │  AI Processing  │ │  File Storage   │
                      │  • Extract text │ │  • Upload to S3 │
                      │  • Generate     │ └─────────────────┘
                      │    embeddings   │
                      │  • Classify     │
                      │  • Summarize    │
                      └────────┬────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
                ▼              ▼              ▼
       ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
       │ PostgreSQL  │ │   Neo4j     │ │Elasticsearch│
       │ • Update    │ │ • Create    │ │ • Index     │
       │   item      │ │   node      │ │   content   │
       │ • Store     │ │ • Generate  │ └─────────────┘
       │   embedding │ │   edges     │
       └─────────────┘ └─────────────┘
```

### 2. Search Flow

```
User searches "machine learning"
       │
       ▼
┌─────────────────┐
│   Web UI        │
└────────┬────────┘
         │ GET /api/search?q=machine+learning
         ▼
┌─────────────────┐
│   FastAPI       │
│   • Parse query │
└────────┬────────┘
         │
         ├─────────────────────┬─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ Elasticsearch   │   │   PostgreSQL    │   │     Redis       │
│ • Full-text     │   │ • Vector search │   │ • Check cache   │
│   search        │   │   (pgvector)    │   │ • Store result  │
│ • Keyword match │   │ • Similarity    │   └─────────────────┘
└────────┬────────┘   └────────┬────────┘
         │                     │
         └──────────┬──────────┘
                    │
                    ▼
           ┌─────────────────┐
           │   Merge Results │
           │   • Rank        │
           │   • Deduplicate │
           │   • Score       │
           └────────┬────────┘
                    │
                    ▼
           ┌─────────────────┐
           │   Return to UI  │
           └─────────────────┘
```

### 3. Knowledge Graph Flow

```
User views graph
       │
       ▼
┌─────────────────┐
│   Web UI        │
│  (D3.js/React)  │
└────────┬────────┘
         │ GET /api/graph
         ▼
┌─────────────────┐
│   FastAPI       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Neo4j       │
│  • Cypher query │
│  • Get nodes    │
│  • Get edges    │
│  • Properties   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Transform     │
│   • Format JSON │
│   • Calculate   │
│     positions   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Render Graph  │
│   • Force layout│
│   • Interactive │
└─────────────────┘
```

### 4. Chat Flow

```
User asks "What did I save about AI?"
       │
       ▼
┌─────────────────┐
│   Web UI        │
└────────┬────────┘
         │ POST /api/chat
         ▼
┌─────────────────┐
│   FastAPI       │
│   • Parse query │
└────────┬────────┘
         │
         ├─────────────────────┐
         │                     │
         ▼                     ▼
┌─────────────────┐   ┌─────────────────┐
│  Generate       │   │   PostgreSQL    │
│  Embedding      │   │   • Vector      │
│  (GitHub Models)│   │     search      │
└────────┬────────┘   │   • Get context │
         │            └────────┬────────┘
         └──────────┬──────────┘
                    │
                    ▼
           ┌─────────────────┐
           │   Build Prompt  │
           │   • User query  │
           │   • Context     │
           │   • History     │
           └────────┬────────┘
                    │
                    ▼
           ┌─────────────────┐
           │  GitHub Models  │
           │  • GPT-4o       │
           │  • Generate     │
           │    response     │
           └────────┬────────┘
                    │
                    ▼
           ┌─────────────────┐
           │  Stream to UI   │
           │  (WebSocket)    │
           └─────────────────┘
```

## Docker Container Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Host                               │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              secondbrain_default (network)             │    │
│  │                                                         │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │    │
│  │  │     web      │  │     api      │  │    worker    │ │    │
│  │  │  (Next.js)   │  │  (FastAPI)   │  │   (Celery)   │ │    │
│  │  │  Port: 3000  │  │  Port: 8000  │  │              │ │    │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │    │
│  │         │                 │                 │          │    │
│  │         └─────────────────┼─────────────────┘          │    │
│  │                           │                            │    │
│  │  ┌──────────────┐  ┌──────┴───────┐  ┌──────────────┐ │    │
│  │  │   postgres   │  │    redis     │  │     neo4j    │ │    │
│  │  │  Port: 5432  │  │  Port: 6379  │  │  Port: 7474  │ │    │
│  │  │              │  │              │  │  Port: 7687  │ │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │    │
│  │                                                         │    │
│  │  ┌──────────────┐  ┌──────────────┐                   │    │
│  │  │elasticsearch │  │     beat     │                   │    │
│  │  │  Port: 9200  │  │  (Celery)    │                   │    │
│  │  └──────────────┘  └──────────────┘                   │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                    Docker Volumes                       │    │
│  │  • postgres_data                                        │    │
│  │  • redis_data                                           │    │
│  │  • neo4j_data                                           │    │
│  │  • neo4j_logs                                           │    │
│  │  • elasticsearch_data                                   │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack Details

### Frontend (Web)
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **State Management:** Zustand
- **Data Fetching:** TanStack Query (React Query)
- **UI Components:** Custom + Lucide Icons
- **Styling:** Tailwind CSS
- **Graph Visualization:** react-force-graph-2d (D3.js)
- **Auth:** Supabase Auth

### Backend (API)
- **Framework:** FastAPI
- **Language:** Python 3.11+
- **ASGI Server:** Uvicorn
- **ORM:** SQLAlchemy 2.0 (async)
- **Migrations:** Alembic
- **Validation:** Pydantic v2
- **Auth:** Supabase JWT + python-jose

### Databases
- **Primary DB:** PostgreSQL 16 + pgvector
- **Graph DB:** Neo4j 5.18 Community
- **Search Engine:** Elasticsearch 8.13
- **Cache/Queue:** Redis 7.2

### Background Processing
- **Task Queue:** Celery
- **Broker:** Redis
- **Scheduler:** Celery Beat
- **Result Backend:** Redis

### AI/ML Services
- **LLM Provider:** GitHub Models
- **Models:**
  - GPT-4o (classification, chat)
  - GPT-4o-mini (summarization)
  - text-embedding-3-large (embeddings)
- **SDK:** azure-ai-inference

### Infrastructure
- **Containerization:** Docker + Docker Compose
- **File Storage:** AWS S3 (or MinIO for local)
- **Auth Provider:** Supabase

## Deployment Architecture

### Development
```
Local Machine
├── Docker Desktop
│   ├── All services in containers
│   ├── Hot reload enabled
│   └── Local volumes
└── IDE (VS Code, etc.)
```

### Production (Recommended)
```
Cloud Provider (AWS/GCP/Azure)
├── Container Orchestration (ECS/GKE/AKS)
│   ├── API (multiple instances)
│   ├── Worker (multiple instances)
│   └── Web (multiple instances)
├── Managed Databases
│   ├── RDS PostgreSQL (with pgvector)
│   ├── ElastiCache Redis
│   └── Elasticsearch Service
├── Graph Database
│   ├── Neo4j Aura (managed)
│   └── Or self-hosted Neo4j cluster
├── Load Balancer
│   └── Application Load Balancer
├── CDN
│   └── CloudFront / CloudFlare
└── Storage
    └── S3 / Cloud Storage
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Security Layers                           │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Layer 1: Network Security                             │    │
│  │  • HTTPS/TLS encryption                                │    │
│  │  • CORS configuration                                  │    │
│  │  • Rate limiting                                       │    │
│  └────────────────────────────────────────────────────────┘    │
│                           │                                     │
│                           ▼                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Layer 2: Authentication                               │    │
│  │  • Supabase Auth (JWT)                                 │    │
│  │  • Token validation                                    │    │
│  │  • Session management                                  │    │
│  └────────────────────────────────────────────────────────┘    │
│                           │                                     │
│                           ▼                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Layer 3: Authorization                                │    │
│  │  • User-based access control                           │    │
│  │  • Resource ownership validation                       │    │
│  │  • API key validation                                  │    │
│  └────────────────────────────────────────────────────────┘    │
│                           │                                     │
│                           ▼                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Layer 4: Data Security                                │    │
│  │  • Encrypted at rest (database)                        │    │
│  │  • Encrypted in transit (TLS)                          │    │
│  │  • Secure file storage (S3)                            │    │
│  └────────────────────────────────────────────────────────┘    │
│                           │                                     │
│                           ▼                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Layer 5: Application Security                         │    │
│  │  • Input validation (Pydantic)                         │    │
│  │  • SQL injection prevention (ORM)                      │    │
│  │  • XSS protection                                      │    │
│  │  • CSRF protection                                     │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Scalability Considerations

### Horizontal Scaling
- **API:** Multiple FastAPI instances behind load balancer
- **Workers:** Scale Celery workers based on queue depth
- **Web:** Multiple Next.js instances with CDN

### Vertical Scaling
- **PostgreSQL:** Increase instance size, add read replicas
- **Elasticsearch:** Add more nodes to cluster
- **Neo4j:** Upgrade to enterprise for clustering

### Caching Strategy
- **Redis:** Cache frequently accessed data
- **CDN:** Cache static assets and API responses
- **Browser:** Cache with appropriate headers

### Database Optimization
- **Indexes:** On frequently queried columns
- **Partitioning:** For large tables (items by date)
- **Connection Pooling:** Optimize database connections
- **Query Optimization:** Use EXPLAIN ANALYZE

---

**For more details, see:**
- [SETUP.md](SETUP.md) - Setup instructions
- [DOCKER_COMMANDS.md](DOCKER_COMMANDS.md) - Docker reference
- [ENV_SETUP.md](ENV_SETUP.md) - Configuration guide
