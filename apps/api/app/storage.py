"""
S3-compatible object storage OR Supabase Storage.

Works with any S3-compatible provider — just set the right env vars:

  Provider          S3_ENDPOINT_URL
  ──────────────    ──────────────────────────────────────────────────────
  AWS S3            (leave unset)
  Supabase Storage  https://<project-ref>.supabase.co/storage/v1/s3
  Cloudflare R2     https://<account-id>.r2.cloudflarestorage.com
  Backblaze B2      https://s3.<region>.backblazeb2.com
  MinIO (local)     http://localhost:9000

Required env vars:
  S3_BUCKET              bucket name (must already exist)
  AWS_ACCESS_KEY_ID      access key / key ID (or use SUPABASE_SERVICE_ROLE_KEY for Supabase)
  AWS_SECRET_ACCESS_KEY  secret key (or use SUPABASE_SERVICE_ROLE_KEY for Supabase)
  AWS_REGION             region (use "auto" for R2, "us-east-1" is fine otherwise)

Optional:
  S3_ENDPOINT_URL        omit for real AWS S3
  S3_PRESIGN_TTL         seconds a download link stays valid (default: 300)
  USE_SUPABASE_STORAGE   set to "true" to use Supabase Storage REST API instead of S3
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

S3_ENDPOINT = os.environ.get("S3_ENDPOINT_URL") or None   # None = real AWS S3
S3_BUCKET   = os.environ.get("S3_BUCKET", "secondbrain")
AWS_REGION  = os.environ.get("AWS_REGION", "us-east-1")
PRESIGN_TTL = int(os.environ.get("S3_PRESIGN_TTL", "300"))
USE_SUPABASE = os.environ.get("USE_SUPABASE_STORAGE", "false").lower() == "true"


@lru_cache(maxsize=1)
def _client():
    """Single boto3 S3 client (re-created if the process restarts)."""
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        region_name=AWS_REGION,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        ),
    )


@lru_cache(maxsize=1)
def _supabase_client():
    """Supabase Storage client using REST API."""
    from supabase import create_client
    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    return create_client(supabase_url, supabase_key)


# ── Key helpers ───────────────────────────────────────────────────────────────

def _safe_ext(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if not suffix or not all(c.isalnum() or c == "." for c in suffix):
        return ""
    return suffix[:12]


def build_storage_key(user_id: str, item_id: str, filename: str) -> str:
    """Deterministic key: {user_id}/{item_id}{.ext}  (same format as before)."""
    return f"{user_id}/{item_id}{_safe_ext(filename)}"


# ── Core operations ───────────────────────────────────────────────────────────

def save_file(storage_key: str, content: bytes) -> int:
    if USE_SUPABASE:
        client = _supabase_client()
        client.storage.from_(S3_BUCKET).upload(storage_key, content, {"content-type": "application/octet-stream"})
        return len(content)
    else:
        _client().put_object(Bucket=S3_BUCKET, Key=storage_key, Body=content)
        return len(content)


def read_file(storage_key: str) -> bytes:
    if USE_SUPABASE:
        client = _supabase_client()
        return client.storage.from_(S3_BUCKET).download(storage_key)
    else:
        response = _client().get_object(Bucket=S3_BUCKET, Key=storage_key)
        return response["Body"].read()


def file_exists(storage_key: str) -> bool:
    if USE_SUPABASE:
        try:
            client = _supabase_client()
            # Try to get file info
            client.storage.from_(S3_BUCKET).get_public_url(storage_key)
            return True
        except Exception:
            return False
    else:
        try:
            _client().head_object(Bucket=S3_BUCKET, Key=storage_key)
            return True
        except ClientError as exc:
            code = exc.response["Error"]["Code"]
            if code in ("404", "NoSuchKey", "403"):
                return False
            raise


def delete_file(storage_key: str) -> None:
    if USE_SUPABASE:
        try:
            client = _supabase_client()
            client.storage.from_(S3_BUCKET).remove([storage_key])
        except Exception:
            pass
    else:
        try:
            _client().delete_object(Bucket=S3_BUCKET, Key=storage_key)
        except ClientError:
            pass


def get_presigned_url(storage_key: str, expires_in: int = PRESIGN_TTL) -> str:
    """Return a time-limited URL that lets the client download the file directly
    from the storage provider, bypassing the API server."""
    if USE_SUPABASE:
        client = _supabase_client()
        # Supabase Storage returns a signed URL
        result = client.storage.from_(S3_BUCKET).create_signed_url(storage_key, expires_in)
        return result.get("signedURL", "")
    else:
        return _client().generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET, "Key": storage_key},
            ExpiresIn=expires_in,
        )


# ── Compatibility shim ────────────────────────────────────────────────────────

def storage_path(storage_key: str):  # type: ignore[return]
    raise NotImplementedError(
        "storage_path() is local-disk only. Use get_presigned_url() or read_file()."
    )
