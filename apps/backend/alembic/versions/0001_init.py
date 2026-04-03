"""create sessions, messages, and code snapshots tables

Revision ID: 0001_init
Revises:
Create Date: 2026-04-01 21:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_init"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    session_status = sa.Enum("scheduled", "active", "ended", name="session_status")
    message_type = sa.Enum("text", "code", "system", name="message_type")

    session_status.create(op.get_bind(), checkfirst=True)
    message_type.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("mentor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", session_status, nullable=False, server_default="scheduled"),
        sa.Column("room_key", sa.String(length=64), nullable=False, unique=True),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_sessions_mentor_id", "sessions", ["mentor_id"])
    op.create_index("ix_sessions_student_id", "sessions", ["student_id"])
    op.create_index("ix_sessions_room_key", "sessions", ["room_key"], unique=True)

    op.create_table(
        "messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sender_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sender_role", sa.String(length=20), nullable=False),
        sa.Column("message_type", message_type, nullable=False, server_default="text"),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_messages_session_id", "messages", ["session_id"])
    op.create_index("ix_messages_sender_id", "messages", ["sender_id"])

    op.create_table(
        "code_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("editor_language", sa.String(length=64), nullable=False, server_default="python"),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_code_snapshots_session_id", "code_snapshots", ["session_id"])
    op.create_index("ix_code_snapshots_created_by", "code_snapshots", ["created_by"])


def downgrade() -> None:
    op.drop_index("ix_code_snapshots_created_by", table_name="code_snapshots")
    op.drop_index("ix_code_snapshots_session_id", table_name="code_snapshots")
    op.drop_table("code_snapshots")

    op.drop_index("ix_messages_sender_id", table_name="messages")
    op.drop_index("ix_messages_session_id", table_name="messages")
    op.drop_table("messages")

    op.drop_index("ix_sessions_room_key", table_name="sessions")
    op.drop_index("ix_sessions_student_id", table_name="sessions")
    op.drop_index("ix_sessions_mentor_id", table_name="sessions")
    op.drop_table("sessions")

    sa.Enum(name="message_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="session_status").drop(op.get_bind(), checkfirst=True)
