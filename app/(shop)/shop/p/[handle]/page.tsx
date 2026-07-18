import Link from "next/link";
import { notFound } from "next/navigation";
import AddToCart from "@/components/shop/AddToCart";
import ProductGallery from "@/components/shop/ProductGallery";
import { PriceLockInline } from "@/components/shop/PriceLock";
import { getStorefrontProduct } from "@/lib/storefront";
import { getTradeCustomerId } from "@/lib/trade";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const [p, tradeId] = await Promise.all([getStorefrontProduct(handle).catch(() => null), getTradeCustomerId()]);
  if (!p) notFound();
  const tradePrice = tradeId && p.wholesalePrice ? Number(p.wholesalePrice) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav className="text-sm text-neutral-400">
        <Link href="/shop" className="hover:text-amber-600">Home</Link> <span className="mx-1">/</span>
        <span className="text-neutral-600">{p.title}</span>
      </nav>

      <div className="mt-4 grid gap-10 lg:grid-cols-2">
        <ProductGallery images={p.images} title={p.title} />

        <div>
          {p.vendor && <p className="text-sm uppercase tracking-wide text-neutral-400">{p.vendor}</p>}
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-neutral-900">{p.title}</h1>
          <div className="mt-3 flex items-baseline gap-3">
            {tradeId ? (
              <>
                <span className={`text-2xl font-bold ${tradePrice != null ? "text-emerald-600" : "text-neutral-900"}`}>£{(tradePrice ?? Number(p.price)).toFixed(2)}</span>
                {tradePrice != null ? (
                  <>
                    <span className="text-lg text-neutral-400 line-through">£{Number(p.price).toFixed(2)}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">TRADE PRICE</span>
                  </>
                ) : p.compareAt ? (
                  <>
                    <span className="text-lg text-neutral-400 line-through">£{Number(p.compareAt).toFixed(2)}</span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">SALE</span>
                  </>
                ) : null}
              </>
            ) : (
              <PriceLockInline className="text-sm" />
            )}
          </div>
          <p className={`mt-2 text-sm font-medium ${p.available ? "text-emerald-600" : "text-red-600"}`}>{p.available ? "In stock" : "Currently unavailable"}</p>

          <div className="mt-6">
            <AddToCart product={p} />
          </div>

          <p className="mt-3 text-xs text-neutral-400">Secure checkout powered by Shopify · trade accounts see wholesale pricing once logged in.</p>

          {p.descriptionHtml && (
            <div className="prose prose-sm mt-8 max-w-none border-t border-neutral-200 pt-6 text-neutral-600 [&_a]:text-amber-600 [&_img]:rounded-lg [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: p.descriptionHtml }} />
          )}
        </div>
      </div>
    </div>
  );
}
