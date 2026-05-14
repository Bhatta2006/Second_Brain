import uuid
from fastapi import Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
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
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Token missing subject claim")

    user_id = uuid.UUID(sub)

    result = await db.execute(select(User).where(User.id == user_id))
    if result.scalar_one_or_none() is None:
        email = payload.get("email") or f"{sub}@unknown.local"
        db.add(User(id=user_id, email=email))
        await db.commit()

    return user_id
