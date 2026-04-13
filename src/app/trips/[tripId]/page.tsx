import { Suspense } from "react";
import { TripWorkspace } from "@/components/trip/TripWorkspace";

export default function TripPage({ params }: { params: { tripId: string } }) {
  return (
    <Suspense
      fallback={<div className="h-64 animate-pulse rounded-3xl bg-[var(--elevated)]" />}
    >
      <TripWorkspace tripId={params.tripId} />
    </Suspense>
  );
}
