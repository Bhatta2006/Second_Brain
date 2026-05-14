"""
Elasticsearch client for full-text search with BM25 ranking.

Indexes:
- items_{user_id} : Per-user item index for secure multi-tenancy

Features:
- BM25 scoring with field boosts (title^3, summary^2, tags^2, raw_text^1)
- English stemmer + stop words
- Highlighting support
- Async operations
"""
from __future__ import annotations

import logging
from typing import Any

from elasticsearch import AsyncElasticsearch

from app.config import settings

log = logging.getLogger(__name__)

# Lazy client initialization (per-event-loop safe)
_es_client: AsyncElasticsearch | None = None


def get_es_client() -> AsyncElasticsearch:
    """Get or create Elasticsearch client (lazy singleton)."""
    global _es_client
    if _es_client is None:
        _es_client = AsyncElasticsearch(
            hosts=[settings.elasticsearch_url],
            retry_on_timeout=True,
            max_retries=3,
            timeout=30,
        )
        log.info("Elasticsearch client initialized: %s", settings.elasticsearch_url)
    return _es_client


async def close_es_client() -> None:
    """Close Elasticsearch connection."""
    global _es_client
    if _es_client is not None:
        await _es_client.close()
        _es_client = None
        log.info("Elasticsearch client closed")


def _get_index_name(user_id: str) -> str:
    """Generate per-user index name."""
    return f"items_{user_id}"


async def setup_index(user_id: str) -> None:
    """Create index with proper mapping if it doesn't exist."""
    client = get_es_client()
    index_name = _get_index_name(user_id)

    # Check if index exists
    exists = await client.indices.exists(index=index_name)
    if exists:
        return

    # Create index with BM25 analyzer and field boosts
    mapping = {
        "settings": {
            "number_of_shards": 1,
            "number_of_replicas": 0,
            "analysis": {
                "analyzer": {
                    "english_analyzer": {
                        "type": "custom",
                        "tokenizer": "standard",
                        "filter": [
                            "lowercase",
                            "english_stop",
                            "english_stemmer",
                        ],
                    }
                },
                "filter": {
                    "english_stop": {
                        "type": "stop",
                        "stopwords": "_english_",
                    },
                    "english_stemmer": {
                        "type": "stemmer",
                        "language": "english",
                    },
                },
            },
            "similarity": {
                "bm25_custom": {
                    "type": "BM25",
                    "k1": 1.2,
                    "b": 0.75,
                }
            },
        },
        "mappings": {
            "properties": {
                "id": {"type": "keyword"},
                "title": {
                    "type": "text",
                    "analyzer": "english_analyzer",
                    "similarity": "bm25_custom",
                    "boost": 3.0,  # title^3
                },
                "summary": {
                    "type": "text",
                    "analyzer": "english_analyzer",
                    "similarity": "bm25_custom",
                    "boost": 2.0,  # summary^2
                },
                "raw_text": {
                    "type": "text",
                    "analyzer": "english_analyzer",
                    "similarity": "bm25_custom",
                    "boost": 1.0,
                },
                "tags": {
                    "type": "keyword",  # Exact match for tags
                    "boost": 2.0,  # tags^2
                },
                "content_type": {"type": "keyword"},
                "folder_id": {"type": "keyword"},
                "entities": {"type": "object"},  # JSON for people/places/concepts
                "created_at": {"type": "date"},
                "is_starred": {"type": "boolean"},
            }
        },
    }

    await client.indices.create(index=index_name, body=mapping)
    log.info("Created Elasticsearch index: %s", index_name)


async def index_item(
    user_id: str,
    item_id: str,
    title: str | None,
    summary: str | None,
    raw_text: str | None,
    tags: list[str] | None,
    content_type: str,
    folder_id: str | None,
    entities: dict | None,
    created_at: str,
    is_starred: bool = False,
) -> None:
    """Index or update an item in Elasticsearch."""
    client = get_es_client()
    index_name = _get_index_name(user_id)

    # Ensure index exists
    await setup_index(user_id)

    doc = {
        "id": item_id,
        "title": title or "",
        "summary": summary or "",
        "raw_text": raw_text or "",
        "tags": tags or [],
        "content_type": content_type,
        "folder_id": folder_id,
        "entities": entities or {},
        "created_at": created_at,
        "is_starred": is_starred,
    }

    await client.index(
        index=index_name,
        id=item_id,
        document=doc,
        refresh=True,  # Make visible immediately
    )
    log.debug("Indexed item %s to ES for user %s", item_id, user_id)


async def delete_item(user_id: str, item_id: str) -> None:
    """Remove an item from Elasticsearch index."""
    client = get_es_client()
    index_name = _get_index_name(user_id)

    try:
        await client.delete(index=index_name, id=item_id)
        log.debug("Deleted item %s from ES for user %s", item_id, user_id)
    except Exception as exc:
        # Item might not exist in index
        log.warning("Failed to delete item %s from ES: %s", item_id, exc)


async def search_items(
    user_id: str,
    query: str,
    content_type: str | None = None,
    folder_id: str | None = None,
    tags: list[str] | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    """
    Full-text search with BM25 scoring.
    Returns: {"total": int, "results": [{id, score, highlight}]}
    """
    client = get_es_client()
    index_name = _get_index_name(user_id)

    # Check if index exists
    exists = await client.indices.exists(index=index_name)
    if not exists:
        return {"total": 0, "results": []}

    # Build query
    must_clauses = []

    if query:
        # Multi-match with field boosts
        must_clauses.append({
            "multi_match": {
                "query": query,
                "fields": ["title^3", "summary^2", "raw_text", "tags^2"],
                "type": "best_fields",
                "fuzziness": "AUTO",
            }
        })

    # Filters
    filter_clauses = []
    if content_type:
        filter_clauses.append({"term": {"content_type": content_type}})
    if folder_id:
        filter_clauses.append({"term": {"folder_id": folder_id}})
    if tags:
        filter_clauses.append({"terms": {"tags": tags}})

    # Build final query
    es_query: dict[str, Any] = {"bool": {}}
    if must_clauses:
        es_query["bool"]["must"] = must_clauses
    if filter_clauses:
        es_query["bool"]["filter"] = filter_clauses

    # Execute search
    from_offset = (page - 1) * page_size

    try:
        response = await client.search(
            index=index_name,
            query=es_query,
            highlight={
                "fields": {
                    "title": {},
                    "summary": {},
                    "raw_text": {"fragment_size": 150, "number_of_fragments": 2},
                }
            },
            sort=["_score", {"created_at": "desc"}],
            from_=from_offset,
            size=page_size,
        )
    except Exception as exc:
        log.error("Elasticsearch search failed: %s", exc)
        return {"total": 0, "results": []}

    total = response["hits"]["total"]["value"]
    results = []

    for hit in response["hits"]["hits"]:
        source = hit["_source"]
        highlight = hit.get("highlight", {})

        results.append({
            "id": source["id"],
            "score": hit["_score"],
            "title": source.get("title"),
            "summary": source.get("summary"),
            "content_type": source.get("content_type"),
            "folder_id": source.get("folder_id"),
            "tags": source.get("tags", []),
            "created_at": source.get("created_at"),
            "is_starred": source.get("is_starred", False),
            "highlight": highlight,
        })

    return {"total": total, "results": results}


# Module-level singleton for import convenience
es_client = get_es_client
