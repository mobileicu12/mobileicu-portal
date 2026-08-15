// Placeholder shown while a route's payload is still in flight.
//
// The portal already has a boundary at app/(app)/loading.tsx, but that one sits
// on the shared layout: once the portal is on screen, that boundary is already
// mounted, so React keeps the previous page visible instead of showing its
// fallback. Moving between two portal pages therefore blocked on the server —
// the click appeared to do nothing until the payload landed, which is what made
// the portal feel frozen and had people clicking twice.
//
// A loading.tsx inside each dynamic segment adds a NEW boundary for that
// navigation, so the router can commit straight away and paint this instead.
export default function RouteSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="px-8 py-7" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="mb-6 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div className="h-7 w-56 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-neutral-100 px-5 py-4 last:border-0 dark:border-neutral-800">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-1/3 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                <div className="mt-2 h-3 w-1/5 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
              </div>
              <div className="h-4 w-16 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="h-3 w-24 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
              <div className="mt-3 h-7 w-20 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
