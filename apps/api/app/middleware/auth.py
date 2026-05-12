import uuid
import httpx
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from jose.backends import ECKey
from app.config import settings

bearer_scheme = HTTPBearer()

_jwks_cache: dict | None = None


async def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is None:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json")
            r.raise_for_status()
            _jwks_cache = {k["kid"]: k for k in r.json()["keys"]}
    return _jwks_cache


def _get_public_key(jwks: dict, kid: str):
    key_data = jwks.get(kid)
    if not key_data:
        raise HTTPException(status_code=401, detail="Unknown signing key")
    return key_data


async def decode_supabase_jwt(token: str) -> dict:
    """Verify and decode a Supabase-issued JWT (supports HS256 and ES256)."""
    try:
        unverified_header = jwt.get_unverified_header(token)
        alg = unverified_header.get("alg", "HS256")

        if alg == "HS256":
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        else:
            kid = unverified_header.get("kid")
            jwks = await _get_jwks()
            public_key = _get_public_key(jwks, kid)
            payload = jwt.decode(
                token,
                public_key,
                algorithms=[alg],
                options={"verify_aud": False},
            )
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
) -> uuid.UUID:
    payload = await decode_supabase_jwt(credentials.credentials)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token missing subject claim")
    return uuid.UUID(sub)
