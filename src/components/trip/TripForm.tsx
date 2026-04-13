"use client";

import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { buildCoverPath } from "@/lib/storage";
import { STORAGE_BUCKETS } from "@/lib/constants";
import { optimizeImageFile } from "@/lib/image-upload";
import type { TripRow } from "@/types/db";
import type { TripDestination } from "@/lib/trip-destinations";
import { parseTripDestinations } from "@/lib/trip-destinations";
import { cn } from "@/lib/utils";

type Props = {
  mode: "create" | "edit";
  initial?: TripRow | null;
};

function stopsFromTrip(initial?: TripRow | null): TripDestination[] {
  if (!initial) return [{ city: "", country: "" }];
  const parsed = parseTripDestinations(initial);
  return parsed.length ? parsed.map((s) => ({ ...s })) : [{ city: "", country: "" }];
}

export function TripForm({ mode, initial }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [stops, setStops] = useState<TripDestination[]>(() => stopsFromTrip(initial));
  const [start, setStart] = useState(initial?.start_date ?? format(new Date(), "yyyy-MM-dd"));
  const [end, setEnd] = useState(initial?.end_date ?? format(new Date(), "yyyy-MM-dd"));
  const [travelers, setTravelers] = useState(String(initial?.traveler_count ?? 2));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [budget, setBudget] = useState(initial?.budget_amount != null ? String(initial.budget_amount) : "");
  const [currency, setCurrency] = useState(initial?.budget_currency ?? "USD");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const dayCount = useMemo(() => {
    try {
      return differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
    } catch {
      return 0;
    }
  }, [start, end]);

  const updateStop = (index: number, field: keyof TripDestination, value: string) => {
    setStops((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addStop = () => setStops((prev) => [...prev, { city: "", country: "" }]);
  const removeStop = (index: number) => {
    setStops((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = stops
      .map((s) => ({ city: s.city.trim(), country: s.country.trim() }))
      .filter((s) => s.city && s.country);
    if (cleaned.length === 0) {
      alert("Add at least one city and country.");
      return;
    }

    setSaving(true);
    const supabase = createBrowserSupabase();
    try {
      const primary = cleaned[0];
      const payload = {
        name: name.trim(),
        destination_city: primary.city,
        destination_country: primary.country,
        destinations: cleaned,
        start_date: start,
        end_date: end,
        traveler_count: Math.max(1, Number(travelers || 1)),
        notes: notes.trim() || null,
        budget_amount: budget.trim() ? Number(budget) : null,
        budget_currency: currency,
      };

      if (mode === "create") {
        const { data, error } = await supabase.from("trips").insert(payload).select("*").single();
        if (error || !data) {
          alert(error?.message ?? "Could not create trip");
          return;
        }
        const trip = data as TripRow;
        if (file) {
          const optimizedFile = await optimizeImageFile(file);
          const ext = optimizedFile.name.split(".").pop() || "jpg";
          const fname = `${crypto.randomUUID()}.${ext}`;
          const path = buildCoverPath(trip.id, fname);
          const { error: upErr } = await supabase.storage
            .from(STORAGE_BUCKETS.covers)
            .upload(path, optimizedFile, {
              contentType: optimizedFile.type,
              upsert: true,
            });
          if (!upErr) {
            await supabase.from("trips").update({ cover_image_path: path }).eq("id", trip.id);
          }
        }
        router.push(`/trips/${trip.id}?tab=overview`);
        return;
      }

      if (initial) {
        const { error } = await supabase.from("trips").update(payload).eq("id", initial.id);
        if (error) {
          alert(error.message);
          return;
        }
        if (file) {
          const optimizedFile = await optimizeImageFile(file);
          const ext = optimizedFile.name.split(".").pop() || "jpg";
          const fname = `${crypto.randomUUID()}.${ext}`;
          const path = buildCoverPath(initial.id, fname);
          const { error: upErr } = await supabase.storage
            .from(STORAGE_BUCKETS.covers)
            .upload(path, optimizedFile, {
              contentType: optimizedFile.type,
              upsert: true,
            });
          if (!upErr) {
            await supabase.from("trips").update({ cover_image_path: path }).eq("id", initial.id);
          }
        }
        router.push(`/trips/${initial.id}?tab=overview`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.form
      onSubmit={(e) => void onSubmit(e)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-3xl space-y-8 rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-8 shadow-soft"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
          {mode === "create" ? "New journey" : "Edit journey"}
        </p>
        <h1 className="mt-2 font-display text-4xl">{mode === "create" ? "Compose a trip" : "Refine this trip"}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {dayCount > 0 ? (
            <>
              <span className="font-semibold text-[var(--foreground)]">{dayCount}</span> days on the calendar.
            </>
          ) : (
            "Pick dates to see day count."
          )}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="md:col-span-2 text-xs text-[var(--muted)]">
          Trip name
          <input
            required
            className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-4 py-3 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kyoto in cherry season"
          />
        </label>

        <div className="md:col-span-2 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <label className="text-xs text-[var(--muted)]">Destinations</label>
            <button
              type="button"
              onClick={addStop}
              className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--elevated)]"
            >
              Add city
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--muted)]">
            Add every city you will visit. The first row is also used as the primary place for search and stats.
          </p>
          <div className="space-y-3">
            {stops.map((stop, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--elevated)]/60 p-4 sm:grid-cols-[1fr_1fr_auto]"
              >
                <label className="text-xs text-[var(--muted)]">
                  City {index === 0 ? <span className="text-[var(--accent)]">(primary)</span> : null}
                  <input
                    required={index === 0}
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
                    value={stop.city}
                    onChange={(e) => updateStop(index, "city", e.target.value)}
                    placeholder="Kyoto"
                  />
                </label>
                <label className="text-xs text-[var(--muted)]">
                  Country
                  <input
                    required={index === 0}
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
                    value={stop.country}
                    onChange={(e) => updateStop(index, "country", e.target.value)}
                    placeholder="Japan"
                  />
                </label>
                <div className="flex items-end justify-end sm:justify-center">
                  <button
                    type="button"
                    disabled={stops.length <= 1}
                    onClick={() => removeStop(index)}
                    className="rounded-full px-3 py-2 text-xs font-medium text-rose-400 disabled:opacity-30"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <label className="text-xs text-[var(--muted)]">
          Start
          <input
            type="date"
            required
            className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-4 py-3 text-sm"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          End
          <input
            type="date"
            required
            className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-4 py-3 text-sm"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Travelers
          <input
            type="number"
            min={1}
            className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-4 py-3 text-sm"
            value={travelers}
            onChange={(e) => setTravelers(e.target.value)}
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Budget (optional)
          <input
            type="number"
            min={0}
            className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-4 py-3 text-sm"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Currency
          <input
            className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-4 py-3 text-sm"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </label>
        <label className="md:col-span-2 text-xs text-[var(--muted)]">
          Cover image
          <input
            type="file"
            accept="image/*"
            className={cn(
              "mt-2 flex w-full cursor-pointer items-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--elevated)] px-4 py-6 text-sm"
            )}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="md:col-span-2 text-xs text-[var(--muted)]">
          Notes
          <textarea
            className="mt-2 min-h-[120px] w-full rounded-2xl border border-[var(--border)] bg-[var(--elevated)] px-4 py-3 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-[var(--accent-foreground)] disabled:opacity-50"
        >
          {saving ? "Saving…" : mode === "create" ? "Create trip" : "Save changes"}
        </button>
      </div>
    </motion.form>
  );
}
