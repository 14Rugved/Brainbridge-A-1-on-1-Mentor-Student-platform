import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.security import AuthUser
from app.db.session import get_db_session
from app.models import MessageModel, SessionModel
from app.schemas import MessageCreate, MessageRead

router = APIRouter(prefix="/sessions/{session_id}/messages", tags=["messages"])


async def _ensure_access(db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID) -> None:
    result = await db.execute(
        select(SessionModel.id).where(
            and_(
                SessionModel.id == session_id,
                or_(SessionModel.mentor_id == user_id, SessionModel.student_id == user_id),
            )
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")


@router.get("/", response_model=list[MessageRead])
async def list_messages(
    session_id: uuid.UUID,
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[MessageModel]:
    requester_id = uuid.UUID(user.user_id)
    await _ensure_access(db, session_id, requester_id)

    result = await db.execute(
        select(MessageModel)
        .where(MessageModel.session_id == session_id)
        .order_by(MessageModel.created_at.asc())
    )
    return list(result.scalars().all())


@router.post("/", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
async def create_message(
    session_id: uuid.UUID,
    payload: MessageCreate,
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> MessageModel:
    requester_id = uuid.UUID(user.user_id)
    await _ensure_access(db, session_id, requester_id)

    item = MessageModel(
        session_id=session_id,
        sender_id=requester_id,
        sender_role=user.role,
        message_type=payload.message_type,
        body=payload.body,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item
