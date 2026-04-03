from collections import defaultdict
from dataclasses import dataclass


@dataclass
class ConnectionInfo:
    user_id: str
    role: str
    email: str | None


class RealtimeState:
    def __init__(self) -> None:
        self.connections: dict[str, ConnectionInfo] = {}
        self.session_members: dict[str, set[str]] = defaultdict(set)
        self.sid_to_sessions: dict[str, set[str]] = defaultdict(set)

    def connect(self, sid: str, info: ConnectionInfo) -> None:
        self.connections[sid] = info

    def disconnect(self, sid: str) -> list[str]:
        rooms_left = list(self.sid_to_sessions.get(sid, set()))
        for session_id in rooms_left:
            self.session_members[session_id].discard(sid)
            if not self.session_members[session_id]:
                self.session_members.pop(session_id, None)

        self.sid_to_sessions.pop(sid, None)
        self.connections.pop(sid, None)
        return rooms_left

    def join_session(self, sid: str, session_id: str) -> None:
        self.session_members[session_id].add(sid)
        self.sid_to_sessions[sid].add(session_id)

    def leave_session(self, sid: str, session_id: str) -> None:
        self.session_members[session_id].discard(sid)
        if not self.session_members[session_id]:
            self.session_members.pop(session_id, None)

        self.sid_to_sessions[sid].discard(session_id)
        if not self.sid_to_sessions[sid]:
            self.sid_to_sessions.pop(sid, None)

    def get_connection(self, sid: str) -> ConnectionInfo | None:
        return self.connections.get(sid)

    def is_member(self, sid: str, session_id: str) -> bool:
        return sid in self.session_members.get(session_id, set())

    def room_size(self, session_id: str) -> int:
        return len(self.session_members.get(session_id, set()))
