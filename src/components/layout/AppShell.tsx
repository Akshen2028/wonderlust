"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccessMode } from "@/lib/access-mode";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAdmin, isViewer, switchToViewer, unlockAdmin, logout } = useAccessMode();
  const { theme, toggleTheme } = useTheme();
  const [adminOpen, setAdminOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  const onUnlock = () => {
    const ok = unlockAdmin(password);
    if (!ok) {
      setPwError("Incorrect password.");
      return;
    }
    setAdminOpen(false);
    setPassword("");
    setPwError(null);
  };

  const isHome = pathname === "/";

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {!isHome ? (
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-display text-xl tracking-tight">
              Wonderlust
            </Link>
            <nav className="hidden items-center gap-4 text-sm text-[var(--muted)] sm:flex">
              <Link
                href="/"
                className={cn(
                  "transition hover:text-[var(--foreground)]",
                  pathname === "/" && "text-[var(--foreground)]"
                )}
              >
                Dashboard
              </Link>
              {isAdmin ? (
                <Link
                  href="/trips/new"
                  className={cn(
                    "transition hover:text-[var(--foreground)]",
                    pathname.startsWith("/trips/new") && "text-[var(--foreground)]"
                  )}
                >
                  New trip
                </Link>
              ) : null}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                "hidden rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide sm:inline-flex",
                isAdmin
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-amber-500/10 text-amber-200"
              )}
            >
              {isAdmin ? "Editor" : "Viewer"}
            </span>

            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-full border border-[var(--border)] bg-[var(--elevated)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--card)]"
            >
              {theme === "dark" ? "Light" : "Dark"}
            </button>

            {isViewer ? (
              <button
                type="button"
                onClick={() => {
                  setAdminOpen(true);
                  setPwError(null);
                }}
                className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-foreground)]"
              >
                Unlock
              </button>
            ) : (
              <button
                type="button"
                onClick={() => switchToViewer()}
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium"
              >
                View only
              </button>
            )}

            <button
              type="button"
              onClick={() => logout()}
              className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Leave
            </button>
          </div>
        </div>
      </header>
      ) : null}

      {!isHome ? (
      <div className="mx-auto flex max-w-6xl gap-3 px-5 pb-2 pt-2 sm:hidden">
        <Link
          href="/"
          className={cn(
            "flex-1 rounded-full border border-[var(--border)] py-2 text-center text-xs font-semibold",
            pathname === "/" && "bg-[var(--elevated)]"
          )}
        >
          Home
        </Link>
        {isAdmin ? (
          <Link
            href="/trips/new"
            className={cn(
              "flex-1 rounded-full bg-[var(--accent)] py-2 text-center text-xs font-semibold text-[var(--accent-foreground)]",
              pathname.startsWith("/trips/new") && "brightness-110"
            )}
          >
            New trip
          </Link>
        ) : null}
      </div>
      ) : null}

      <main
        className={
          isHome
            ? "mx-auto w-full max-w-none px-0 py-0"
            : "mx-auto max-w-6xl px-5 py-10"
        }
      >
        {children}
      </main>

      <AnimatePresence>
        {adminOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl"
            >
              <h2 className="font-display text-2xl">Unlock editing</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">Enter your admin password to make changes.</p>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPwError(null);
                }}
                className="mt-4 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
                placeholder="Password"
              />
              {pwError ? <p className="mt-2 text-xs text-rose-400">{pwError}</p> : null}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdminOpen(false)}
                  className="rounded-full border border-[var(--border)] px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onUnlock}
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)]"
                >
                  Unlock
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
