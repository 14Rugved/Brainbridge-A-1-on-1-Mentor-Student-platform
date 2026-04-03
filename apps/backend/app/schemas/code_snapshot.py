import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CodeSnapshotCreate(BaseModel):
    editor_language: str = Field(default="python", min_length=1, max_length=64)
    content: str = Field(min_length=1)
    version: int = Field(default=0, ge=0)


class CodeSnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    editor_language: str
    content: str
    version: int
    created_by: uuid.UUID
    created_at: datetime
