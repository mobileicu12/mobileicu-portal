import Link from "next/link";
import { getStorefrontCollections } from "@/lib/storefront";

export const dynamic = "force-dynamic";

export default async function CollectionsIndex() {
  const cols = (await getStorefrontCollections().catch(() => [])).filter((c) => c.count > 0);
  const top = cols.filter((c) => !c.parent || !cols.some((x) => x.id === c.parent));

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900">All collections</h1>
      <p className="mt-2 text-neutral-500">Browse everything by category.</p>

      <div className="mt-8 space-y-10">
        {top.map((c) => {
          const subs = cols.filter((s) => s.parent === c.id);
          return (
            <div key={c.id}>
              <div className="flex items-center justify-between">
                <Link href={`/shop/c/${c.handle}`} className="text-xl font-bold text-neutral-900 hover:text-amber-600">{c.title}</Link>
                <span className="text-sm text-neutral-400">{c.count} products</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <Link href={`/shop/c/${c.handle}`} className="group overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
                  <div className="aspect-square overflow-hidden">
                    {c.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                    ) : <div className="flex h-full items-center justify-center text-3xl font-bold text-neutral-200">{c.title.charAt(0)}</div>}
                  </div>
                  <p className="p-3 text-center text-sm font-semibold text-neutral-900 group-hover:text-amber-600">All {c.title}</p>
                </Link>
                {subs.map((s) => (
                  <Link key={s.id} href={`/shop/c/${s.handle}`} className="group overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
                    <div className="aspect-square overflow-hidden">
                      {s.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.image} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                      ) : <div className="flex h-full items-center justify-center text-3xl font-bold text-neutral-200">{s.title.charAt(0)}</div>}
                    </div>
                    <p className="p-3 text-center text-sm font-medium text-neutral-700 group-hover:text-amber-600">{s.title}</p>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
        {top.length === 0 && <p className="text-neutral-400">No collections yet.</p>}
      </div>
    </div>
  );
}
