import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.security import AuthUser
from app.db.session import get_db_session
from app.models import ProfileModel

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
async def get_me(
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, str | None]:
    # Auto-sync profile to DB on first access
    user_uuid = uuid.UUID(user.user_id)
    result = await db.execute(select(ProfileModel).where(ProfileModel.id == user_uuid))
    profile = result.scalar_one_or_none()

    if profile is None:
        profile = ProfileModel(id=user_uuid, email=user.email, role=user.role)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    elif profile.email != user.email or profile.role != user.role:
        profile.email = user.email
        profile.role = user.role
        await db.commit()
        await db.refresh(profile)

    return {
        "id": str(profile.id),
        "email": profile.email,
        "role": profile.role,
    }
