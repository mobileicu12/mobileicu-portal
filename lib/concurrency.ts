// Run an async mapper over a list a few items at a time.
//
// Several report endpoints used to `await` one Shopify call per invoice inside a
// loop, so a customer with 20 bills meant 20 sequential round trips. Running a
// small number in parallel cuts the wall-clock time by roughly the pool size.
// The pool is kept deliberately small: Shopify's GraphQL API is cost-throttled,
// and firing everything at once trades a slow response for a 429.
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const size = Math.max(1, Math.min(limit, items.length));
  const out = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: size }, worker));
  return out;
}
