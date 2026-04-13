export type TripDestination = {
  city: string;
  country: string;
};

function isStop(x: unknown): x is TripDestination {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.city === "string" && typeof o.country === "string";
}

/** Normalize DB jsonb + legacy single city/country columns. */
export function parseTripDestinations(trip: {
  destinations?: unknown;
  destination_city: string;
  destination_country: string;
}): TripDestination[] {
  const raw = trip.destinations;
  if (Array.isArray(raw)) {
    const out = raw.filter(isStop).map((s) => ({ city: s.city.trim(), country: s.country.trim() }));
    if (out.length > 0) return out;
  }
  return [
    {
      city: trip.destination_city?.trim() ?? "",
      country: trip.destination_country?.trim() ?? "",
    },
  ];
}

/** Short label for cards: "Kyoto · Osaka, Japan" when one country; else "City, Country — …". */
export function formatTripDestinationsLabel(stops: TripDestination[]): string {
  const cleaned = stops.filter((s) => s.city && s.country);
  if (cleaned.length === 0) return "Destination";
  if (cleaned.length === 1) {
    return `${cleaned[0].city}, ${cleaned[0].country}`;
  }
  const countries = new Set(cleaned.map((s) => s.country));
  if (countries.size === 1) {
    const country = cleaned[0].country;
    return `${cleaned.map((s) => s.city).join(" · ")}, ${country}`;
  }
  return cleaned.map((s) => `${s.city}, ${s.country}`).join(" — ");
}

/** First city (for hero image fallback, etc.). */
export function primaryTripCity(stops: TripDestination[]): string {
  const first = stops.find((s) => s.city);
  return first?.city ?? "Travel";
}
