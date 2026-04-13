"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, eachDayOfInterval, format, parseISO } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAccessMode } from "@/lib/access-mode";
import {
  EXPENSE_CATEGORIES,
  STORAGE_BUCKETS,
  type TripTab,
} from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  buildCoverPath,
  buildDayPhotoPath,
  getSignedFileUrl,
} from "@/lib/storage";
import { formatDateRange, tripDayCount, tripPhase } from "@/lib/trip-utils";
import { tripCoverFallback } from "@/lib/trip-image";
import {
  formatTripDestinationsLabel,
  parseTripDestinations,
  primaryTripCity,
} from "@/lib/trip-destinations";
import { cn } from "@/lib/utils";
import { LinkPreviewCard } from "@/components/links/LinkPreviewCard";
import { CostBreakdown } from "@/components/trip/CostBreakdown";
import type {
  AccommodationRow,
  ActivityRow,
  ExpenseRow,
  FlightRow,
  PhotoRow,
  TransportationRow,
  TripDayRow,
  TripRow,
  TimeBlockRow,
} from "@/types/db";

type DayBundle = TripDayRow & {
  time_blocks: TimeBlockRow[];
  activities: ActivityRow[];
};

type DayEditFormState = {
  day_date: string;
  day_number: string;
  title: string;
  summary: string;
  location: string;
  notes: string;
};

const TABS: { id: TripTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "itinerary", label: "Itinerary" },
  { id: "flights", label: "Flights" },
  { id: "transportation", label: "Transportation" },
  { id: "hotels", label: "Hotels" },
  { id: "expenses", label: "Expenses" },
  { id: "photos", label: "Photos" },
  { id: "notes", label: "Notes" },
];

async function attachPreviewIdForUrl(
  table: "activities" | "accommodations",
  rowId: string,
  url: string,
) {
  const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
  const json = (await res.json()) as { preview?: { id: string } };
  if (!json.preview?.id) return;
  const supabase = createBrowserSupabase();
  await supabase
    .from(table)
    .update({ link_preview_id: json.preview.id })
    .eq("id", rowId);
}

function normalizeDayBundles(dayRows: unknown[] | null): DayBundle[] {
  return (dayRows ?? []).map((d: Record<string, unknown>) => {
    const time_blocks = (
      ((d.time_blocks as TimeBlockRow[]) ?? []) as TimeBlockRow[]
    ).sort((a, b) => a.sort_order - b.sort_order);
    const activities = (
      ((d.activities as ActivityRow[]) ?? []) as ActivityRow[]
    ).sort((a, b) => a.sort_order - b.sort_order);
    const { time_blocks: _tb, activities: _ac, ...rest } = d;
    return { ...(rest as unknown as TripDayRow), time_blocks, activities };
  });
}

/**
 * Ensures one itinerary row per calendar day between trip start and end (inclusive).
 * Inserts blank rows for missing dates, then renumbers `day_number` in chronological order.
 */
async function syncTripDaysToDateRange(
  supabase: SupabaseClient,
  tripId: string,
  startDate: string,
  endDate: string,
): Promise<boolean> {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (start > end) return false;

  const interval = eachDayOfInterval({
    start,
    end,
  });
  const expectedDates = interval.map((d) => format(d, "yyyy-MM-dd"));

  const { data: rows, error } = await supabase
    .from("trip_days")
    .select("id, day_date, day_number")
    .eq("trip_id", tripId);
  if (error) return false;

  const existing = rows ?? [];
  const byDate = new Map(existing.map((r) => [r.day_date, r]));
  let maxNum = existing.reduce((m, r) => Math.max(m, r.day_number), 0);
  const missing = expectedDates.filter((d) => !byDate.has(d));
  if (missing.length === 0) return false;

  let n = maxNum;
  const payload = missing.map((dayDate) => {
    n += 1;
    return {
      trip_id: tripId,
      day_date: dayDate,
      day_number: n,
      title: null,
      summary: null,
      location: null,
      notes: null,
    };
  });

  const { error: insErr } = await supabase.from("trip_days").insert(payload);
  if (insErr) return false;

  const { data: allRows } = await supabase
    .from("trip_days")
    .select("id, day_date")
    .eq("trip_id", tripId);
  const sorted = (allRows ?? [])
    .slice()
    .sort((a, b) => a.day_date.localeCompare(b.day_date));
  await Promise.all(
    sorted.map((row, i) =>
      supabase
        .from("trip_days")
        .update({ day_number: i + 1 })
        .eq("id", row.id),
    ),
  );

  return true;
}

export function TripWorkspace({ tripId }: { tripId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as TripTab) || "overview";
  const { isAdmin } = useAccessMode();

  const [trip, setTrip] = useState<TripRow | null>(null);
  const [days, setDays] = useState<DayBundle[]>([]);
  const [flights, setFlights] = useState<FlightRow[]>([]);
  const [transportation, setTransportation] = useState<TransportationRow[]>([]);
  const [accommodations, setAccommodations] = useState<AccommodationRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setTab = useCallback(
    (next: TripTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      router.replace(`/trips/${tripId}?${params.toString()}`);
    },
    [router, searchParams, tripId],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createBrowserSupabase();
    const { data: tripRow, error: tripErr } = await supabase
      .from("trips")
      .select("*")
      .eq("id", tripId)
      .single();
    if (tripErr || !tripRow) {
      setError("Trip not found.");
      setTrip(null);
      setLoading(false);
      return;
    }
    setTrip(tripRow as TripRow);

    let dayRows =
      (
        await supabase
          .from("trip_days")
          .select("*, time_blocks(*), activities(*)")
          .eq("trip_id", tripId)
          .order("day_number", { ascending: true })
      ).data ?? [];

    const synced = await syncTripDaysToDateRange(
      supabase,
      tripId,
      tripRow.start_date as string,
      tripRow.end_date as string,
    );
    if (synced) {
      const { data: again } = await supabase
        .from("trip_days")
        .select("*, time_blocks(*), activities(*)")
        .eq("trip_id", tripId)
        .order("day_number", { ascending: true });
      dayRows = again ?? [];
    }

    setDays(normalizeDayBundles(dayRows));

    const { data: flightRows } = await supabase
      .from("flights")
      .select("*")
      .eq("trip_id", tripId);
    setFlights((flightRows ?? []) as FlightRow[]);

    const { data: transportationRows } = await supabase
      .from("transportation_bookings")
      .select("*")
      .eq("trip_id", tripId);
    setTransportation((transportationRows ?? []) as TransportationRow[]);

    const { data: accRows } = await supabase
      .from("accommodations")
      .select("*")
      .eq("trip_id", tripId);
    setAccommodations((accRows ?? []) as AccommodationRow[]);

    const { data: expRows } = await supabase
      .from("expenses")
      .select("*")
      .eq("trip_id", tripId);
    setExpenses((expRows ?? []) as ExpenseRow[]);

    const { data: photoRows } = await supabase
      .from("photos")
      .select("*")
      .eq("trip_id", tripId);
    setPhotos((photoRows ?? []) as PhotoRow[]);

    if (tripRow.cover_image_path) {
      const url = await getSignedFileUrl(
        "covers",
        tripRow.cover_image_path as string,
      );
      setCoverUrl(url);
    } else {
      setCoverUrl(null);
    }

    const urls: Record<string, string> = {};
    for (const p of (photoRows ?? []) as PhotoRow[]) {
      const u = await getSignedFileUrl("dayPhotos", p.storage_path);
      if (u) urls[p.id] = u;
    }
    setPhotoUrls(urls);

    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const heroStops = trip ? parseTripDestinations(trip) : [];
  const heroImage =
    coverUrl ??
    (trip
      ? tripCoverFallback(primaryTripCity(heroStops))
      : tripCoverFallback("Travel"));

  const duplicateTrip = async () => {
    if (!isAdmin) return;
    const supabase = createBrowserSupabase();
    const { data, error: rpcErr } = await supabase.rpc("duplicate_trip", {
      p_source_trip_id: tripId,
    });
    if (rpcErr) {
      alert(rpcErr.message);
      return;
    }
    const raw = data as unknown;
    const newId =
      typeof raw === "string"
        ? raw
        : Array.isArray(raw) && typeof raw[0] === "string"
          ? raw[0]
          : null;
    if (!newId) {
      alert("Could not read new trip id from duplicate_trip.");
      return;
    }
    router.push(`/trips/${newId}?tab=overview`);
  };

  const deleteTrip = async () => {
    if (!isAdmin) return;
    if (
      !confirm(
        "Delete this trip permanently? All itinerary days, flights, transportation, hotels, expenses, photos, and notes will be removed. This cannot be undone.",
      )
    ) {
      return;
    }
    const supabase = createBrowserSupabase();
    const { error } = await supabase.from("trips").delete().eq("id", tripId);
    if (error) {
      alert(error.message);
      return;
    }
    router.push("/");
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-64 animate-pulse rounded-3xl bg-[var(--elevated)]" />
        <div className="h-10 w-2/3 animate-pulse rounded-full bg-[var(--elevated)]" />
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-10 text-center">
        <p className="text-sm text-[var(--muted)]">
          {error ?? "Missing trip."}
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-semibold text-[var(--accent)]"
        >
          Back home
        </Link>
      </div>
    );
  }

  const phase = tripPhase(trip.start_date, trip.end_date);
  const daysCount = tripDayCount(trip.start_date, trip.end_date);

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--card)] shadow-soft">
        <div className="relative h-72 w-full">
          <Image
            src={heroImage}
            alt=""
            fill
            className="object-cover"
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute bottom-8 left-8 right-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/70">
                Wonderlust
              </p>
              <h1 className="mt-2 font-display text-4xl text-white md:text-5xl">
                {trip.name}
              </h1>
              <p className="mt-2 text-sm text-white/80">
                {formatTripDestinationsLabel(heroStops)} ·{" "}
                {formatDateRange(trip.start_date, trip.end_date)} · {daysCount}{" "}
                days
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                {phase}
              </span>
              {isAdmin ? (
                <>
                  <Link
                    href={`/trips/${tripId}/edit`}
                    className="rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-black"
                  >
                    Edit trip
                  </Link>
                  <button
                    type="button"
                    onClick={() => void duplicateTrip()}
                    className="rounded-full border border-white/30 px-4 py-2 text-xs font-semibold text-white"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteTrip()}
                    className="rounded-full border border-red-400/50 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-100"
                  >
                    Delete trip
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-[var(--border)] bg-[var(--elevated)]/60 px-4 py-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition",
                tab === t.id
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {tab === "overview" ? (
            <div className="space-y-8">
              <CostBreakdown
                trip={trip}
                flights={flights}
                transportation={transportation}
                accommodations={accommodations}
                expenses={expenses}
              />
              <div className="grid gap-6 md:grid-cols-3">
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6">
                  <h3 className="font-display text-2xl">Flights snapshot</h3>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {flights.length} segments on file.
                  </p>
                </div>
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6">
                  <h3 className="font-display text-2xl">Transportation snapshot</h3>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {transportation.length} bookings on file.
                  </p>
                </div>
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6">
                  <h3 className="font-display text-2xl">Stays snapshot</h3>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {accommodations.length} accommodations.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "itinerary" ? (
            <ItineraryPanel
              trip={trip}
              days={days}
              isAdmin={isAdmin}
              onRefresh={refresh}
            />
          ) : null}
          {tab === "flights" ? (
            <FlightsPanel
              tripId={trip.id}
              flights={flights}
              isAdmin={isAdmin}
              onRefresh={refresh}
            />
          ) : null}
          {tab === "transportation" ? (
            <TransportationPanel
              tripId={trip.id}
              transportation={transportation}
              isAdmin={isAdmin}
              onRefresh={refresh}
            />
          ) : null}
          {tab === "hotels" ? (
            <HotelsPanel
              tripId={trip.id}
              rows={accommodations}
              isAdmin={isAdmin}
              onRefresh={refresh}
            />
          ) : null}
          {tab === "expenses" ? (
            <ExpensesPanel
              trip={trip}
              expenses={expenses}
              isAdmin={isAdmin}
              onRefresh={refresh}
            />
          ) : null}
          {tab === "photos" ? (
            <PhotosPanel
              trip={trip}
              days={days}
              photos={photos}
              photoUrls={photoUrls}
              isAdmin={isAdmin}
              onRefresh={refresh}
            />
          ) : null}
          {tab === "notes" ? (
            <NotesPanel trip={trip} isAdmin={isAdmin} onUpdated={refresh} />
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ItineraryPanel({
  trip,
  days,
  isAdmin,
  onRefresh,
}: {
  trip: TripRow;
  days: DayBundle[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [activityModalDayId, setActivityModalDayId] = useState<string | null>(
    null,
  );
  const [modalTitle, setModalTitle] = useState("");
  const [modalDetails, setModalDetails] = useState("");
  const [modalUrl, setModalUrl] = useState("");
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<DayEditFormState | null>(null);

  const openActivityModal = (dayId: string) => {
    setActivityModalDayId(dayId);
    setModalTitle("");
    setModalDetails("");
    setModalUrl("");
  };

  const closeActivityModal = () => {
    setActivityModalDayId(null);
    setModalTitle("");
    setModalDetails("");
    setModalUrl("");
  };

  const saveActivityFromModal = async () => {
    if (!isAdmin || !activityModalDayId || !modalTitle.trim()) return;
    const supabase = createBrowserSupabase();
    const day = days.find((d) => d.id === activityModalDayId);
    const sort = (day?.activities.length ?? 0) + 1;
    const { data, error } = await supabase
      .from("activities")
      .insert({
        trip_day_id: activityModalDayId,
        title: modalTitle.trim(),
        details: modalDetails.trim() || null,
        url: modalUrl.trim() || null,
        sort_order: sort,
      })
      .select("*")
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    if (modalUrl.trim())
      await attachPreviewIdForUrl(
        "activities",
        (data as ActivityRow).id,
        modalUrl.trim(),
      );
    closeActivityModal();
    await onRefresh();
  };

  const addBlock = async (dId: string) => {
    if (!isAdmin) return;
    const supabase = createBrowserSupabase();
    const day = days.find((d) => d.id === dId);
    const sort = (day?.time_blocks.length ?? 0) + 1;
    const { error } = await supabase.from("time_blocks").insert({
      trip_day_id: dId,
      title: "New moment",
      details: null,
      start_time: null,
      end_time: null,
      sort_order: sort,
    });
    if (error) {
      alert(error.message);
      return;
    }
    await onRefresh();
  };

  const addDay = async () => {
    if (!isAdmin) return;
    const supabase = createBrowserSupabase();
    const last = days[days.length - 1];
    const base = last
      ? addDays(parseISO(last.day_date), 1)
      : parseISO(trip.start_date);
    const end = parseISO(trip.end_date);
    if (base > end) {
      alert("No remaining dates inside this trip window.");
      return;
    }
    const nextNum = (last?.day_number ?? 0) + 1;
    const { error } = await supabase.from("trip_days").insert({
      trip_id: trip.id,
      day_date: format(base, "yyyy-MM-dd"),
      day_number: nextNum,
      title: `Day ${nextNum}`,
      summary: null,
      location: null,
      notes: null,
    });
    if (error) {
      alert(error.message);
      return;
    }
    await onRefresh();
  };

  const startEditDay = (day: DayBundle) => {
    setEditingDayId(day.id);
    setEditForm({
      day_date: day.day_date,
      day_number: String(day.day_number),
      title: day.title ?? "",
      summary: day.summary ?? "",
      location: day.location ?? "",
      notes: day.notes ?? "",
    });
  };

  const cancelEditDay = () => {
    setEditingDayId(null);
    setEditForm(null);
  };

  const saveDayEdit = async () => {
    if (!isAdmin || !editingDayId || !editForm) return;
    const day_number = Number.parseInt(editForm.day_number, 10);
    if (Number.isNaN(day_number) || day_number < 1) {
      alert("Day number must be a positive whole number.");
      return;
    }
    if (
      editForm.day_date < trip.start_date ||
      editForm.day_date > trip.end_date
    ) {
      alert("That date is outside this trip's start and end dates.");
      return;
    }
    if (
      days.some((d) => d.id !== editingDayId && d.day_number === day_number)
    ) {
      alert(
        "Another day already uses that day number. Pick a different number.",
      );
      return;
    }
    if (
      days.some(
        (d) => d.id !== editingDayId && d.day_date === editForm.day_date,
      )
    ) {
      alert("Another day already uses that date. Pick a different date.");
      return;
    }
    const supabase = createBrowserSupabase();
    const { error } = await supabase
      .from("trip_days")
      .update({
        day_date: editForm.day_date,
        day_number,
        title: editForm.title.trim() || null,
        summary: editForm.summary.trim() || null,
        location: editForm.location.trim() || null,
        notes: editForm.notes.trim() || null,
      })
      .eq("id", editingDayId);
    if (error) {
      alert(error.message);
      return;
    }
    cancelEditDay();
    await onRefresh();
  };

  const deleteDay = async (day: DayBundle) => {
    if (!isAdmin) return;
    if (
      !confirm(
        `Delete Day ${day.day_number} (${format(parseISO(day.day_date), "MMM d")})? All time blocks and activities on this day will be removed.`,
      )
    ) {
      return;
    }
    const supabase = createBrowserSupabase();
    const { error } = await supabase
      .from("trip_days")
      .delete()
      .eq("id", day.id);
    if (error) {
      alert(error.message);
      return;
    }
    if (editingDayId === day.id) cancelEditDay();
    await onRefresh();
  };

  const activityTargetDay = activityModalDayId
    ? days.find((d) => d.id === activityModalDayId)
    : undefined;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl">Itinerary</h2>
          <p className="text-sm text-[var(--muted)]">
            One row per day of your trip. Use the + on a day to add an activity
            for that day.
          </p>
        </div>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => void addDay()}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)]"
          >
            Add day
          </button>
        ) : null}
      </div>

      <div className="relative space-y-10 pl-4 sm:pl-8">
        <div className="absolute left-2 top-2 bottom-2 w-px bg-gradient-to-b from-[var(--accent)]/60 via-[var(--border)] to-transparent sm:left-4" />
        {days.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No days yet. Add a day to start planning.
          </p>
        ) : (
          days.map((day) => (
            <div
              key={day.id}
              className="relative rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-soft"
            >
              <div className="absolute -left-[9px] top-8 h-3 w-3 rounded-full border border-[var(--accent)] bg-[var(--background)] sm:-left-[7px]" />
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Day {day.day_number} ·{" "}
                    {format(parseISO(day.day_date), "EEE, MMM d")}
                  </p>
                  <h3 className="mt-2 font-display text-2xl">
                    {day.title || "Untitled day"}
                  </h3>
                  {day.summary ? (
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      {day.summary}
                    </p>
                  ) : null}
                  {day.location ? (
                    <p className="mt-2 text-xs uppercase tracking-wide text-[var(--accent)]">
                      {day.location}
                    </p>
                  ) : null}
                </div>
                {isAdmin ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openActivityModal(day.id)}
                      title="Add activity"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-lg font-light leading-none text-[var(--foreground)] transition hover:border-[var(--accent)] hover:bg-[var(--accent)]/10"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => void addBlock(day.id)}
                      className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold"
                    >
                      Add time block
                    </button>
                    {editingDayId === day.id ? (
                      <button
                        type="button"
                        onClick={cancelEditDay}
                        className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--muted)]"
                      >
                        Cancel edit
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditDay(day)}
                        className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold"
                      >
                        Edit day
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void deleteDay(day)}
                      className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-600 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>

              {isAdmin && editingDayId === day.id && editForm ? (
                <div className="mt-6 grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--elevated)]/50 p-4 sm:grid-cols-2">
                  <label className="text-xs text-[var(--muted)]">
                    Date
                    <input
                      type="date"
                      className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
                      value={editForm.day_date}
                      min={trip.start_date}
                      max={trip.end_date}
                      onChange={(e) =>
                        setEditForm({ ...editForm, day_date: e.target.value })
                      }
                    />
                  </label>
                  <label className="text-xs text-[var(--muted)]">
                    Day number
                    <input
                      type="number"
                      min={1}
                      className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
                      value={editForm.day_number}
                      onChange={(e) =>
                        setEditForm({ ...editForm, day_number: e.target.value })
                      }
                    />
                  </label>
                  <label className="text-xs text-[var(--muted)] sm:col-span-2">
                    Title
                    <input
                      className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
                      value={editForm.title}
                      onChange={(e) =>
                        setEditForm({ ...editForm, title: e.target.value })
                      }
                    />
                  </label>
                  <label className="text-xs text-[var(--muted)] sm:col-span-2">
                    Summary
                    <textarea
                      className="mt-1 min-h-[64px] w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
                      value={editForm.summary}
                      onChange={(e) =>
                        setEditForm({ ...editForm, summary: e.target.value })
                      }
                    />
                  </label>
                  <label className="text-xs text-[var(--muted)]">
                    Location
                    <input
                      className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
                      value={editForm.location}
                      onChange={(e) =>
                        setEditForm({ ...editForm, location: e.target.value })
                      }
                    />
                  </label>
                  <label className="text-xs text-[var(--muted)] sm:col-span-2">
                    Notes
                    <textarea
                      className="mt-1 min-h-[64px] w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
                      value={editForm.notes}
                      onChange={(e) =>
                        setEditForm({ ...editForm, notes: e.target.value })
                      }
                    />
                  </label>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <button
                      type="button"
                      onClick={() => void saveDayEdit()}
                      className="rounded-full bg-[var(--foreground)] px-4 py-2 text-xs font-semibold text-[var(--background)]"
                    >
                      Save day
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditDay}
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-6 space-y-4">
                {day.time_blocks.map((b) => (
                  <div
                    key={b.id}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-4 py-3"
                  >
                    <p className="text-xs text-[var(--muted)]">
                      {b.start_time || "—"}{" "}
                      {b.end_time ? `– ${b.end_time}` : ""}
                    </p>
                    <p className="font-medium">{b.title}</p>
                    {b.details ? (
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {b.details}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="mt-8 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Activities & links
                </p>
                {day.activities.map((a) => (
                  <div key={a.id} className="space-y-3">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--elevated)]/60 p-4">
                      <p className="font-semibold">{a.title}</p>
                      {a.details ? (
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {a.details}
                        </p>
                      ) : null}
                    </div>
                    {a.url ? (
                      <LinkPreviewCard
                        href={a.url}
                        compact
                        titleOverride={a.preview_title}
                        imageOverride={a.preview_image_url}
                        descriptionOverride={a.preview_description}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <AnimatePresence>
        {isAdmin && activityModalDayId ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeActivityModal}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 className="font-display text-2xl">
                Add activity
                {activityTargetDay ? (
                  <span className="mt-1 block text-sm font-normal text-[var(--muted)]">
                    Day {activityTargetDay.day_number} ·{" "}
                    {format(parseISO(activityTargetDay.day_date), "EEE, MMM d")}
                  </span>
                ) : null}
              </h4>
              <div className="mt-5 grid gap-3">
                <label className="text-xs text-[var(--muted)]">
                  Title
                  <input
                    autoFocus
                    className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
                    value={modalTitle}
                    onChange={(e) => setModalTitle(e.target.value)}
                    placeholder="Museum visit, dinner reservation…"
                  />
                </label>
                <label className="text-xs text-[var(--muted)]">
                  Details
                  <textarea
                    className="mt-1 min-h-[80px] w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
                    value={modalDetails}
                    onChange={(e) => setModalDetails(e.target.value)}
                  />
                </label>
                <label className="text-xs text-[var(--muted)]">
                  Link (optional)
                  <input
                    className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
                    value={modalUrl}
                    onChange={(e) => setModalUrl(e.target.value)}
                    placeholder="https://"
                  />
                </label>
              </div>
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={closeActivityModal}
                  className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveActivityFromModal()}
                  className="rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--background)]"
                >
                  Save activity
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function FlightsPanel({
  tripId,
  flights,
  isAdmin,
  onRefresh,
}: {
  tripId: string;
  flights: FlightRow[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    airline: "",
    flight_number: "",
    departure_airport: "",
    arrival_airport: "",
    departure_at: "",
    arrival_at: "",
    seat_class: "",
    booking_reference: "",
    amount: "",
    currency: "USD",
    notes: "",
  });

  const save = async () => {
    const supabase = createBrowserSupabase();
    const { error } = await supabase.from("flights").insert({
      trip_id: tripId,
      airline: form.airline,
      flight_number: form.flight_number || null,
      departure_airport: form.departure_airport,
      arrival_airport: form.arrival_airport,
      departure_at: form.departure_at,
      arrival_at: form.arrival_at,
      seat_class: form.seat_class || null,
      booking_reference: form.booking_reference || null,
      amount: Number(form.amount || 0),
      currency: form.currency,
      notes: form.notes || null,
    });
    if (error) {
      alert(error.message);
      return;
    }
    setOpen(false);
    await onRefresh();
  };

  const remove = async (id: string) => {
    if (!isAdmin) return;
    const supabase = createBrowserSupabase();
    await supabase.from("flights").delete().eq("id", id);
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-3xl">Flights</h2>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)]"
          >
            {open ? "Close" : "Add flight"}
          </button>
        ) : null}
      </div>

      {open && isAdmin ? (
        <div className="grid gap-3 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 md:grid-cols-2">
          {(
            [
              ["airline", "Airline"],
              ["flight_number", "Flight #"],
              ["departure_airport", "From airport"],
              ["arrival_airport", "To airport"],
              ["departure_at", "Depart (ISO)"],
              ["arrival_at", "Arrive (ISO)"],
              ["seat_class", "Seat / class"],
              ["booking_reference", "PNR"],
              ["amount", "Cost"],
              ["currency", "Currency"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="text-xs text-[var(--muted)]">
              {label}
              <input
                className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
                value={(form as Record<string, string>)[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </label>
          ))}
          <label className="text-xs text-[var(--muted)] md:col-span-2">
            Notes
            <textarea
              className="mt-1 min-h-[64px] w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <button
            type="button"
            onClick={() => void save()}
            className="md:col-span-2 rounded-full bg-[var(--foreground)] px-4 py-2 text-xs font-semibold text-[var(--background)]"
          >
            Save flight
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {flights.map((f) => (
          <div
            key={f.id}
            className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  {f.airline} {f.flight_number ? `· ${f.flight_number}` : ""}
                </p>
                <p className="mt-2 font-display text-2xl">
                  {f.departure_airport} → {f.arrival_airport}
                </p>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {format(parseISO(f.departure_at), "MMM d, HH:mm")} →{" "}
                  {format(parseISO(f.arrival_at), "MMM d, HH:mm")}
                </p>
                <p className="mt-3 text-sm text-[var(--muted)]">
                  {f.seat_class || "Economy"} · PNR {f.booking_reference || "—"}
                </p>
                <p className="mt-3 text-sm font-semibold">
                  {formatMoney(Number(f.amount), f.currency)}
                </p>
              </div>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => void remove(f.id)}
                  className="text-xs text-rose-400"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransportationPanel({
  tripId,
  transportation,
  isAdmin,
  onRefresh,
}: {
  tripId: string;
  transportation: TransportationRow[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    provider: "",
    transport_type: "train",
    departure_location: "",
    arrival_location: "",
    departure_at: "",
    arrival_at: "",
    seat_class: "",
    booking_reference: "",
    amount: "",
    currency: "USD",
    notes: "",
  });

  const save = async () => {
    const supabase = createBrowserSupabase();
    const { error } = await supabase.from("transportation_bookings").insert({
      trip_id: tripId,
      provider: form.provider,
      transport_type: form.transport_type,
      departure_location: form.departure_location,
      arrival_location: form.arrival_location,
      departure_at: form.departure_at,
      arrival_at: form.arrival_at || null,
      seat_class: form.seat_class || null,
      booking_reference: form.booking_reference || null,
      amount: Number(form.amount || 0),
      currency: form.currency,
      notes: form.notes || null,
    });
    if (error) {
      alert(error.message);
      return;
    }
    setOpen(false);
    await onRefresh();
  };

  const remove = async (id: string) => {
    if (!isAdmin) return;
    const supabase = createBrowserSupabase();
    await supabase.from("transportation_bookings").delete().eq("id", id);
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-3xl">Transportation</h2>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)]"
          >
            {open ? "Close" : "Add transportation"}
          </button>
        ) : null}
      </div>

      {open && isAdmin ? (
        <div className="grid gap-3 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 md:grid-cols-2">
          {(
            [
              ["provider", "Provider"],
              ["transport_type", "Type"],
              ["departure_location", "From"],
              ["arrival_location", "To"],
              ["departure_at", "Depart (ISO)"],
              ["arrival_at", "Arrive (ISO)"],
              ["seat_class", "Seat / class"],
              ["booking_reference", "Booking reference"],
              ["amount", "Cost"],
              ["currency", "Currency"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="text-xs text-[var(--muted)]">
              {label}
              <input
                className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
                value={(form as Record<string, string>)[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </label>
          ))}
          <label className="text-xs text-[var(--muted)] md:col-span-2">
            Notes
            <textarea
              className="mt-1 min-h-[64px] w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <button
            type="button"
            onClick={() => void save()}
            className="md:col-span-2 rounded-full bg-[var(--foreground)] px-4 py-2 text-xs font-semibold text-[var(--background)]"
          >
            Save transportation
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {transportation.map((item) => (
          <div
            key={item.id}
            className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  {item.transport_type} · {item.provider}
                </p>
                <p className="mt-2 font-display text-2xl">
                  {item.departure_location} → {item.arrival_location}
                </p>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {format(parseISO(item.departure_at), "MMM d, HH:mm")}
                  {item.arrival_at
                    ? ` → ${format(parseISO(item.arrival_at), "MMM d, HH:mm")}`
                    : ""}
                </p>
                <p className="mt-3 text-sm text-[var(--muted)]">
                  {item.seat_class || "Standard"} · Ref {item.booking_reference || "—"}
                </p>
                <p className="mt-3 text-sm font-semibold">
                  {formatMoney(Number(item.amount), item.currency)}
                </p>
              </div>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => void remove(item.id)}
                  className="text-xs text-rose-400"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HotelsPanel({
  tripId,
  rows,
  isAdmin,
  onRefresh,
}: {
  tripId: string;
  rows: AccommodationRow[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    accommodation_type: "hotel",
    address: "",
    check_in: "",
    check_out: "",
    confirmation_number: "",
    room_type: "",
    booking_url: "",
    amount: "",
    currency: "USD",
    notes: "",
  });

  const save = async () => {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase
      .from("accommodations")
      .insert({
        trip_id: tripId,
        name: form.name,
        accommodation_type: form.accommodation_type,
        address: form.address || null,
        check_in: form.check_in,
        check_out: form.check_out,
        confirmation_number: form.confirmation_number || null,
        room_type: form.room_type || null,
        booking_url: form.booking_url || null,
        amount: Number(form.amount || 0),
        currency: form.currency,
        notes: form.notes || null,
      })
      .select("*")
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    if (form.booking_url.trim()) {
      await attachPreviewIdForUrl(
        "accommodations",
        (data as AccommodationRow).id,
        form.booking_url.trim(),
      );
    }
    setOpen(false);
    await onRefresh();
  };

  const remove = async (id: string) => {
    const supabase = createBrowserSupabase();
    await supabase.from("accommodations").delete().eq("id", id);
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-3xl">Stays</h2>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)]"
          >
            {open ? "Close" : "Add stay"}
          </button>
        ) : null}
      </div>

      {open && isAdmin ? (
        <div className="grid gap-3 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 md:grid-cols-2">
          {(
            [
              ["name", "Name"],
              ["accommodation_type", "Type"],
              ["address", "Address"],
              ["check_in", "Check-in (ISO)"],
              ["check_out", "Check-out (ISO)"],
              ["confirmation_number", "Confirmation"],
              ["room_type", "Room type"],
              ["booking_url", "Booking URL"],
              ["amount", "Cost"],
              ["currency", "Currency"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="text-xs text-[var(--muted)]">
              {label}
              <input
                className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
                value={(form as Record<string, string>)[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </label>
          ))}
          <label className="text-xs text-[var(--muted)] md:col-span-2">
            Notes
            <textarea
              className="mt-1 min-h-[64px] w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <button
            type="button"
            onClick={() => void save()}
            className="md:col-span-2 rounded-full bg-[var(--foreground)] px-4 py-2 text-xs font-semibold text-[var(--background)]"
          >
            Save stay
          </button>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        {rows.map((h) => (
          <div key={h.id} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  {h.accommodation_type}
                </p>
                <h3 className="font-display text-2xl">{h.name}</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">{h.address}</p>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {format(parseISO(h.check_in), "MMM d, HH:mm")} →{" "}
                  {format(parseISO(h.check_out), "MMM d, HH:mm")}
                </p>
                <p className="mt-3 text-sm font-semibold">
                  {formatMoney(Number(h.amount), h.currency)}
                </p>
              </div>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => void remove(h.id)}
                  className="text-xs text-rose-400"
                >
                  Remove
                </button>
              ) : null}
            </div>
            {h.booking_url ? (
              <LinkPreviewCard
                href={h.booking_url}
                compact
                titleOverride={h.preview_title}
                imageOverride={h.preview_image_url}
                descriptionOverride={h.preview_description}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ExpensesPanel({
  trip,
  expenses,
  isAdmin,
  onRefresh,
}: {
  trip: TripRow;
  expenses: ExpenseRow[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "misc" as (typeof EXPENSE_CATEGORIES)[number],
    amount: "",
    currency: trip.budget_currency || "USD",
    expense_date: format(new Date(), "yyyy-MM-dd"),
    paid_by: "",
    split_count: "2",
    is_shared: true,
    notes: "",
  });

  const save = async () => {
    const supabase = createBrowserSupabase();
    const { error } = await supabase.from("expenses").insert({
      trip_id: trip.id,
      title: form.title,
      category: form.category,
      amount: Number(form.amount || 0),
      currency: form.currency,
      expense_date: form.expense_date,
      paid_by: form.paid_by || null,
      split_count: Number(form.split_count || 1),
      is_shared: form.is_shared,
      notes: form.notes || null,
    });
    if (error) {
      alert(error.message);
      return;
    }
    setOpen(false);
    await onRefresh();
  };

  const remove = async (id: string) => {
    const supabase = createBrowserSupabase();
    await supabase.from("expenses").delete().eq("id", id);
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-3xl">Expenses</h2>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)]"
          >
            {open ? "Close" : "Add expense"}
          </button>
        ) : null}
      </div>

      {open && isAdmin ? (
        <div className="grid gap-3 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 md:grid-cols-2">
          <label className="text-xs text-[var(--muted)]">
            Title
            <input
              className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Category
            <select
              className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
              value={form.category}
              onChange={(e) =>
                setForm({
                  ...form,
                  category: e.target
                    .value as (typeof EXPENSE_CATEGORIES)[number],
                })
              }
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[var(--muted)]">
            Amount
            <input
              className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Currency
            <input
              className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Date
            <input
              type="date"
              className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
              value={form.expense_date}
              onChange={(e) =>
                setForm({ ...form, expense_date: e.target.value })
              }
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Paid by
            <input
              className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
              value={form.paid_by}
              onChange={(e) => setForm({ ...form, paid_by: e.target.value })}
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Split count
            <input
              className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
              value={form.split_count}
              onChange={(e) =>
                setForm({ ...form, split_count: e.target.value })
              }
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)] md:col-span-2">
            <input
              type="checkbox"
              checked={form.is_shared}
              onChange={(e) =>
                setForm({ ...form, is_shared: e.target.checked })
              }
            />
            Shared expense
          </label>
          <label className="text-xs text-[var(--muted)] md:col-span-2">
            Notes
            <textarea
              className="mt-1 min-h-[64px] w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <button
            type="button"
            onClick={() => void save()}
            className="md:col-span-2 rounded-full bg-[var(--foreground)] px-4 py-2 text-xs font-semibold text-[var(--background)]"
          >
            Save expense
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--elevated)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Shared</th>
              {isAdmin ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-medium">{e.title}</td>
                <td className="px-4 py-3 capitalize text-[var(--muted)]">
                  {e.category}
                </td>
                <td className="px-4 py-3">
                  {formatMoney(Number(e.amount), e.currency)}
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">
                  {e.is_shared ? "Yes" : "No"}
                </td>
                {isAdmin ? (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-xs text-rose-400"
                      onClick={() => void remove(e.id)}
                    >
                      Remove
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PhotosPanel({
  trip,
  days,
  photos,
  photoUrls,
  isAdmin,
  onRefresh,
}: {
  trip: TripRow;
  days: DayBundle[];
  photos: PhotoRow[];
  photoUrls: Record<string, string>;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [dayId, setDayId] = useState<string | "none">(days[0]?.id ?? "none");

  const grouped = useMemo(() => {
    const map = new Map<string | "trip", PhotoRow[]>();
    map.set("trip", []);
    for (const d of days) map.set(d.id, []);
    for (const p of photos) {
      const key = p.trip_day_id ?? "trip";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [days, photos]);

  const upload = async (files: FileList | null) => {
    if (!isAdmin || !files?.length) return;
    const supabase = createBrowserSupabase();
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg";
      const name = `${crypto.randomUUID()}.${ext}`;
      const path =
        dayId === "none"
          ? buildDayPhotoPath(trip.id, "general", name)
          : buildDayPhotoPath(trip.id, dayId, name);
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKETS.dayPhotos)
        .upload(path, file, {
          upsert: false,
        });
      if (upErr) {
        alert(upErr.message);
        return;
      }
      const { error: insErr } = await supabase.from("photos").insert({
        trip_id: trip.id,
        trip_day_id: dayId === "none" ? null : dayId,
        storage_path: path,
        caption: null,
        sort_order: photos.length + 1,
      });
      if (insErr) {
        alert(insErr.message);
        return;
      }
    }
    await onRefresh();
  };

  const remove = async (p: PhotoRow) => {
    const supabase = createBrowserSupabase();
    await supabase.storage
      .from(STORAGE_BUCKETS.dayPhotos)
      .remove([p.storage_path]);
    await supabase.from("photos").delete().eq("id", p.id);
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-3xl">Photos</h2>
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="rounded-full border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-xs"
              value={dayId}
              onChange={(e) => setDayId(e.target.value as string | "none")}
            >
              <option value="none">Trip gallery</option>
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  Day {d.day_number}
                </option>
              ))}
            </select>
            <label className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)]">
              Upload
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => void upload(e.target.files)}
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className="grid gap-10">
        {Array.from(grouped.entries()).map(([key, list]) => {
          if (!list.length) return null;
          const label =
            key === "trip"
              ? "Trip"
              : `Day ${days.find((d) => d.id === key)?.day_number ?? ""}`;
          return (
            <div key={String(key)}>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {label}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                {list.map((p) => (
                  <div
                    key={p.id}
                    className="group relative overflow-hidden rounded-2xl border border-[var(--border)]"
                  >
                    {photoUrls[p.id] ? (
                      <div className="relative aspect-[4/3] w-full">
                        <Image
                          src={photoUrls[p.id]}
                          alt=""
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="aspect-[4/3] w-full bg-[var(--elevated)]" />
                    )}
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => void remove(p)}
                        className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NotesPanel({
  trip,
  isAdmin,
  onUpdated,
}: {
  trip: TripRow;
  isAdmin: boolean;
  onUpdated: () => Promise<void>;
}) {
  const [notes, setNotes] = useState(trip.notes ?? "");

  useEffect(() => {
    setNotes(trip.notes ?? "");
  }, [trip.notes]);

  const save = async () => {
    const supabase = createBrowserSupabase();
    await supabase.from("trips").update({ notes }).eq("id", trip.id);
    await onUpdated();
  };

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="font-display text-3xl">Notes</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Long-form thoughts, packing lists, and reminders.
      </p>
      <textarea
        disabled={!isAdmin}
        className="mt-6 min-h-[220px] w-full rounded-3xl border border-[var(--border)] bg-[var(--elevated)] px-4 py-3 text-sm disabled:opacity-60"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {isAdmin ? (
        <button
          type="button"
          onClick={() => void save()}
          className="mt-4 rounded-full bg-[var(--foreground)] px-4 py-2 text-xs font-semibold text-[var(--background)]"
        >
          Save notes
        </button>
      ) : null}
    </div>
  );
}
