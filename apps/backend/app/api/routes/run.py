import asyncio
import sys
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.security import AuthUser
from app.db.session import get_db_session
from app.models import SessionModel
from app.schemas import RunCodeRequest, RunCodeResponse

router = APIRouter(prefix="/sessions/{session_id}/run", tags=["run"])
settings = get_settings()

_ALLOWED_LANGUAGES = {"python", "javascript", "typescript"}


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


async def _run_python_locally(code: str, stdin: str) -> tuple[str, str, int]:
    # Robust local execution for Python using the system's python executable
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        code,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(input=stdin.encode("utf-8")), timeout=10)
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        return "", "Execution timed out after 10 seconds.", 124

    return (
        stdout.decode("utf-8", errors="replace"),
        stderr.decode("utf-8", errors="replace"),
        process.returncode if process.returncode is not None else 0
    )


@router.post("/", response_model=RunCodeResponse)
async def run_code(
    session_id: uuid.UUID,
    payload: RunCodeRequest,
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> RunCodeResponse:
    requester_id = uuid.UUID(user.user_id)
    await _ensure_access(db, session_id, requester_id)

    language = payload.language.lower().strip()
    if language not in _ALLOWED_LANGUAGES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported language")

    # In development, prioritize local runner for Python to avoid Piston API limits
    if settings.app_env == "development" and language == "python":
        stdout, stderr, exit_code = await _run_python_locally(payload.code, payload.stdin)
        return RunCodeResponse(
            session_id=session_id,
            language=language,
            stdout=stdout,
            stderr=stderr,
            exit_code=exit_code,
        )

    # Remote Piston Runner logic (for Prod or other languages)
    if not settings.piston_api_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Code runner is not configured. Set PISTON_API_URL.",
        )

    run_payload = {
        "language": language,
        "version": "*",
        "files": [{"name": "main", "content": payload.code}],
        "stdin": payload.stdin,
    }

    base = settings.piston_api_url.rstrip("/")
    endpoint = base if base.endswith("/execute") else f"{base}/execute"

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(endpoint, json=run_payload)
            if resp.status_code == 200:
                data = resp.json()
                run = data.get("run", {})
                return RunCodeResponse(
                    session_id=session_id,
                    language=language,
                    stdout=run.get("stdout", ""),
                    stderr=run.get("stderr", ""),
                    exit_code=run.get("code", -1),
                )
            
            # If Piston failed (like the whitelist error), fall back silently if possible
            provider_error = resp.text
        except httpx.HTTPError as exc:
            provider_error = str(exc)

    # Final fallback for Python if remote failed
    if language == "python":
        stdout, stderr, exit_code = await _run_python_locally(payload.code, payload.stdin)
        return RunCodeResponse(
            session_id=session_id,
            language=language,
            stdout=stdout,
            stderr=stderr,
            exit_code=exit_code,
        )

    raise HTTPException(status_code=502, detail=f"Execution provider failed: {provider_error}")
