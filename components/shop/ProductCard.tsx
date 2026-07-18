"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { useCart } from "./cart";
import { PriceLockInline, PriceLockButton } from "./PriceLock";
import type { ShopProductCard } from "@/lib/storefront";

export default function ProductCard({ p }: { p: ShopProductCard }) {
  const { add, trade } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const tradePrice = trade && p.wholesalePrice ? Number(p.wholesalePrice) : null;
  const shownPrice = tradePrice ?? Number(p.price);

  function addToCart() {
    if (!p.variantNumericId) return;
    add({ variantId: `gid://shopify/ProductVariant/${p.variantNumericId}`, numericId: p.variantNumericId, title: p.title, price: shownPrice, image: p.image }, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      whileHover={{ y: -4 }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition-shadow hover:shadow-[0_12px_30px_-12px_rgba(0,0,0,0.25)]"
    >
      <Link href={`/shop/p/${p.handle}`} className="relative block aspect-square overflow-hidden bg-neutral-50">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt={p.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
        ) : <div className="flex h-full items-center justify-center text-4xl font-bold text-neutral-200">{p.title.charAt(0)}</div>}
        {p.compareAt && <span className="absolute left-3 top-3 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-neutral-900 shadow">SALE</span>}
        {!p.available && <span className="absolute right-3 top-3 rounded-full bg-neutral-900/80 px-2 py-0.5 text-xs font-semibold text-white">Sold out</span>}
      </Link>

      <div className="flex flex-1 flex-col p-3.5">
        {(p.brand || p.type) && <p className="text-[11px] font-medium uppercase tracking-wide text-amber-600">{p.brand || p.type}</p>}
        <Link href={`/shop/p/${p.handle}`} className="mt-0.5 line-clamp-2 min-h-[2.5rem] flex-1 text-sm font-medium text-neutral-900 hover:text-amber-600">{p.title}</Link>
        <div className="mt-2 flex items-baseline gap-2">
          {trade ? (
            <>
              <span className={`font-bold ${tradePrice != null ? "text-emerald-600" : "text-neutral-900"}`}>£{shownPrice.toFixed(2)}</span>
              {tradePrice != null ? (
                <span className="text-sm text-neutral-400 line-through">£{Number(p.price).toFixed(2)}</span>
              ) : p.compareAt ? (
                <span className="text-sm text-neutral-400 line-through">£{Number(p.compareAt).toFixed(2)}</span>
              ) : null}
              {tradePrice != null && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">TRADE</span>}
            </>
          ) : (
            <PriceLockInline />
          )}
        </div>

        {/* quick add — registered customers only */}
        <div className="mt-3">
          {!trade ? (
            <PriceLockButton />
          ) : p.hasOptions ? (
            <Link href={`/shop/p/${p.handle}`} className="flex w-full items-center justify-center rounded-full border border-neutral-300 py-2 text-sm font-semibold text-neutral-800 transition hover:border-neutral-900">
              Choose options →
            </Link>
          ) : p.available ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-full border border-neutral-300">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-8 w-8 items-center justify-center text-neutral-500 hover:text-neutral-900">−</button>
                <input value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} className="w-8 border-0 bg-transparent p-0 text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                <button onClick={() => setQty((q) => q + 1)} className="flex h-8 w-8 items-center justify-center text-neutral-500 hover:text-neutral-900">+</button>
              </div>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={addToCart}
                className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${added ? "bg-emerald-500 text-white" : "bg-neutral-900 text-white hover:bg-amber-500 hover:text-neutral-900"}`}
              >
                {added ? "✓ Added" : "Add"}
              </motion.button>
            </div>
          ) : (
            <button disabled className="w-full cursor-not-allowed rounded-full border border-neutral-200 py-2 text-sm font-semibold text-neutral-400">Sold out</button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
