import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.security import AuthUser
from app.db.session import get_db_session
from app.models import CodeSnapshotModel, SessionModel
from app.schemas import CodeSnapshotCreate, CodeSnapshotRead

router = APIRouter(prefix="/sessions/{session_id}/snapshots", tags=["snapshots"])


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


@router.post("/", response_model=CodeSnapshotRead, status_code=status.HTTP_201_CREATED)
async def create_snapshot(
    session_id: uuid.UUID,
    payload: CodeSnapshotCreate,
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> CodeSnapshotModel:
    requester_id = uuid.UUID(user.user_id)
    await _ensure_access(db, session_id, requester_id)

    item = CodeSnapshotModel(
        session_id=session_id,
        editor_language=payload.editor_language,
        content=payload.content,
        version=payload.version,
        created_by=requester_id,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.get("/latest", response_model=CodeSnapshotRead)
async def get_latest_snapshot(
    session_id: uuid.UUID,
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> CodeSnapshotModel:
    requester_id = uuid.UUID(user.user_id)
    await _ensure_access(db, session_id, requester_id)

    result = await db.execute(
        select(CodeSnapshotModel)
        .where(CodeSnapshotModel.session_id == session_id)
        .order_by(CodeSnapshotModel.created_at.desc())
        .limit(1)
    )
    latest = result.scalar_one_or_none()
    if latest is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No snapshot found")

    return latest


@router.get("/", response_model=list[CodeSnapshotRead])
async def list_snapshots(
    session_id: uuid.UUID,
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[CodeSnapshotModel]:
    requester_id = uuid.UUID(user.user_id)
    await _ensure_access(db, session_id, requester_id)

    result = await db.execute(
        select(CodeSnapshotModel)
        .where(CodeSnapshotModel.session_id == session_id)
        .order_by(CodeSnapshotModel.created_at.desc())
        .limit(100)
    )
    return list(result.scalars().all())
