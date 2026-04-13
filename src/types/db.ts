import { EXPENSE_CATEGORIES } from "@/lib/constants";
import type { TripDestination } from "@/lib/trip-destinations";

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type { TripDestination };

export type TripRow = {
  id: string;
  name: string;
  /** Kept in sync with the first entry in `destinations` for search and legacy queries. */
  destination_city: string;
  destination_country: string;
  /** Ordered stops: multiple cities (and countries) on one trip. */
  destinations?: TripDestination[] | null;
  start_date: string;
  end_date: string;
  traveler_count: number;
  cover_image_path: string | null;
  notes: string | null;
  budget_amount: number | null;
  budget_currency: string;
  archived_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TripDayRow = {
  id: string;
  trip_id: string;
  day_date: string;
  day_number: number;
  title: string | null;
  summary: string | null;
  location: string | null;
  notes: string | null;
};

export type TimeBlockRow = {
  id: string;
  trip_day_id: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  details: string | null;
  sort_order: number;
};

export type ActivityRow = {
  id: string;
  trip_day_id: string;
  title: string;
  details: string | null;
  url: string | null;
  link_preview_id: string | null;
  preview_title: string | null;
  preview_image_url: string | null;
  preview_description: string | null;
  sort_order: number;
};

export type FlightRow = {
  id: string;
  trip_id: string;
  airline: string;
  flight_number: string | null;
  departure_airport: string;
  arrival_airport: string;
  departure_at: string;
  arrival_at: string;
  seat_class: string | null;
  booking_reference: string | null;
  amount: number;
  currency: string;
  notes: string | null;
};

export type AccommodationRow = {
  id: string;
  trip_id: string;
  name: string;
  accommodation_type: string;
  address: string | null;
  check_in: string;
  check_out: string;
  confirmation_number: string | null;
  room_type: string | null;
  booking_url: string | null;
  link_preview_id: string | null;
  preview_title: string | null;
  preview_image_url: string | null;
  preview_description: string | null;
  amount: number;
  currency: string;
  notes: string | null;
};

export type ExpenseRow = {
  id: string;
  trip_id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  expense_date: string;
  paid_by: string | null;
  split_count: number;
  is_shared: boolean;
  notes: string | null;
};

export type PhotoRow = {
  id: string;
  trip_id: string;
  trip_day_id: string | null;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  created_at?: string;
};

export type LinkPreviewRow = {
  id: string;
  url: string;
  canonical_url: string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  fetched_at: string;
  raw_metadata: Record<string, unknown>;
};

export type TripWithCosts = TripRow & {
  flights: Pick<FlightRow, "id" | "amount" | "currency">[];
  accommodations: Pick<AccommodationRow, "id" | "amount" | "currency">[];
  expenses: Pick<ExpenseRow, "id" | "amount" | "currency" | "category" | "is_shared">[];
};
