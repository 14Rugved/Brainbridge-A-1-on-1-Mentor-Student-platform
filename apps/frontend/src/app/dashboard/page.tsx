"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { backendApi } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { SessionItem, UserProfile } from "@/types/domain";

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [joinKey, setJoinKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", scheduled_for: "", duration_minutes: "60" });

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const access = data.session?.access_token;
      if (!access) {
        router.replace("/auth/login");
        return;
      }
      setToken(access);

      try {
        const [me, rows] = await Promise.all([backendApi.me(access), backendApi.listSessions(access)]);
        setProfile(me);
        setSessions(rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const refresh = async () => {
    if (!token) return;
    try {
      const rows = await backendApi.listSessions(token);
      setSessions(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh");
    }
  };

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSuccessMsg(null);
    setCreating(true);
    try {
      const created = await backendApi.createSession(token, {
        title: form.title,
        description: form.description || undefined,
        scheduled_for: form.scheduled_for ? new Date(form.scheduled_for).toISOString() : undefined,
        duration_minutes: Number(form.duration_minutes || 60),
      });
      setForm({ title: "", description: "", scheduled_for: "", duration_minutes: "60" });
      setSuccessMsg(`Session created! Room key: ${created.room_key}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create session");
    } finally {
      setCreating(false);
    }
  };

  const submitJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      const joined = await backendApi.joinSession(token, joinKey.trim());
      router.push(`/session/${joined.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join session");
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/auth/login");
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const statusBadge = (status: string) => {
    const cls = status === "active" ? "badge-active" : status === "ended" ? "badge-ended" : "badge-scheduled";
    const dot = status === "active" ? "bg-green-400" : status === "ended" ? "bg-red-400" : "bg-yellow-400";
    return (
      <span className={`badge ${cls}`}>
        <span className={`dot-pulse ${dot}`} style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block" }} />
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading your dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto min-h-screen max-w-7xl p-4 md:p-6" style={{ zIndex: 1 }}>
      {/* Header */}
      <header className="glass-card mb-6 flex flex-wrap items-center justify-between gap-4 p-5 animate-fade-in">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--gradient-primary)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16,18 22,12 16,6" />
              <polyline points="8,6 2,12 8,18" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold gradient-text">Dashboard</h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {profile?.email ?? "Unknown user"} •{" "}
              <span className="font-semibold" style={{ color: profile?.role === "mentor" ? "var(--brand-accent)" : "var(--brand-primary)" }}>
                {profile?.role}
              </span>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button id="refresh-btn" className="btn-secondary text-sm" onClick={refresh}>
            ↻ Refresh
          </button>
          <button id="signout-btn" className="btn-secondary text-sm" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Alerts */}
      {error && <div className="error-banner mb-4 animate-fade-in">{error}</div>}
      {successMsg && <div className="success-banner mb-4 animate-fade-in">{successMsg}</div>}

      {/* Action Cards */}
      <section className="mb-6 grid gap-4 md:grid-cols-2">
        {/* Join Session */}
        <form onSubmit={submitJoin} className="glass-card p-6 animate-fade-in-delay-1" id="join-form">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(99, 102, 241, 0.15)" }}>
              <span className="text-lg">🔑</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Join Session</h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Enter room key shared by your mentor</p>
            </div>
          </div>
          <input
            id="join-key-input"
            className="input-field"
            value={joinKey}
            onChange={(e) => setJoinKey(e.target.value)}
            placeholder="Paste room key here..."
            required
          />
          <button id="join-btn" className="btn-primary mt-4 w-full" type="submit">
            Join Session →
          </button>
        </form>

        {/* Create Session (mentor only) */}
        <form onSubmit={submitCreate} className="glass-card p-6 animate-fade-in-delay-2" id="create-form">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(6, 182, 212, 0.15)" }}>
              <span className="text-lg">➕</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Create Session</h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {profile?.role === "mentor" ? "Schedule a new mentoring session" : "Only mentors can create sessions"}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <input
              id="create-title"
              className="input-field"
              value={form.title}
              onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))}
              placeholder="Session title"
              required
            />
            <textarea
              id="create-description"
              className="input-field"
              value={form.description}
              onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))}
              placeholder="What will you cover? (optional)"
              rows={2}
              style={{ resize: "none" }}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                id="create-scheduled"
                className="input-field"
                type="datetime-local"
                value={form.scheduled_for}
                onChange={(e) => setForm((v) => ({ ...v, scheduled_for: e.target.value }))}
              />
              <div className="relative">
                <input
                  id="create-duration"
                  className="input-field"
                  type="number"
                  min={15}
                  max={240}
                  value={form.duration_minutes}
                  onChange={(e) => setForm((v) => ({ ...v, duration_minutes: e.target.value }))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--text-muted)" }}>
                  min
                </span>
              </div>
            </div>
          </div>
          <button
            id="create-btn"
            disabled={creating || profile?.role !== "mentor"}
            className="btn-primary mt-4 w-full"
            type="submit"
          >
            {creating ? "Creating..." : "Create Session"}
          </button>
        </form>
      </section>

      {/* Sessions List */}
      <section className="glass-card p-6 animate-fade-in-delay-3" id="sessions-list">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            My Sessions
            <span className="ml-2 text-sm font-normal" style={{ color: "var(--text-muted)" }}>
              ({sessions.length})
            </span>
          </h2>
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="text-4xl mb-3">📋</div>
            <p className="font-medium" style={{ color: "var(--text-secondary)" }}>No sessions yet</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {profile?.role === "mentor" ? "Create your first session above" : "Join a session using a room key"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="group rounded-xl border p-4 transition-all hover:border-opacity-50 cursor-pointer"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  borderColor: "var(--glass-border)",
                }}
                onClick={() => router.push(`/session/${s.id}`)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold truncate group-hover:opacity-80 transition-opacity" style={{ color: "var(--text-primary)" }}>
                        {s.title}
                      </h3>
                      {statusBadge(s.status)}
                    </div>
                    {s.description && (
                      <p className="mt-1 text-sm truncate" style={{ color: "var(--text-muted)" }}>
                        {s.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>🔑 {s.room_key}</span>
                      <span>⏱ {s.duration_minutes} min</span>
                      {s.scheduled_for && (
                        <span>📅 {new Date(s.scheduled_for).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      className="btn-secondary text-xs px-3 py-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(s.room_key, s.id + "-key");
                      }}
                    >
                      {copiedId === s.id + "-key" ? "✓ Copied" : "Copy Key"}
                    </button>
                    <button
                      className="btn-secondary text-xs px-3 py-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(`${origin}/session/${s.id}`, s.id + "-link");
                      }}
                    >
                      {copiedId === s.id + "-link" ? "✓ Copied" : "Copy Link"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
