import uuid
from datetime import datetime, timezone

import socketio
from sqlalchemy import and_, or_, select

from app.core.security import decode_supabase_token, token_payload_to_user
from app.db.session import AsyncSessionLocal
from app.models import CodeSnapshotModel, MessageModel, MessageType, SessionModel
from app.realtime.state import ConnectionInfo, RealtimeState

state = RealtimeState()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _user_in_session(session_id: str, user_id: str) -> bool:
    try:
        sid_uuid = uuid.UUID(session_id)
        uid_uuid = uuid.UUID(user_id)
    except ValueError:
        return False

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SessionModel.id).where(
                and_(
                    SessionModel.id == sid_uuid,
                    or_(SessionModel.mentor_id == uid_uuid, SessionModel.student_id == uid_uuid),
                )
            )
        )
        return result.scalar_one_or_none() is not None


async def _persist_chat_message(
    session_id: str,
    user: ConnectionInfo,
    body: str,
    message_type: MessageType = MessageType.text,
) -> MessageModel | None:
    if not body.strip():
        return None

    try:
        session_uuid = uuid.UUID(session_id)
        sender_uuid = uuid.UUID(user.user_id)
    except ValueError:
        return None

    async with AsyncSessionLocal() as db:
        item = MessageModel(
            session_id=session_uuid,
            sender_id=sender_uuid,
            sender_role=user.role,
            message_type=message_type,
            body=body,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return item


async def _persist_snapshot(session_id: str, user: ConnectionInfo, language: str, content: str, version: int) -> CodeSnapshotModel | None:
    if not content.strip():
        return None

    try:
        session_uuid = uuid.UUID(session_id)
        creator_uuid = uuid.UUID(user.user_id)
    except ValueError:
        return None

    async with AsyncSessionLocal() as db:
        item = CodeSnapshotModel(
            session_id=session_uuid,
            editor_language=language or "python",
            content=content,
            version=max(version, 0),
            created_by=creator_uuid,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return item


def create_socket_server() -> socketio.AsyncServer:
    sio = socketio.AsyncServer(
        async_mode="asgi",
        cors_allowed_origins="*",
        logger=False,
        engineio_logger=False,
        ping_timeout=30,
        ping_interval=25,
    )

    @sio.event
    async def connect(sid: str, environ: dict, auth: dict | None) -> bool:
        token = auth.get("token") if isinstance(auth, dict) else None
        if not token:
            return False

        try:
            payload = decode_supabase_token(token)
            user = token_payload_to_user(payload)
            state.connect(
                sid,
                ConnectionInfo(user_id=user.user_id, role=user.role, email=user.email),
            )
        except Exception:
            return False

        return True

    @sio.event
    async def disconnect(sid: str) -> None:
        rooms_left = state.disconnect(sid)
        for room in rooms_left:
            await sio.emit(
                "presence:left",
                {"sessionId": room, "sid": sid, "at": _utc_now()},
                room=room,
            )

    @sio.on("session:join")
    async def session_join(sid: str, data: dict) -> None:
        session_id = str(data.get("sessionId", "")).strip()
        conn = state.get_connection(sid)

        if not session_id or conn is None:
            await sio.emit("error:event", {"message": "sessionId and auth are required"}, to=sid)
            return

        if not await _user_in_session(session_id, conn.user_id):
            await sio.emit("error:event", {"message": "You are not allowed to join this session"}, to=sid)
            return

        await sio.enter_room(sid, session_id)
        state.join_session(sid, session_id)

        # Send full user object for the participants list
        await sio.emit(
            "presence:joined",
            {
                "sessionId": session_id,
                "sid": sid,
                "user": {"id": conn.user_id, "role": conn.role, "email": conn.email},
                "at": _utc_now(),
            },
            room=session_id,
        )

        await sio.emit(
            "chat:system",
            {
                "sessionId": session_id,
                "message": f"{conn.role} joined the session",
                "createdAt": _utc_now(),
            },
            room=session_id,
        )

    @sio.on("session:end")
    async def session_end(sid: str, data: dict) -> None:
        session_id = str(data.get("sessionId", "")).strip()
        conn = state.get_connection(sid)
        if not session_id or conn is None or conn.role != "mentor":
            return

        await sio.emit("session:ended", {"sessionId": session_id}, room=session_id)

    @sio.on("editor:update")
    async def editor_update(sid: str, data: dict) -> None:
        session_id = str(data.get("sessionId", "")).strip()
        conn = state.get_connection(sid)
        if not session_id or conn is None or not state.is_member(sid, session_id):
            return

        content = str(data.get("content", ""))
        language = str(data.get("language", "python"))
        version = int(data.get("version", 0))

        if bool(data.get("persist", False)):
            await _persist_snapshot(session_id, conn, language, content, version)

        await sio.emit(
            "editor:update",
            {"sessionId": session_id, "content": content, "language": language},
            room=session_id,
            skip_sid=sid,
        )

    @sio.on("editor:typing")
    async def editor_typing(sid: str, data: dict) -> None:
        session_id = str(data.get("sessionId", "")).strip()
        if not session_id or not state.is_member(sid, session_id):
            return

        await sio.emit(
            "editor:typing",
            {"sessionId": session_id, "sid": sid, "isTyping": bool(data.get("isTyping", False))},
            room=session_id,
            skip_sid=sid,
        )

    @sio.on("chat:message")
    async def chat_message(sid: str, data: dict) -> None:
        session_id = str(data.get("sessionId", "")).strip()
        conn = state.get_connection(sid)
        if not session_id or conn is None or not state.is_member(sid, session_id):
            return

        message = str(data.get("message", "")).strip()
        if not message:
            return

        message_type_value = str(data.get("messageType", "text")).lower().strip()
        message_type = MessageType.code if message_type_value == "code" else MessageType.text

        persisted = await _persist_chat_message(session_id, conn, message, message_type)
        created_at = persisted.created_at.isoformat() if persisted else _utc_now()

        await sio.emit(
            "chat:message",
            {
                "sessionId": session_id,
                "sender": {"id": conn.user_id, "role": conn.role, "email": conn.email},
                "message": message,
                "messageType": message_type.value,
                "createdAt": created_at,
            },
            room=session_id,
        )

    @sio.on("webrtc:signal")
    async def webrtc_signal(sid: str, data: dict) -> None:
        session_id = str(data.get("sessionId", "")).strip()
        if not session_id or not state.is_member(sid, session_id):
            return

        await sio.emit(
            "webrtc:signal",
            {
                "sessionId": session_id,
                "type": data.get("type"),
                "sdp": data.get("sdp"),
                "candidate": data.get("candidate"),
                "senderSid": sid,
            },
            room=session_id,
            skip_sid=sid,
        )

    return sio
