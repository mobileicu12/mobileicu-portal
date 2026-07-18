import Link from "next/link";
import { getStorefrontCollections, type ShopCollectionCard } from "@/lib/storefront";

export const dynamic = "force-dynamic";

export default async function CollectionsIndex() {
  const cols = (await getStorefrontCollections().catch(() => [])).filter((c) => c.count > 0);
  const top = cols
    .filter((c) => !c.parent || !cols.some((x) => x.id === c.parent))
    .sort((a, b) => b.count - a.count);
  const totalProducts = cols.reduce((s, c) => s + c.count, 0);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-neutral-900 text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Browse the range</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">Shop by category</h1>
          <p className="mt-3 max-w-xl text-neutral-300">
            Phone &amp; laptop parts and accessories, organised by device and part type. {top.length} categories · {totalProducts.toLocaleString()} products.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/shop/all" className="rounded-full bg-amber-500 px-6 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-amber-400">Shop all products →</Link>
            <Link href="/shop/search" className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">Search</Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        {top.length === 0 && <p className="text-neutral-400">No collections yet.</p>}

        <div className="space-y-14">
          {top.map((c) => {
            const subs = cols.filter((s) => s.parent === c.id).sort((a, b) => b.count - a.count);
            return (
              <section key={c.id}>
                <div className="flex items-end justify-between gap-4 border-b border-neutral-200 pb-3">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-neutral-900">{c.title}</h2>
                    <p className="mt-0.5 text-sm text-neutral-400">{c.count.toLocaleString()} products{subs.length ? ` · ${subs.length} sub-categories` : ""}</p>
                  </div>
                  <Link href={`/shop/c/${c.handle}`} className="shrink-0 whitespace-nowrap text-sm font-semibold text-amber-600 hover:text-amber-700">View all →</Link>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                  <Tile col={c} featured label={`All ${c.title}`} />
                  {subs.map((s) => <Tile key={s.id} col={s} />)}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Tile({ col, featured = false, label }: { col: ShopCollectionCard; featured?: boolean; label?: string }) {
  return (
    <Link
      href={`/shop/c/${col.handle}`}
      className="group relative block overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 shadow-sm transition hover:-translate-y-1 hover:shadow-[0_16px_40px_-16px_rgba(0,0,0,0.35)]"
    >
      <div className="aspect-square overflow-hidden">
        {col.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={col.image} alt={col.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
        ) : (
          <div className={`flex h-full items-center justify-center text-4xl font-extrabold ${featured ? "bg-neutral-900 text-amber-400" : "bg-neutral-200 text-neutral-400"}`}>
            {col.title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      {/* gradient + label overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="line-clamp-2 text-sm font-bold text-white drop-shadow-sm">{label ?? col.title}</p>
        <span className="mt-1 inline-block rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-neutral-800">{col.count} items</span>
      </div>
      {featured && <span className="absolute left-3 top-3 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-900 shadow">Shop all</span>}
    </Link>
  );
}
