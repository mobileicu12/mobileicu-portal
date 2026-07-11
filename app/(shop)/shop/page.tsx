import Link from "next/link";
import ProductCard from "@/components/shop/ProductCard";
import { getFeaturedProducts, getStorefrontCollections } from "@/lib/storefront";

export const dynamic = "force-dynamic";

export default async function ShopHome() {
  const [products, cols] = await Promise.all([
    getFeaturedProducts(8).catch(() => []),
    getStorefrontCollections().catch(() => []),
  ]);
  const top = cols.filter((c) => (!c.parent || !cols.some((x) => x.id === c.parent)) && c.count > 0).slice(0, 8);

  return (
    <div>
      {/* Hero */}
      <section className="border-b border-neutral-200 bg-gradient-to-b from-neutral-50 to-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Wholesale · Trade accounts welcome</span>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-neutral-900 sm:text-5xl">
              Phone &amp; laptop parts at <span className="text-amber-500">genuine wholesale</span> prices.
            </h1>
            <p className="mt-4 text-lg text-neutral-600">Cases, cables, chargers, batteries, repair parts and more — thousands of lines, dispatched fast.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/shop/collections" className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900">Shop all</Link>
              <Link href="/shop/search" className="rounded-full border border-neutral-300 px-6 py-3 text-sm font-semibold text-neutral-700 transition hover:border-neutral-900">Search products</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      {top.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Shop by category</h2>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {top.map((c) => (
              <Link key={c.id} href={`/shop/c/${c.handle}`} className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
                <div className="aspect-[4/3] overflow-hidden">
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt={c.title} className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : <div className="flex h-full items-center justify-center text-4xl font-bold text-neutral-200">{c.title.charAt(0)}</div>}
                </div>
                <div className="flex items-center justify-between p-4">
                  <span className="font-semibold text-neutral-900 group-hover:text-amber-600">{c.title}</span>
                  <span className="text-xs text-neutral-400">{c.count}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured products */}
      {products.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900">New &amp; popular</h2>
            <Link href="/shop/collections" className="text-sm font-medium text-amber-600 hover:underline">View all →</Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}
