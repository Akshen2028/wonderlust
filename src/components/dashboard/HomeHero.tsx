"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { endOfDay, parseISO, startOfDay } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccessMode } from "@/lib/access-mode";
import { useTheme } from "@/lib/theme";
import { formatDateRange, tripPhase } from "@/lib/trip-utils";
import { tripCoverFallback } from "@/lib/trip-image";
import {
  formatTripDestinationsLabel,
  parseTripDestinations,
  primaryTripCity,
} from "@/lib/trip-destinations";
import type { TripWithCosts } from "@/types/db";

function seasonAdventureLabel(startDate: string): string {
  const d = parseISO(startDate);
  const m = d.getMonth();
  const y = d.getFullYear();
  let season = "Winter";
  if (m >= 2 && m <= 4) season = "Spring";
  else if (m >= 5 && m <= 7) season = "Summer";
  else if (m >= 8 && m <= 10) season = "Fall";
  return `${season} ${y} Adventure`;
}

function useCountdown(target: Date | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);

  return useMemo(() => {
    if (!target) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    }
    const ms = target.getTime() - now;
    if (ms <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    }
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return { days, hours, minutes, seconds, expired: false };
  }, [target, now]);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

type Props = {
  nextTrip: TripWithCosts | null;
  coverUrl: string | null;
  scrollTargetId: string;
};

export function HomeHero({ nextTrip, coverUrl, scrollTargetId }: Props) {
  const { isAdmin, isViewer, switchToViewer, unlockAdmin, logout } = useAccessMode();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  const phase = nextTrip ? tripPhase(nextTrip.start_date, nextTrip.end_date) : null;
  const countdownTarget = useMemo(() => {
    if (!nextTrip) return null;
    if (phase === "upcoming") {
      return startOfDay(parseISO(nextTrip.start_date));
    }
    if (phase === "active") {
      return endOfDay(parseISO(nextTrip.end_date));
    }
    return null;
  }, [nextTrip, phase]);

  const { days, hours, minutes, seconds, expired } = useCountdown(countdownTarget);

  const stops = nextTrip ? parseTripDestinations(nextTrip) : [];
  const heroLine1 =
    stops[0]?.country ||
    nextTrip?.destination_country ||
    nextTrip?.name?.split(/\s+/)[0] ||
    "Wonderlust";
  const heroLine2 = nextTrip ? "Adventure Awaits" : "Your next chapter starts here";
  const badge = nextTrip
    ? phase === "upcoming"
      ? seasonAdventureLabel(nextTrip.start_date)
      : "Adventure in motion"
    : "Travel, curated";

  const bgSrc =
    coverUrl ??
    (nextTrip
      ? tripCoverFallback(primaryTripCity(stops))
      : "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2000&q=80");

  const brandLeft = nextTrip?.name ?? "Wonderlust";

  const scrollToDashboard = useCallback(() => {
    document.getElementById(scrollTargetId)?.scrollIntoView({ behavior: "smooth" });
  }, [scrollTargetId]);

  useEffect(() => {
    setImageReady(false);
  }, [bgSrc]);

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

  return (
    <section className="relative min-h-[100dvh] w-full overflow-hidden bg-neutral-900 text-white">
      <div className="absolute inset-0">
        <Image
          src={bgSrc}
          alt={nextTrip?.name ? `${nextTrip.name} cover` : "Wonderlust hero"}
          fill
          priority
          className={`object-cover transition-opacity duration-700 ease-out ${imageReady ? "opacity-100" : "opacity-0"}`}
          sizes="100vw"
          onLoad={() => setImageReady(true)}
        />
        <div className="absolute inset-x-0 bottom-0 h-[34vh] bg-gradient-to-t from-[var(--background)] via-[var(--background)]/55 to-transparent" />
      </div>

      <header className="relative z-20 flex items-center justify-between px-5 py-5 sm:px-8 sm:py-6">
        <span className="font-display text-lg tracking-tight text-white sm:text-xl">{brandLeft}</span>
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 backdrop-blur-md transition hover:bg-white/20"
        >
          <span className="flex w-5 flex-col gap-1.5">
            <span className="h-px w-full bg-white" />
            <span className="h-px w-full bg-white" />
            <span className="h-px w-full bg-white" />
          </span>
        </button>
      </header>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            className="fixed inset-0 z-[60] flex justify-end bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMenuOpen(false)}
          >
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="h-full w-[min(20rem,88vw)] border-l border-white/10 bg-[#141211] p-6 text-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-xl">Menu</span>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium"
                >
                  Close
                </button>
              </div>
              <nav className="mt-8 flex flex-col gap-1 text-sm">
                <Link
                  href="/"
                  className="rounded-xl px-3 py-3 font-medium hover:bg-white/10"
                  onClick={() => setMenuOpen(false)}
                >
                  Home
                </Link>
                {isAdmin ? (
                  <Link
                    href="/trips/new"
                    className="rounded-xl px-3 py-3 font-medium hover:bg-white/10"
                    onClick={() => setMenuOpen(false)}
                  >
                    New trip
                  </Link>
                ) : null}
                {nextTrip ? (
                  <Link
                    href={`/trips/${nextTrip.id}`}
                    className="rounded-xl px-3 py-3 font-medium hover:bg-white/10"
                    onClick={() => setMenuOpen(false)}
                  >
                    Open featured trip
                  </Link>
                ) : null}
              </nav>
              <div className="mt-8 space-y-2 border-t border-white/10 pt-6">
                <button
                  type="button"
                  onClick={() => {
                    toggleTheme();
                  }}
                  className="w-full rounded-xl border border-white/15 px-3 py-3 text-left text-sm hover:bg-white/10"
                >
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </button>
                {isViewer ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setAdminOpen(true);
                      setPwError(null);
                    }}
                    className="w-full rounded-xl bg-teal-400/90 px-3 py-3 text-left text-sm font-semibold text-teal-950"
                  >
                    Unlock editing
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => switchToViewer()}
                    className="w-full rounded-xl border border-white/15 px-3 py-3 text-left text-sm hover:bg-white/10"
                  >
                    View only
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => logout()}
                  className="w-full rounded-xl border border-white/15 px-3 py-3 text-left text-sm text-white/70 hover:bg-white/10 hover:text-white"
                >
                  Leave
                </button>
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {adminOpen ? (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-md rounded-3xl border border-white/15 bg-[#1a1816] p-6 text-white shadow-2xl"
            >
              <h2 className="font-display text-2xl">Unlock editing</h2>
              <p className="mt-2 text-sm text-white/65">Enter your admin password to make changes.</p>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPwError(null);
                }}
                className="mt-4 w-full rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-teal-400/60 focus:ring-2 focus:ring-teal-400/25"
                placeholder="Password"
              />
              {pwError ? <p className="mt-2 text-xs text-rose-400">{pwError}</p> : null}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdminOpen(false)}
                  className="rounded-full border border-white/15 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onUnlock}
                  className="rounded-full bg-teal-400 px-4 py-2 text-sm font-semibold text-teal-950"
                >
                  Unlock
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-5.5rem)] max-w-4xl flex-col items-center justify-center px-5 pb-28 pt-4 text-center sm:min-h-[calc(100dvh-6rem)] sm:px-8">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-full border border-white/25 bg-white/15 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/95 backdrop-blur-md"
        >
          {badge}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-8 text-balance font-display text-5xl font-semibold leading-[0.95] tracking-tight sm:text-7xl md:text-8xl"
        >
          {heroLine1}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-4 font-display text-2xl font-medium text-white/90 sm:text-3xl md:text-4xl"
        >
          {heroLine2}
        </motion.p>

        {nextTrip && countdownTarget ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-10 grid w-full max-w-xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
          >
            {(
              [
                ["Days", expired ? 0 : days],
                ["Hours", expired ? 0 : hours],
                ["Minutes", expired ? 0 : minutes],
                ["Seconds", expired ? 0 : seconds],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-white/20 bg-white/95 p-4 text-neutral-900 shadow-lg shadow-black/20 sm:rounded-3xl sm:p-5"
              >
                <p className="font-display text-3xl font-semibold tabular-nums sm:text-4xl">
                  {label === "Days" ? value : pad2(value)}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-500 sm:text-xs">
                  {label}
                </p>
              </div>
            ))}
          </motion.div>
        ) : null}

        {nextTrip && countdownTarget && phase === "active" && !expired ? (
          <p className="mt-4 max-w-md text-xs text-white/75">
            Counting down to the last day of this trip.
          </p>
        ) : null}

        {nextTrip && expired && phase === "upcoming" ? (
          <p className="mt-4 font-display text-xl text-white">Today is departure day.</p>
        ) : null}

        {nextTrip ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-2 sm:gap-3"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-4 py-2 text-xs font-medium text-white/95 backdrop-blur-md sm:text-sm">
              <CalendarIcon className="h-4 w-4 shrink-0 opacity-90" />
              {formatDateRange(nextTrip.start_date, nextTrip.end_date)}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-4 py-2 text-xs font-medium text-white/95 backdrop-blur-md sm:text-sm">
              <PinIcon className="h-4 w-4 shrink-0 opacity-90" />
              {formatTripDestinationsLabel(stops)}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-4 py-2 text-xs font-medium text-white/95 backdrop-blur-md sm:text-sm">
              <PeopleIcon className="h-4 w-4 shrink-0 opacity-90" />
              {nextTrip.traveler_count} {nextTrip.traveler_count === 1 ? "Traveler" : "Travelers"}
            </span>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-10 flex flex-wrap justify-center gap-3"
          >
            {isAdmin ? (
              <Link
                href="/trips/new"
                className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-neutral-900 shadow-lg transition hover:bg-white/90"
              >
                Plan a new trip
              </Link>
            ) : null}
            <button
              type="button"
              onClick={scrollToDashboard}
              className="rounded-full border border-white/30 bg-white/10 px-6 py-2.5 text-sm font-semibold backdrop-blur-md transition hover:bg-white/20"
            >
              Browse trips
            </button>
          </motion.div>
        )}
      </div>

      <button
        type="button"
        onClick={scrollToDashboard}
        className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.35em] text-white/80 transition hover:text-white"
      >
        Scroll to explore
        <span className="flex h-10 w-px bg-gradient-to-b from-white/80 to-transparent" aria-hidden />
      </button>
    </section>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 21s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11z" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function PeopleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" />
    </svg>
  );
}
