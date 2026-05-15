"""
S3-compatible object storage.

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
  AWS_ACCESS_KEY_ID      access key / key ID
  AWS_SECRET_ACCESS_KEY  secret key
  AWS_REGION             region (use "auto" for R2, "us-east-1" is fine otherwise)

Optional:
  S3_ENDPOINT_URL        omit for real AWS S3
  S3_PRESIGN_TTL         seconds a download link stays valid (default: 300)
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
    _client().put_object(Bucket=S3_BUCKET, Key=storage_key, Body=content)
    return len(content)


def read_file(storage_key: str) -> bytes:
    response = _client().get_object(Bucket=S3_BUCKET, Key=storage_key)
    return response["Body"].read()


def file_exists(storage_key: str) -> bool:
    try:
        _client().head_object(Bucket=S3_BUCKET, Key=storage_key)
        return True
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code in ("404", "NoSuchKey", "403"):
            return False
        raise


def delete_file(storage_key: str) -> None:
    try:
        _client().delete_object(Bucket=S3_BUCKET, Key=storage_key)
    except ClientError:
        pass


def get_presigned_url(storage_key: str, expires_in: int = PRESIGN_TTL) -> str:
    """Return a time-limited URL that lets the client download the file directly
    from the storage provider, bypassing the API server."""
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
