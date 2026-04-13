"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccessMode } from "@/lib/access-mode";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { TripForm } from "@/components/trip/TripForm";
import type { TripRow } from "@/types/db";

export default function EditTripPage() {
  const params = useParams<{ tripId: string }>();
  const tripId = params.tripId;
  const { isAdmin } = useAccessMode();
  const [trip, setTrip] = useState<TripRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.from("trips").select("*").eq("id", tripId).single();
      if (!cancelled) {
        setTrip((data as TripRow) ?? null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (!isAdmin) {
    return (
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-10 text-center">
        <p className="text-sm text-[var(--muted)]">Viewer mode is read-only.</p>
        <Link href={`/trips/${tripId}`} className="mt-4 inline-block text-sm font-semibold text-[var(--accent)]">
          Back to trip
        </Link>
      </div>
    );
  }

  if (loading) {
    return <div className="h-40 animate-pulse rounded-3xl bg-[var(--elevated)]" />;
  }

  if (!trip) {
    return (
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-10 text-center text-sm text-[var(--muted)]">
        Trip not found.
      </div>
    );
  }

  return <TripForm mode="edit" initial={trip} />;
}
