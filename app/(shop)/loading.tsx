// Route-level loading boundary for the storefront. Every shop page is
// force-dynamic and fetches its catalog from Shopify on the server, so without
// a fallback a link click left the previous page frozen on screen until the
// data came back.
export default function ShopLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-9 w-64 animate-pulse rounded-lg bg-neutral-200" />
      <div className="mt-3 h-4 w-80 animate-pulse rounded bg-neutral-100" />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-neutral-200">
            <div className="aspect-square animate-pulse bg-neutral-100" />
            <div className="p-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-200" />
              <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-neutral-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
