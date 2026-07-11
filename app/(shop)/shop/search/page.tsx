import Link from "next/link";
import CategorySidebar from "@/components/shop/CategorySidebar";
import CollectionBrowser from "@/components/shop/CollectionBrowser";
import { searchStorefront, getStorefrontCollections } from "@/lib/storefront";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const [results, allCols] = await Promise.all([
    q.trim() ? searchStorefront(q, 60).catch(() => []) : Promise.resolve([]),
    getStorefrontCollections().catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900">Search</h1>
      <form action="/shop/search" method="get" className="mt-4 flex max-w-xl gap-2">
        <input name="q" defaultValue={q} placeholder="Search products, brands, models…" className="flex-1 rounded-full border border-neutral-300 px-5 py-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" />
        <button className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900">Search</button>
      </form>

      {q.trim() && <p className="mt-6 text-sm text-neutral-500">Results for “{q}”</p>}

      <div className="mt-6 flex gap-8">
        <CategorySidebar collections={allCols} active="" />
        <div className="min-w-0 flex-1">
          {q.trim() ? (
            results.length ? <CollectionBrowser products={results} /> : <p className="py-16 text-center text-neutral-400">No products found. <Link href="/shop/collections" className="text-amber-600 hover:underline">Browse all →</Link></p>
          ) : <p className="py-16 text-center text-neutral-400">Type above to search the catalogue.</p>}
        </div>
      </div>
    </div>
  );
}
