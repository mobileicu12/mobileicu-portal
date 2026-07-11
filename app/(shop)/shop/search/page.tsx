import Link from "next/link";
import ProductCard from "@/components/shop/ProductCard";
import { searchStorefront } from "@/lib/storefront";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const results = q.trim() ? await searchStorefront(q).catch(() => []) : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900">Search</h1>
      <form action="/shop/search" method="get" className="mt-4 flex max-w-xl gap-2">
        <input name="q" defaultValue={q} placeholder="Search products, brands, SKUs…" className="flex-1 rounded-full border border-neutral-300 px-5 py-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" />
        <button className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900">Search</button>
      </form>

      {q.trim() && (
        <p className="mt-6 text-sm text-neutral-500">{results.length} result{results.length === 1 ? "" : "s"} for “{q}”</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {results.map((p) => <ProductCard key={p.id} p={p} />)}
      </div>

      {q.trim() && results.length === 0 && (
        <p className="mt-8 text-neutral-400">No products found. <Link href="/shop/collections" className="text-amber-600 hover:underline">Browse all collections →</Link></p>
      )}
    </div>
  );
}
