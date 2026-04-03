import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.security import AuthUser
from app.db.session import get_db_session
from app.models import SessionModel, SessionStatus
from app.schemas import SessionCreate, SessionJoin, SessionRead, SessionUpdateStatus

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _require_mentor(user: AuthUser) -> uuid.UUID:
    if user.role != "mentor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only mentors can create sessions")
    return uuid.UUID(user.user_id)


async def _get_session_for_user(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
) -> SessionModel:
    result = await db.execute(
        select(SessionModel).where(
            and_(
                SessionModel.id == session_id,
                or_(SessionModel.mentor_id == user_id, SessionModel.student_id == user_id),
            )
        )
    )
    session_obj = result.scalar_one_or_none()
    if not session_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session_obj


@router.post("/create", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: SessionCreate,
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> SessionModel:
    mentor_id = _require_mentor(user)

    if payload.student_id is not None and payload.student_id == mentor_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mentor and student must be different users")

    room_key = secrets.token_urlsafe(10)

    session_obj = SessionModel(
        mentor_id=mentor_id,
        student_id=payload.student_id,
        title=payload.title,
        description=payload.description,
        room_key=room_key,
        status=SessionStatus.scheduled,
        scheduled_for=payload.scheduled_for,
        duration_minutes=payload.duration_minutes,
    )
    db.add(session_obj)
    await db.commit()
    await db.refresh(session_obj)
    return session_obj


@router.post("/join", response_model=SessionRead)
async def join_session(
    payload: SessionJoin,
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> SessionModel:
    requester_id = uuid.UUID(user.user_id)
    result = await db.execute(select(SessionModel).where(SessionModel.room_key == payload.room_key))
    session_obj = result.scalar_one_or_none()

    if not session_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid room key")

    if session_obj.status == SessionStatus.ended:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This session has already ended")

    if user.role == "mentor":
        if session_obj.mentor_id != requester_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the session mentor can join as mentor")
    else:
        if session_obj.student_id is None:
            session_obj.student_id = requester_id
        elif session_obj.student_id != requester_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This session is already assigned to another student")

    if session_obj.status == SessionStatus.scheduled:
        session_obj.status = SessionStatus.active
        session_obj.started_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(session_obj)
    return session_obj


@router.post("/{session_id}/end", response_model=SessionRead)
async def end_session(
    session_id: uuid.UUID,
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> SessionModel:
    requester_id = uuid.UUID(user.user_id)
    session_obj = await _get_session_for_user(db, session_id, requester_id)
    if session_obj.mentor_id != requester_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only mentor can end this session")

    session_obj.status = SessionStatus.ended
    session_obj.ended_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(session_obj)
    return session_obj


@router.get("/{session_id}", response_model=SessionRead)
async def get_session(
    session_id: uuid.UUID,
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> SessionModel:
    requester_id = uuid.UUID(user.user_id)
    return await _get_session_for_user(db, session_id, requester_id)


@router.get("/", response_model=list[SessionRead])
async def list_my_sessions(
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[SessionModel]:
    requester_id = uuid.UUID(user.user_id)
    result = await db.execute(
        select(SessionModel)
        .where(or_(SessionModel.mentor_id == requester_id, SessionModel.student_id == requester_id))
        .order_by(SessionModel.created_at.desc())
    )
    return list(result.scalars().all())


@router.patch("/{session_id}/status", response_model=SessionRead)
async def update_session_status(
    session_id: uuid.UUID,
    payload: SessionUpdateStatus,
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> SessionModel:
    requester_id = uuid.UUID(user.user_id)
    session_obj = await _get_session_for_user(db, session_id, requester_id)

    if session_obj.mentor_id != requester_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only mentor can update status")

    session_obj.status = payload.status
    if payload.status == SessionStatus.active and not session_obj.started_at:
        session_obj.started_at = datetime.now(timezone.utc)
    if payload.status == SessionStatus.ended:
        session_obj.ended_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(session_obj)
    return session_obj
