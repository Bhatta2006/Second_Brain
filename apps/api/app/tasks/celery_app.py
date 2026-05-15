import ssl
from celery import Celery
from celery.schedules import crontab
from app.config import settings

_redis_url = settings.redis_url

_broker_use_ssl = None
_redis_backend_use_ssl = None
if _redis_url.startswith("rediss://"):
    _ssl_opts = {"ssl_cert_reqs": ssl.CERT_NONE}
    _broker_use_ssl = _ssl_opts
    _redis_backend_use_ssl = _ssl_opts

celery_app = Celery(
    "secondbrain",
    broker=_redis_url,
    backend=_redis_url,
    include=[
        "app.tasks.edge_generation",
        "app.tasks.sync",
        "app.tasks.ai_processing",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_use_ssl=_broker_use_ssl,
    redis_backend_use_ssl=_redis_backend_use_ssl,
    task_acks_late=True,                 # tasks re-queued if worker dies mid-run
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,        # one task at a time per worker process
    task_default_retry_delay=30,
    task_max_retries=5,
)

celery_app.conf.beat_schedule = {
    # Nightly drift check between PostgreSQL and Neo4j
    "neo4j-drift-check": {
        "task": "app.tasks.sync.check_neo4j_drift",
        "schedule": crontab(hour=3, minute=0),
    },
}
