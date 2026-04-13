"use client";

import Link from "next/link";
import { parseISO, startOfDay } from "date-fns";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useAccessMode } from "@/lib/access-mode";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { getSignedFileUrl } from "@/lib/storage";
import { formatMoney } from "@/lib/format";
import { sumAmounts, tripPhase } from "@/lib/trip-utils";
import { formatTripDestinationsLabel, parseTripDestinations } from "@/lib/trip-destinations";
import { HomeHero } from "@/components/dashboard/HomeHero";
import { TripCard } from "@/components/dashboard/TripCard";
import type { TripWithCosts } from "@/types/db";

const HOME_DASHBOARD_BODY_ID = "home-dashboard-body";

export function HomeDashboard() {
  const { isAdmin } = useAccessMode();
  const [query, setQuery] = useState("");
  const [trips, setTrips] = useState<TripWithCosts[]>([]);
  const [covers, setCovers] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createBrowserSupabase();
        const { data, error } = await supabase
          .from("trips")
          .select(
            `
            *,
            flights(id, amount, currency),
            accommodations(id, amount, currency),
            expenses(id, amount, currency, category, is_shared)
          `,
          )
          .order("start_date", { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        const rows = (data ?? []) as TripWithCosts[];
        setTrips(rows);
        const map: Record<string, string | null> = {};
        for (const t of rows) {
          if (t.cover_image_path) {
            map[t.id] = await getSignedFileUrl("covers", t.cover_image_path);
          } else {
            map[t.id] = null;
          }
        }
        if (!cancelled) setCovers(map);
      } catch (e) {
        if (!cancelled) {
          setConfigError(
            e instanceof Error ? e.message : "Unable to reach Supabase. Check your environment variables."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trips;
    return trips.filter((t) => {
      if (t.name.toLowerCase().includes(q)) return true;
      const stops = parseTripDestinations(t);
      if (formatTripDestinationsLabel(stops).toLowerCase().includes(q)) return true;
      return stops.some(
        (s) => s.city.toLowerCase().includes(q) || s.country.toLowerCase().includes(q)
      );
    });
  }, [trips, query]);

  const stats = useMemo(() => {
    const countries = new Set(trips.flatMap((t) => parseTripDestinations(t).map((s) => s.country))).size;
    const completed = trips.filter((t) => tripPhase(t.start_date, t.end_date) === "completed");
    const spent = completed.reduce((acc, t) => {
      const rows = [...(t.flights ?? []), ...(t.accommodations ?? []), ...(t.expenses ?? [])];
      return acc + sumAmounts(rows).total;
    }, 0);
    return { total: trips.length, countries, spent };
  }, [trips]);

  const nextTrip = useMemo(() => {
    const today = startOfDay(new Date());
    const candidates = trips
      .filter((t) => {
        const end = startOfDay(parseISO(t.end_date));
        return end >= today;
      })
      .sort((a, b) => parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime());
    return candidates[0] ?? null;
  }, [trips]);

  if (configError) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="rounded-3xl border border-rose-500/30 bg-rose-500/5 p-8 text-sm text-rose-100">
          <p className="font-semibold">Configuration issue</p>
          <p className="mt-2 text-rose-200/90">{configError}</p>
          <p className="mt-4 text-xs text-rose-200/70">
            Copy <code className="rounded bg-black/30 px-1">.env.example</code> to{" "}
            <code className="rounded bg-black/30 px-1">.env.local</code> and add your Supabase URL and anon key.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-neutral-950 text-white">
        <div className="flex items-center justify-between px-5 py-5 sm:px-8">
          <span className="font-display text-lg tracking-tight opacity-80">Wonderlust</span>
          <div className="h-10 w-10 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-32">
          <div
            className="h-12 w-12 animate-spin rounded-full border-2 border-white/15 border-t-white/70"
            aria-hidden
          />
          <p className="text-sm text-white/50">Loading your trips…</p>
        </div>
      </div>
    );
  }

  const heroCoverUrl = nextTrip ? (covers[nextTrip.id] ?? null) : null;

  return (
    <>
      <HomeHero nextTrip={nextTrip} coverUrl={heroCoverUrl} scrollTargetId={HOME_DASHBOARD_BODY_ID} />

      <div id={HOME_DASHBOARD_BODY_ID} className="mx-auto max-w-6xl space-y-12 px-5 pb-16 pt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--muted)]">Wonderlust</p>
          <h2 className="mt-2 font-display text-3xl md:text-4xl">Your dashboard</h2>
          <p className="mt-2 max-w-lg text-sm text-[var(--muted)]">
            Trips, costs, and itineraries in one place. Use the menu on the home hero for settings and new trips.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin ? (
            <Link
              href="/trips/new"
              className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/20"
            >
              Plan a new trip
            </Link>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Trips tracked", value: String(stats.total) },
          { label: "Countries visited", value: String(stats.countries) },
          {
            label: "Recorded spend (completed)",
            value: formatMoney(stats.spent, "USD"),
          },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-soft"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{s.label}</p>
            <p className="mt-3 font-display text-3xl">{s.value}</p>
          </motion.div>
        ))}
      </section>

      <section className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-3xl">Your trips</h2>
            <p className="text-sm text-[var(--muted)]">Search by city, country, or trip name.</p>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-full border border-[var(--border)] bg-[var(--elevated)] px-5 py-3 text-sm outline-none focus:border-[var(--accent)] md:max-w-sm"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--card)]/60 px-8 py-16 text-center">
            <p className="font-display text-2xl">The atlas is empty</p>
            <p className="mt-3 text-sm text-[var(--muted)]">
              {trips.length === 0
                ? "Create your first trip to see it here."
                : "No trips match that search."}
            </p>
            {isAdmin && trips.length === 0 ? (
              <Link
                href="/trips/new"
                className="mt-6 inline-flex rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent-foreground)]"
              >
                Create trip
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t, index) => (
              <TripCard key={t.id} trip={t} coverUrl={covers[t.id] ?? null} index={index} />
            ))}
          </div>
        )}
      </section>
      </div>
    </>
  );
}
