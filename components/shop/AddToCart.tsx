"use client";

import { useState } from "react";
import { useCart } from "./cart";
import { PriceLockPanel } from "./PriceLock";
import type { ShopProduct } from "@/lib/storefront";

export default function AddToCart({ product }: { product: ShopProduct }) {
  const { add, trade } = useCart();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const [qty, setQty] = useState(1);

  // Non-registered visitors can't see prices or buy.
  if (!trade) return <PriceLockPanel />;

  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const hasVariants = product.variants.length > 1;

  if (!variant) return <p className="text-sm text-neutral-500">Unavailable.</p>;
  const tradePrice = trade && product.wholesalePrice ? Number(product.wholesalePrice) : null;
  const unitPrice = tradePrice ?? Number(variant.price);

  return (
    <div>
      {hasVariants && (
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Option</span>
          <select value={variantId} onChange={(e) => setVariantId(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm">
            {product.variants.map((v) => (
              <option key={v.id} value={v.id} disabled={!v.available}>
                {v.title || v.options.map((o) => o.value).join(" / ")} — £{Number(v.price).toFixed(2)}{v.available ? "" : " (sold out)"}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex items-center gap-3">
        <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} className="w-20 rounded-lg border border-neutral-300 px-3 py-3 text-center text-sm" />
        <button
          onClick={() => add({ variantId: variant.id, numericId: variant.numericId, title: product.title + (variant.title ? ` — ${variant.title}` : ""), price: unitPrice, image: product.images[0] ?? null }, qty)}
          disabled={!variant.available}
          className="flex-1 rounded-full bg-neutral-900 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {variant.available ? "Add to cart" : "Sold out"}
        </button>
      </div>
    </div>
  );
}
