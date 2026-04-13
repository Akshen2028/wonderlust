export const STORAGE_BUCKETS = {
  covers: "trip-covers",
  dayPhotos: "trip-day-photos",
} as const;

export const ACCESS_STORAGE_KEY = "wonderlust-access-mode";
export const THEME_STORAGE_KEY = "wonderlust-theme";

export type TripTab =
  | "overview"
  | "itinerary"
  | "flights"
  | "hotels"
  | "expenses"
  | "photos"
  | "notes";

export const EXPENSE_CATEGORIES = [
  "food",
  "transport",
  "attractions",
  "shopping",
  "visas",
  "insurance",
  "misc",
] as const;
