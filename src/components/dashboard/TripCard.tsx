"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { formatMoney } from "@/lib/format";
import { formatTripDestinationsLabel, parseTripDestinations, primaryTripCity } from "@/lib/trip-destinations";
import { formatDateRange, sumAmounts, tripDayCount, tripPhase, type TripPhase } from "@/lib/trip-utils";
import type { TripWithCosts } from "@/types/db";
import { cn } from "@/lib/utils";
import { tripCoverFallback } from "@/lib/trip-image";

function phaseStyles(phase: TripPhase) {
  if (phase === "upcoming") return "bg-sky-500/15 text-sky-200 border-sky-500/20";
  if (phase === "active") return "bg-emerald-500/15 text-emerald-200 border-emerald-500/20";
  return "bg-white/5 text-[var(--muted)] border-[var(--border)]";
}

export function TripCard({
  trip,
  coverUrl,
  index,
}: {
  trip: TripWithCosts;
  coverUrl: string | null;
  index: number;
}) {
  const phase = tripPhase(trip.start_date, trip.end_date);
  const days = tripDayCount(trip.start_date, trip.end_date);
  const amounts = [
    ...(trip.flights ?? []),
    ...(trip.accommodations ?? []),
    ...(trip.expenses ?? []),
  ];
  const { total, currency } = sumAmounts(amounts, trip.budget_currency ?? "USD");

  const stops = parseTripDestinations(trip);
  const destLabel = formatTripDestinationsLabel(stops);
  const img = coverUrl ?? tripCoverFallback(primaryTripCity(stops));

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/trips/${trip.id}?tab=overview`}
        className="group block overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-soft"
      >
        <div className="relative h-48 w-full overflow-hidden">
          <Image
            src={img}
            alt=""
            fill
            className="object-cover transition duration-700 group-hover:scale-[1.04]"
            sizes="(max-width: 768px) 100vw, 33vw"
            unoptimized={!coverUrl}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute left-4 top-4">
            <span
              className={cn(
                "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide",
                phaseStyles(phase)
              )}
            >
              {phase}
            </span>
          </div>
          <div className="absolute bottom-4 left-4 right-4">
            <p className="text-xs font-medium text-white/80">{destLabel}</p>
            <h3 className="mt-1 font-display text-2xl text-white">{trip.name}</h3>
            <p className="mt-1 text-xs text-white/75">{formatDateRange(trip.start_date, trip.end_date)}</p>
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-4 text-sm">
          <div className="text-[var(--muted)]">
            <span className="font-semibold text-[var(--foreground)]">{days}</span> days
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Estimated total</p>
            <p className="font-semibold text-[var(--foreground)]">{formatMoney(total, currency)}</p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
