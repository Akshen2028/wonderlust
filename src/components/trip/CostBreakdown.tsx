"use client";

import { useMemo } from "react";
import { formatMoney } from "@/lib/format";
import { sumAmounts, tripDayCount } from "@/lib/trip-utils";
import type {
  AccommodationRow,
  ExpenseCategory,
  ExpenseRow,
  FlightRow,
  TransportationRow,
  TripRow,
} from "@/types/db";

type Props = {
  trip: TripRow;
  flights: FlightRow[];
  transportation: TransportationRow[];
  accommodations: AccommodationRow[];
  expenses: ExpenseRow[];
};

export function CostBreakdown({
  trip,
  flights,
  transportation,
  accommodations,
  expenses,
}: Props) {
  const days = tripDayCount(trip.start_date, trip.end_date);

  const flightTotal = useMemo(() => sumAmounts(flights, trip.budget_currency ?? "USD"), [flights, trip.budget_currency]);
  const transportationTotal = useMemo(
    () => sumAmounts(transportation, trip.budget_currency ?? "USD"),
    [transportation, trip.budget_currency]
  );
  const accTotal = useMemo(
    () => sumAmounts(accommodations, trip.budget_currency ?? "USD"),
    [accommodations, trip.budget_currency]
  );
  const expTotal = useMemo(
    () => sumAmounts(expenses, trip.budget_currency ?? "USD"),
    [expenses, trip.budget_currency]
  );

  const grand = flightTotal.total + transportationTotal.total + accTotal.total + expTotal.total;
  const currency = trip.budget_currency || flightTotal.currency;

  const perPerson = trip.traveler_count > 0 ? grand / trip.traveler_count : grand;
  const perDay = days > 0 ? grand / days : grand;

  const byCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const e of expenses) {
      map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const sharedPersonal = useMemo(() => {
    let shared = 0;
    let personal = 0;
    for (const e of expenses) {
      if (e.is_shared) shared += Number(e.amount);
      else personal += Number(e.amount);
    }
    return { shared, personal };
  }, [expenses]);

  const maxCat = byCategory[0]?.[1] ?? 1;

  const budget = trip.budget_amount != null ? Number(trip.budget_amount) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-soft lg:col-span-2">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Trip spend</p>
            <p className="mt-2 font-display text-4xl">{formatMoney(grand, currency)}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Flights {formatMoney(flightTotal.total, currency)} · Transportation {formatMoney(transportationTotal.total, currency)} · Stays {formatMoney(accTotal.total, currency)} · Day-to-day{" "}
              {formatMoney(expTotal.total, currency)}
            </p>
          </div>
          <div className="grid gap-3 text-right text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Per person</p>
              <p className="font-semibold">{formatMoney(perPerson, currency)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Daily average</p>
              <p className="font-semibold">{formatMoney(perDay, currency)}</p>
            </div>
          </div>
        </div>

        {budget != null ? (
          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--elevated)] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--muted)]">Budget</span>
              <span className="font-semibold">{formatMoney(budget, currency)}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.min(100, budget > 0 ? (grand / budget) * 100 : 0)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {grand <= budget
                ? "You are within budget."
                : `About ${formatMoney(Math.max(0, grand - budget), currency)} over budget.`}
            </p>
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--elevated)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Shared expenses</p>
            <p className="mt-2 font-display text-2xl">{formatMoney(sharedPersonal.shared, currency)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--elevated)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Personal expenses</p>
            <p className="mt-2 font-display text-2xl">{formatMoney(sharedPersonal.personal, currency)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">By category</p>
        <div className="mt-4 space-y-4">
          {byCategory.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No categorized expenses yet.</p>
          ) : (
            byCategory.map(([cat, amount]) => (
              <div key={cat}>
                <div className="flex items-center justify-between text-xs">
                  <span className="capitalize text-[var(--muted)]">{cat}</span>
                  <span className="font-medium">{formatMoney(amount, currency)}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-teal-200/70"
                    style={{ width: `${Math.max(8, (amount / maxCat) * 100)}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
