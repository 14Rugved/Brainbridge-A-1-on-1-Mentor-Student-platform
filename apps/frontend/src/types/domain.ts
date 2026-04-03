export type SessionStatus = "scheduled" | "active" | "ended";
export type MessageType = "text" | "code" | "system";

export interface SessionItem {
  id: string;
  mentor_id: string;
  student_id: string | null;
  title: string;
  description: string | null;
  status: SessionStatus;
  room_key: string;
  scheduled_for: string | null;
  duration_minutes: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageItem {
  id: string;
  session_id: string;
  sender_id: string;
  sender_role: string;
  message_type: MessageType;
  body: string;
  created_at: string;
}

export interface SnapshotItem {
  id: string;
  session_id: string;
  editor_language: string;
  content: string;
  version: number;
  created_by: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string | null;
  role: string;
}
