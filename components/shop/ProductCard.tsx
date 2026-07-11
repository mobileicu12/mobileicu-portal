import Link from "next/link";
import type { ShopProductCard } from "@/lib/storefront";

export default function ProductCard({ p }: { p: ShopProductCard }) {
  return (
    <Link href={`/shop/p/${p.handle}`} className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative aspect-square overflow-hidden bg-neutral-50">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt={p.title} className="h-full w-full object-cover transition group-hover:scale-105" />
        ) : <div className="flex h-full items-center justify-center text-4xl font-bold text-neutral-200">{p.title.charAt(0)}</div>}
        {p.compareAt && <span className="absolute left-3 top-3 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-neutral-900">SALE</span>}
        {!p.available && <span className="absolute right-3 top-3 rounded-full bg-neutral-900/80 px-2 py-0.5 text-xs font-semibold text-white">Sold out</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        {p.vendor && <p className="text-xs uppercase tracking-wide text-neutral-400">{p.vendor}</p>}
        <p className="mt-0.5 line-clamp-2 flex-1 text-sm font-medium text-neutral-900 group-hover:text-amber-600">{p.title}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-semibold text-neutral-900">£{Number(p.price).toFixed(2)}</span>
          {p.compareAt && <span className="text-sm text-neutral-400 line-through">£{Number(p.compareAt).toFixed(2)}</span>}
        </div>
      </div>
    </Link>
  );
}
