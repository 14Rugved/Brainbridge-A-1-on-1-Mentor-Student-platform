import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.session import SessionStatus


class SessionCreate(BaseModel):
    student_id: uuid.UUID | None = None
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    scheduled_for: datetime | None = None
    duration_minutes: int = Field(default=60, ge=15, le=240)


class SessionJoin(BaseModel):
    room_key: str


class SessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    mentor_id: uuid.UUID
    student_id: uuid.UUID | None
    title: str
    description: str | None
    status: SessionStatus
    room_key: str
    scheduled_for: datetime | None
    duration_minutes: int
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime
    updated_at: datetime


class SessionUpdateStatus(BaseModel):
    status: SessionStatus
