"use client";

import { useMemo, useState } from "react";
import ProductCard from "./ProductCard";
import type { ShopProductCard } from "@/lib/storefront";

type Sort = "featured" | "price-asc" | "price-desc" | "title";

function facet(products: ShopProductCard[], pick: (p: ShopProductCard) => string[]) {
  const m = new Map<string, number>();
  for (const p of products) for (const v of pick(p)) { if (!v) continue; m.set(v, (m.get(v) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export default function CollectionBrowser({ products }: { products: ShopProductCard[] }) {
  const [sort, setSort] = useState<Sort>("featured");
  const [brands, setBrands] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [models, setModels] = useState<Set<string>>(new Set());
  const [inStock, setInStock] = useState(false);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [mobileFilters, setMobileFilters] = useState(false);

  const brandFacet = useMemo(() => facet(products, (p) => [p.brand]), [products]);
  const typeFacet = useMemo(() => facet(products, (p) => [p.type]), [products]);
  const modelFacet = useMemo(() => facet(products, (p) => p.models), [products]);
  const priceCeil = useMemo(() => Math.ceil(Math.max(1, ...products.map((p) => Number(p.price) || 0))), [products]);

  const filtered = useMemo(() => {
    let out = products.filter((p) => {
      if (inStock && !p.available) return false;
      if (brands.size && !brands.has(p.brand)) return false;
      if (types.size && !types.has(p.type)) return false;
      if (models.size && !p.models.some((m) => models.has(m))) return false;
      if (maxPrice != null && Number(p.price) > maxPrice) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "price-asc") return Number(a.price) - Number(b.price);
      if (sort === "price-desc") return Number(b.price) - Number(a.price);
      if (sort === "title") return a.title.localeCompare(b.title);
      return 0;
    });
    return out;
  }, [products, brands, types, models, inStock, maxPrice, sort]);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); setter(n);
  };
  const activeCount = brands.size + types.size + models.size + (inStock ? 1 : 0) + (maxPrice != null ? 1 : 0);
  function clearAll() { setBrands(new Set()); setTypes(new Set()); setModels(new Set()); setInStock(false); setMaxPrice(null); }

  const FilterPanel = (
    <div className="space-y-6">
      {typeFacet.length > 1 && (
        <FacetGroup title="Part type">
          {typeFacet.map(([v, n]) => <Check key={v} label={v} n={n} checked={types.has(v)} onChange={() => toggle(types, setTypes, v)} />)}
        </FacetGroup>
      )}
      {brandFacet.length > 1 && (
        <FacetGroup title="Brand">
          {brandFacet.slice(0, 40).map(([v, n]) => <Check key={v} label={v} n={n} checked={brands.has(v)} onChange={() => toggle(brands, setBrands, v)} />)}
        </FacetGroup>
      )}
      {modelFacet.length > 1 && modelFacet.length <= 60 && (
        <FacetGroup title="Model">
          {modelFacet.slice(0, 60).map(([v, n]) => <Check key={v} label={v} n={n} checked={models.has(v)} onChange={() => toggle(models, setModels, v)} />)}
        </FacetGroup>
      )}
      <FacetGroup title="Price">
        <input type="range" min={0} max={priceCeil} value={maxPrice ?? priceCeil} onChange={(e) => setMaxPrice(Number(e.target.value))} className="w-full accent-amber-500" />
        <p className="text-xs text-neutral-500">Up to <span className="font-semibold text-neutral-900">£{(maxPrice ?? priceCeil).toFixed(0)}</span></p>
      </FacetGroup>
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="h-4 w-4 accent-amber-500" /> In stock only
      </label>
      {activeCount > 0 && <button onClick={clearAll} className="text-sm font-medium text-amber-600 hover:underline">Clear all filters</button>}
    </div>
  );

  return (
    <div>
      {/* toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setMobileFilters((v) => !v)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 lg:hidden">Filters{activeCount ? ` (${activeCount})` : ""}</button>
          <span className="text-sm text-neutral-500">{filtered.length} product{filtered.length === 1 ? "" : "s"}</span>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-500">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">
            <option value="featured">Featured</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="title">Name: A–Z</option>
          </select>
        </label>
      </div>

      <div className="flex gap-8">
        {/* desktop filters column */}
        <div className="hidden w-52 shrink-0 lg:block">{FilterPanel}</div>

        {/* mobile filters drawer */}
        {mobileFilters && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileFilters(false)} />
            <div className="relative ml-auto h-full w-80 max-w-[85vw] overflow-y-auto bg-white p-5">
              <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">Filters</h3><button onClick={() => setMobileFilters(false)}>✕</button></div>
              {FilterPanel}
            </div>
          </div>
        )}

        {/* grid */}
        <div className="flex-1">
          {filtered.length === 0 ? (
            <p className="py-16 text-center text-neutral-400">No products match these filters.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-neutral-900">{title}</p>
      <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">{children}</div>
    </div>
  );
}

function Check({ label, n, checked, onChange }: { label: string; n: number; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-neutral-600 hover:text-neutral-900">
      <span className="flex items-center gap-2">
        <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-amber-500" />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-xs text-neutral-400">{n}</span>
    </label>
  );
}
