export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-10">
      <div className="h-64 animate-pulse rounded-[2rem] bg-[var(--elevated)]" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-28 animate-pulse rounded-3xl bg-[var(--elevated)]" />
        <div className="h-28 animate-pulse rounded-3xl bg-[var(--elevated)]" />
        <div className="h-28 animate-pulse rounded-3xl bg-[var(--elevated)]" />
      </div>
    </div>
  );
}
