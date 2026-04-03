import uuid

from pydantic import BaseModel, Field


class RunCodeRequest(BaseModel):
    language: str = Field(min_length=1, max_length=32)
    code: str = Field(min_length=1, max_length=20000)
    stdin: str = Field(default="", max_length=10000)


class RunCodeResponse(BaseModel):
    session_id: uuid.UUID
    language: str
    stdout: str
    stderr: str
    exit_code: int
