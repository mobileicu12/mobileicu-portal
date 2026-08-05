// Run an async mapper over items with a bounded number of concurrent workers.
// Preserves input order in the results. Used to speed up Shopify N+1 loops
// (e.g. fetching many invoice details) without firing hundreds of requests at
// once — a small limit keeps us well under Shopify's cost-based rate limit while
// still being far faster than awaiting one-by-one.
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await mapper(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
