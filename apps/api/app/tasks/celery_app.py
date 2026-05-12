from celery import Celery
from celery.schedules import crontab
from app.config import settings

celery_app = Celery(
    "secondbrain",
    broker=settings.redis_url,
    backend=settings.redis_url,
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
