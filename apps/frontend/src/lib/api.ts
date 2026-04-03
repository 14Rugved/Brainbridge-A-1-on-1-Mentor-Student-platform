import { MessageItem, SessionItem, SessionStatus, SnapshotItem, UserProfile } from "@/types/domain";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
if (!apiBase) {
  throw new Error("NEXT_PUBLIC_API_BASE_URL is required");
}

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API error ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const backendApi = {
  me: (token: string) => api<UserProfile>(token, "/auth/me"),
  listSessions: (token: string) => api<SessionItem[]>(token, "/sessions/"),
  getSession: (token: string, id: string) => api<SessionItem>(token, `/sessions/${id}`),
  createSession: (
    token: string,
    payload: { student_id?: string; title: string; description?: string; scheduled_for?: string; duration_minutes?: number }
  ) => api<SessionItem>(token, "/sessions/create", { method: "POST", body: JSON.stringify(payload) }),
  joinSession: (token: string, room_key: string) =>
    api<SessionItem>(token, "/sessions/join", { method: "POST", body: JSON.stringify({ room_key }) }),
  setSessionStatus: (token: string, id: string, status: SessionStatus) =>
    api<SessionItem>(token, `/sessions/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  listMessages: (token: string, sessionId: string) => api<MessageItem[]>(token, `/sessions/${sessionId}/messages/`),
  sendMessage: (token: string, sessionId: string, body: string, message_type: "text" | "code" = "text") =>
    api<MessageItem>(token, `/sessions/${sessionId}/messages/`, {
      method: "POST",
      body: JSON.stringify({ body, message_type }),
    }),
  listSnapshots: (token: string, sessionId: string) => api<SnapshotItem[]>(token, `/sessions/${sessionId}/snapshots/`),
  latestSnapshot: (token: string, sessionId: string) =>
    api<SnapshotItem>(token, `/sessions/${sessionId}/snapshots/latest`),
  saveSnapshot: (token: string, sessionId: string, payload: { editor_language: string; content: string; version: number }) =>
    api<SnapshotItem>(token, `/sessions/${sessionId}/snapshots/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  runCode: (token: string, sessionId: string, payload: { language: string; code: string; stdin: string }) =>
    api<{ stdout: string; stderr: string; exit_code: number }>(token, `/sessions/${sessionId}/run/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
