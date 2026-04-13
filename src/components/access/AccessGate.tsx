"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useAccessMode } from "@/lib/access-mode";
import { cn } from "@/lib/utils";

export function AccessGate({ children }: { children: React.ReactNode }) {
  const { mode, hydrated, continueAsViewer, unlockAdmin } = useAccessMode();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ready = useMemo(() => hydrated && mode !== null, [hydrated, mode]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  if (mode === null) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(45,212,191,0.12),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(251,191,36,0.08),transparent_50%)]" />
        <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-3xl border border-[var(--border)] bg-[var(--card)]/80 p-8 shadow-[var(--shadow-soft)] backdrop-blur-xl"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
              Wonderlust
            </p>
            <h1 className="mt-3 font-display text-4xl leading-tight text-[var(--foreground)]">
              Your private atlas
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
              A calm place to plan trips, curate days, and keep every booking within reach. Choose how
              you would like to enter.
            </p>

            <div className="mt-8 space-y-4">
              <div>
                <label className="text-xs font-medium text-[var(--muted)]">Admin password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Unlock full editing"
                  className={cn(
                    "mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-4 py-3 text-sm outline-none ring-0 transition",
                    "placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
                  )}
                />
                {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}
              </div>

              <button
                type="button"
                onClick={() => {
                  const ok = unlockAdmin(password);
                  if (!ok) setError("That password does not match. Try again or continue as viewer.");
                }}
                className="w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/20 transition hover:brightness-110"
              >
                Enter as editor
              </button>

              <button
                type="button"
                onClick={() => continueAsViewer()}
                className="w-full rounded-2xl border border-[var(--border)] bg-transparent px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--elevated)]"
              >
                Continue as viewer
              </button>
            </div>

            <p className="mt-6 text-[11px] leading-relaxed text-[var(--muted)]">
              Viewer mode is read-only. This gate is for convenience only and does not secure your data
              against someone with your Supabase anon key.
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  if (!ready) return null;

  return <>{children}</>;
}
