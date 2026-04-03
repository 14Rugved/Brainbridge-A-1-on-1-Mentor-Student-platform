"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push("/dashboard");
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
            Sign in to your mentoring workspace
          </p>
        </div>

        <form onSubmit={onSubmit} className="glass-card p-8" id="login-form">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Email Address
              </label>
              <input
                id="login-email"
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
                id="login-password"
                className="input-field"
                placeholder="••••••••"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {error && <div className="error-banner mt-4">{error}</div>}

          <button
            id="login-submit"
            disabled={loading}
            className="btn-primary mt-6 w-full"
            type="submit"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }}></span>
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </button>

          <p className="mt-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/signup"
              className="font-medium transition-colors hover:opacity-80"
              style={{ color: "var(--brand-primary)" }}
            >
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
