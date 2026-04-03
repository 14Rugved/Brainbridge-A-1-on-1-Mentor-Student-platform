import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import MessageType


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    message_type: MessageType = MessageType.text


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    sender_id: uuid.UUID
    sender_role: str
    message_type: MessageType
    body: str
    created_at: datetime
