"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"mentor" | "student">("student");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role } },
    });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setMsg("Account created! Check your email to verify, then sign in.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--gradient-primary)" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16,18 22,12 16,6" />
              <polyline points="8,6 2,12 8,18" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold gradient-text">Brainbridge</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            Create your account to get started
          </p>
        </div>

        <form onSubmit={onSubmit} className="glass-card p-8" id="signup-form">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Email Address
              </label>
              <input
                id="signup-email"
                className="input-field"
                placeholder="you@example.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Password
              </label>
              <input
                id="signup-password"
                className="input-field"
                placeholder="Min. 6 characters"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                I am a...
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  id="role-student"
                  onClick={() => setRole("student")}
                  className="rounded-xl border p-4 text-center transition-all"
                  style={{
                    background: role === "student" ? "rgba(99, 102, 241, 0.15)" : "rgba(255,255,255,0.03)",
                    borderColor: role === "student" ? "rgba(99, 102, 241, 0.5)" : "var(--glass-border)",
                    color: role === "student" ? "var(--brand-primary)" : "var(--text-secondary)",
                  }}
                >
                  <div className="text-2xl mb-1">🎓</div>
                  <div className="text-sm font-semibold">Student</div>
                </button>
                <button
                  type="button"
                  id="role-mentor"
                  onClick={() => setRole("mentor")}
                  className="rounded-xl border p-4 text-center transition-all"
                  style={{
                    background: role === "mentor" ? "rgba(6, 182, 212, 0.15)" : "rgba(255,255,255,0.03)",
                    borderColor: role === "mentor" ? "rgba(6, 182, 212, 0.5)" : "var(--glass-border)",
                    color: role === "mentor" ? "var(--brand-accent)" : "var(--text-secondary)",
                  }}
                >
                  <div className="text-2xl mb-1">👨‍🏫</div>
                  <div className="text-sm font-semibold">Mentor</div>
                </button>
              </div>
            </div>
          </div>

          {err && <div className="error-banner mt-4">{err}</div>}
          {msg && <div className="success-banner mt-4">{msg}</div>}

          <button
            id="signup-submit"
            disabled={loading}
            className="btn-primary mt-6 w-full"
            type="submit"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }}></span>
                Creating account...
              </span>
            ) : (
              "Create Account"
            )}
          </button>

          <p className="mt-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            Already have an account?{" "}
            <Link
              href="/auth/login"
              className="font-medium transition-colors hover:opacity-80"
              style={{ color: "var(--brand-primary)" }}
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
