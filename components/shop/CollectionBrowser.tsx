"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ProductCard from "./ProductCard";
import { CategoryNav } from "./CategorySidebar";
import { useCart } from "./cart";
import type { ShopProductCard, ShopCollectionCard } from "@/lib/storefront";

type Sort = "featured" | "price-asc" | "price-desc" | "title";

function facet(products: ShopProductCard[], pick: (p: ShopProductCard) => string[]) {
  const m = new Map<string, number>();
  for (const p of products) for (const v of pick(p)) { if (!v) continue; m.set(v, (m.get(v) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export default function CollectionBrowser({
  products,
  collections,
  activeHandle = "",
}: {
  products: ShopProductCard[];
  collections?: ShopCollectionCard[];
  activeHandle?: string;
}) {
  const { trade } = useCart();
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

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); setter(n); };
  const activeCount = brands.size + types.size + models.size + (inStock ? 1 : 0) + (maxPrice != null ? 1 : 0);
  function clearAll() { setBrands(new Set()); setTypes(new Set()); setModels(new Set()); setInStock(false); setMaxPrice(null); }

  const chips: { label: string; onRemove: () => void }[] = [
    ...[...types].map((v) => ({ label: v, onRemove: () => toggle(types, setTypes, v) })),
    ...[...brands].map((v) => ({ label: v, onRemove: () => toggle(brands, setBrands, v) })),
    ...[...models].map((v) => ({ label: v, onRemove: () => toggle(models, setModels, v) })),
    ...(inStock ? [{ label: "In stock", onRemove: () => setInStock(false) }] : []),
    ...(maxPrice != null ? [{ label: `≤ £${maxPrice}`, onRemove: () => setMaxPrice(null) }] : []),
  ];

  // The filter controls (reused in the desktop rail + mobile drawer).
  const FilterPanel = (
    <div className="space-y-1">
      {typeFacet.length > 1 && (
        <FacetGroup title="Part type" count={types.size} defaultOpen>
          <FacetList items={typeFacet} selected={types} onToggle={(v) => toggle(types, setTypes, v)} />
        </FacetGroup>
      )}
      {brandFacet.length > 1 && (
        <FacetGroup title="Brand" count={brands.size} defaultOpen>
          <FacetList items={brandFacet} selected={brands} onToggle={(v) => toggle(brands, setBrands, v)} />
        </FacetGroup>
      )}
      {modelFacet.length > 1 && (
        <FacetGroup title="Model" count={models.size}>
          <FacetList items={modelFacet} selected={models} onToggle={(v) => toggle(models, setModels, v)} />
        </FacetGroup>
      )}
      {trade && (
        <FacetGroup title="Price" defaultOpen>
          <input type="range" min={0} max={priceCeil} value={maxPrice ?? priceCeil} onChange={(e) => setMaxPrice(Number(e.target.value))} className="w-full accent-amber-500" />
          <div className="flex justify-between text-xs text-neutral-500"><span>£0</span><span className="font-semibold text-neutral-900">Up to £{(maxPrice ?? priceCeil).toFixed(0)}</span></div>
        </FacetGroup>
      )}
      <label className="flex cursor-pointer items-center gap-2 border-t border-neutral-100 px-1 py-2.5 text-sm text-neutral-700">
        <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="h-4 w-4 accent-amber-500" /> In stock only
      </label>
    </div>
  );

  return (
    <div>
      {/* toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setMobileFilters(true)} className="flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-medium text-neutral-700 lg:hidden">
            <span>⚙</span> Filters{activeCount ? <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">{activeCount}</span> : null}
          </button>
          <span className="text-sm text-neutral-500"><span className="font-semibold text-neutral-900">{filtered.length}</span> products</span>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="hidden text-neutral-500 sm:inline">Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-medium outline-none focus:border-amber-500">
            <option value="featured">Featured</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="title">Name: A–Z</option>
          </select>
        </label>
      </div>

      {/* active chips */}
      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <AnimatePresence>
            {chips.map((c) => (
              <motion.button key={c.label} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                onClick={c.onRemove} className="flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200">
                {c.label} <span className="text-amber-500">✕</span>
              </motion.button>
            ))}
          </AnimatePresence>
          <button onClick={clearAll} className="text-xs font-semibold text-neutral-500 hover:text-amber-600">Clear all</button>
        </div>
      )}

      <div className="flex gap-8">
        {/* Unified left rail: categories + filters, one sticky scroll column */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-24 flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {collections && collections.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-neutral-400">Categories</p>
                  <CategoryNav collections={collections} active={activeHandle} />
                </div>
              )}
              <div className="mb-1 flex items-center justify-between border-t border-neutral-100 pt-3">
                <p className="px-1 text-xs font-bold uppercase tracking-wider text-neutral-400">Filter</p>
                {activeCount > 0 && <button onClick={clearAll} className="text-xs font-semibold text-amber-600 hover:underline">Clear ({activeCount})</button>}
              </div>
              {FilterPanel}
            </div>
          </div>
        </aside>

        {/* mobile filters drawer (categories + filters) */}
        <AnimatePresence>
          {mobileFilters && (
            <div className="fixed inset-0 z-50 flex lg:hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40" onClick={() => setMobileFilters(false)} />
              <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "tween", duration: 0.28 }} className="relative ml-auto flex h-full w-80 max-w-[85vw] flex-col bg-white">
                <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
                  <h3 className="text-lg font-semibold">Filters{activeCount ? ` · ${activeCount}` : ""}</h3>
                  <div className="flex items-center gap-3">
                    {activeCount > 0 && <button onClick={clearAll} className="text-xs font-semibold text-amber-600">Clear</button>}
                    <button onClick={() => setMobileFilters(false)} className="text-xl text-neutral-400">✕</button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  {collections && collections.length > 0 && (
                    <div className="mb-4">
                      <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-neutral-400">Categories</p>
                      <CategoryNav collections={collections} active={activeHandle} />
                      <div className="mt-3 border-t border-neutral-100" />
                    </div>
                  )}
                  {FilterPanel}
                </div>
                <div className="border-t border-neutral-200 p-4">
                  <button onClick={() => setMobileFilters(false)} className="w-full rounded-full bg-neutral-900 py-3 text-sm font-semibold text-white">Show {filtered.length} products</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* grid */}
        <div className="min-w-0 flex-1">
          {filtered.length === 0 ? (
            <p className="py-16 text-center text-neutral-400">No products match these filters. <button onClick={clearAll} className="text-amber-600 hover:underline">Clear filters</button></p>
          ) : (
            <motion.div layout className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p) => <ProductCard key={p.id} p={p} />)}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function FacetGroup({ title, children, count = 0, defaultOpen = false }: { title: string; children: React.ReactNode; count?: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-neutral-100 first:border-t-0">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between py-2.5 text-sm font-semibold text-neutral-900">
        <span className="flex items-center gap-2">{title}{count > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">{count}</span>}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-xs text-neutral-400">▾</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: "easeInOut" }} className="overflow-hidden">
            <div className="pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// A searchable, show-more checkbox list with its own internal scroll for long lists.
function FacetList({ items, selected, onToggle }: { items: [string, number][]; selected: Set<string>; onToggle: (v: string) => void }) {
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const searchable = items.length > 8;
  const matches = q ? items.filter(([v]) => v.toLowerCase().includes(q.toLowerCase())) : items;
  const LIMIT = 8;
  const shown = showAll || q ? matches : matches.slice(0, LIMIT);

  return (
    <div>
      {searchable && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search… (${items.length})`}
          className="mb-2 w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs outline-none focus:border-amber-500"
        />
      )}
      <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
        {shown.map(([v, n]) => <Check key={v} label={v} n={n} checked={selected.has(v)} onChange={() => onToggle(v)} />)}
        {shown.length === 0 && <p className="px-1 py-2 text-xs text-neutral-400">No matches.</p>}
      </div>
      {!q && matches.length > LIMIT && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-1 px-1 text-xs font-semibold text-amber-600 hover:underline">
          {showAll ? "Show less" : `Show all ${matches.length}`}
        </button>
      )}
    </div>
  );
}

function Check({ label, n, checked, onChange }: { label: string; n: number; checked: boolean; onChange: () => void }) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm transition ${checked ? "bg-amber-50 text-amber-800" : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"}`}>
      <span className="flex min-w-0 items-center gap-2">
        <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 shrink-0 accent-amber-500" />
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 text-xs text-neutral-400">{n}</span>
    </label>
  );
}
