"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      router.replace(data.session ? "/dashboard" : "/auth/login");
    })();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center animate-fade-in">
        <div className="spinner mx-auto mb-4"></div>
        <h1 className="text-xl font-semibold gradient-text">Brainbridge</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          Initializing your workspace...
        </p>
      </div>
    </main>
  );
}
