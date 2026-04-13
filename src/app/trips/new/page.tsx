"use client";

import { useAccessMode } from "@/lib/access-mode";
import { TripForm } from "@/components/trip/TripForm";
import Link from "next/link";

export default function NewTripPage() {
  const { isAdmin } = useAccessMode();

  if (!isAdmin) {
    return (
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-10 text-center">
        <p className="text-sm text-[var(--muted)]">Switch to editor mode to create a trip.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-semibold text-[var(--accent)]">
          Back home
        </Link>
      </div>
    );
  }

  return <TripForm mode="create" />;
}
