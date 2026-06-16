import uuid
from fastapi import Depends, Security, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.database import get_db
from app.middleware.auth import decode_supabase_jwt
from app.models.user import User

bearer_scheme = HTTPBearer()


async def get_db_session(db: AsyncSession = Depends(get_db)) -> AsyncSession:
    return db


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID:
    """Verify JWT, then upsert the user row in Postgres on first login."""
    payload = await decode_supabase_jwt(credentials.credentials)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token missing subject claim")

    try:
        user_id = uuid.UUID(sub)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid subject claim")

    result = await db.execute(select(User).where(User.id == user_id))
    if result.scalar_one_or_none() is None:
        email = payload.get("email") or f"{sub}@unknown.local"
        # Atomic upsert — avoids an IntegrityError race when two concurrent
        # first-login requests for the same new user both try to insert.
        await db.execute(
            pg_insert(User)
            .values(id=user_id, email=email)
            .on_conflict_do_nothing(index_elements=["id"])
        )
        await db.commit()

    return user_id
