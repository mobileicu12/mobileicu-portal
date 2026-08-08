// Route-level loading boundary for the whole portal.
//
// Without this file the App Router has nothing to show while the next route's
// payload is in flight, so a click updated the URL but left the old screen on
// screen — which reads as "the portal is frozen" and makes people click twice.
// A Suspense fallback lets the navigation commit immediately.
export default function PortalLoading() {
  return (
    <div className="px-8 py-7" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* page title */}
      <div className="mb-6 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
      </div>

      {/* stat row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="h-3 w-20 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            <div className="mt-3 h-8 w-16 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
          </div>
        ))}
      </div>

      {/* content block */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {Array.from({ length: 6 }).map((_, i) => (
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
    </div>
  );
}
