import {
  differenceInCalendarDays,
  endOfDay,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
} from "date-fns";

export type TripPhase = "upcoming" | "active" | "completed";

export function tripPhase(startDate: string, endDate: string, now = new Date()): TripPhase {
  const start = startOfDay(parseISO(startDate));
  const end = endOfDay(parseISO(endDate));
  if (isBefore(now, start)) return "upcoming";
  if (isAfter(now, end)) return "completed";
  return "active";
}

export function tripDayCount(startDate: string, endDate: string): number {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  return differenceInCalendarDays(end, start) + 1;
}

export function formatDateRange(startDate: string, endDate: string) {
  const s = parseISO(startDate);
  const e = parseISO(endDate);
  if (s.getFullYear() === e.getFullYear()) {
    if (s.getMonth() === e.getMonth()) {
      return `${format(s, "MMM d")}–${format(e, "d, yyyy")}`;
    }
    return `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;
  }
  return `${format(s, "MMM d, yyyy")} – ${format(e, "MMM d, yyyy")}`;
}

export function sumAmounts(
  rows: { amount: number | null; currency: string | null }[],
  preferredCurrency = "USD"
): { total: number; currency: string } {
  let total = 0;
  let currency = preferredCurrency;
  for (const r of rows) {
    if (r.currency && r.currency !== currency) {
      currency = r.currency;
    }
    total += Number(r.amount ?? 0);
  }
  return { total, currency };
}
