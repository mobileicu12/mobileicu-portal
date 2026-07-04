"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProductRow, Location } from "@/lib/shopify";
import { CHANNELS, channelKeysFromTags } from "@/lib/channels";

const LOW_STOCK_DEFAULT = 5;

type FlatRow = {
  key: string;
  productId: string;
  productTitle: string;
  image: string | null;
  variantTitle: string;
  sku: string;
  price: string;
  inventoryItemId: string | null;
  tracked: boolean;
  status: string;
  channels: string[];
  levels: { locationId: string; locationName: string; available: number }[];
  totalAvailable: number;
};

function flatten(rows: ProductRow[]): FlatRow[] {
  const out: FlatRow[] = [];
  for (const p of rows) {
    const channels = channelKeysFromTags(p.tags ?? []);
    for (const v of p.variants) {
      out.push({
        key: v.variantId,
        productId: p.productId,
        productTitle: p.title,
        image: p.image,
        variantTitle: v.variantTitle === "Default Title" ? "" : v.variantTitle,
        sku: v.sku,
        price: v.price,
        inventoryItemId: v.inventoryItemId,
        tracked: v.tracked,
        status: p.status,
        channels,
        levels: v.levels,
        totalAvailable: v.available,
      });
    }
  }
  return out;
}

type ManualCollection = { id: string; title: string };

export default function InventoryPage() {
  const [rows, setRows] = useState<FlatRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [lowStock, setLowStock] = useState(LOW_STOCK_DEFAULT);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [channelDraft, setChannelDraft] = useState<string[]>([]);
  const [manualCols, setManualCols] = useState<ManualCollection[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string, after: string | null, append: boolean) => {
    setLoading(true);
    setError("");
    try {
      const url = new URL("/api/inventory", window.location.origin);
      if (q) url.searchParams.set("query", q);
      if (after) url.searchParams.set("after", after);
      const res = await fetch(url.toString());
      if (res.status === 503) {
        setNotConfigured(true);
        setRows([]);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load.");
      setNotConfigured(false);
      const flat = flatten(data.rows as ProductRow[]);
      setRows((prev) => (append ? [...prev, ...flat] : flat));
      setCursor(data.endCursor);
      setHasNext(data.hasNextPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/locations").then((r) => r.json()).then((d) => {
      const locs: Location[] = d.locations ?? [];
      setLocations(locs);
      if (locs[0]) setLocationId(locs[0].id);
    }).catch(() => {});
    fetch("/api/collections").then((r) => r.json()).then((d) => {
      setManualCols((d.collections ?? []).filter((c: { smart: boolean }) => !c.smart).map((c: ManualCollection) => ({ id: c.id, title: c.title })));
    }).catch(() => {});
    load("", null, false);
  }, [load]);

  function onSearch(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(value, null, false), 350);
  }

  const availableAt = useCallback((row: FlatRow): number => {
    if (!locationId) return row.totalAvailable;
    const lvl = row.levels.find((l) => l.locationId === locationId);
    return lvl ? lvl.available : 0;
  }, [locationId]);

  const stats = useMemo(() => {
    let low = 0, out = 0;
    for (const r of rows) {
      const a = availableAt(r);
      if (a <= 0) out++; else if (a <= lowStock) low++;
    }
    return { total: rows.length, low, out };
  }, [rows, lowStock, availableAt]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  function toggleRow(key: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleAll() { setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.key))); }
  function clearSelection() { setSelected(new Set()); setEditMode(false); setChannelDraft([]); }

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.key)), [rows, selected]);

  async function runBulk(action: string, extra: Record<string, unknown> = {}) {
    const productIds = Array.from(new Set(selectedRows.map((r) => r.productId)));
    if (productIds.length === 0) return;
    if (action === "delete" && !confirm(`Delete ${productIds.length} product(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    setFlash("");
    setError("");
    try {
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          productIds,
          variants: selectedRows.map((r) => ({ id: r.key, productId: r.productId })),
          inventoryItemIds: selectedRows.map((r) => r.inventoryItemId).filter(Boolean),
          locationId,
          ...extra,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Bulk action failed");
      setFlash(`Done: ${d.ok} updated${d.failed ? `, ${d.failed} failed` : ""}.`);
      clearSelection();
      load(query, null, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  }

  if (notConfigured) {
    return (
      <div className="px-8 py-7">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8">
          <h2 className="text-lg font-semibold text-ink">Connect Shopify</h2>
          <p className="mt-2 text-sm text-muted">Add your credentials, then redeploy/restart.</p>
        </div>
      </div>
    );
  }

  const inputCls = "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent";

  return (
    <div className="px-8 py-7 pb-28">
      <div className="sticky top-14 z-20 -mx-8 mb-5 border-b border-line bg-bg/90 px-8 py-3 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Inventory</h1>
            <p className="text-sm text-muted">
              {stats.total} variants · <span className="text-amber-500">{stats.low} low</span> · <span className="text-red-500">{stats.out} out</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {locations.length > 1 && (
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls}>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            <label className="flex items-center gap-2 text-sm text-muted">Low ≤
              <input type="number" value={lowStock} min={0} onChange={(e) => setLowStock(Number(e.target.value))} className={`${inputCls} w-16`} />
            </label>
            <input value={query} onChange={(e) => onSearch(e.target.value)} placeholder="Search product or SKU…" className={`${inputCls} w-64`} />
          </div>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}
      {flash && <p className="mb-4 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">{flash}</p>}

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-subtle text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 w-10"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-amber-500" /></th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Price (£)</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Channels</th>
              <th className="px-4 py-3 text-right font-medium">Available</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <StockRow
                key={row.key}
                row={row}
                available={availableAt(row)}
                locationId={locationId}
                lowStock={lowStock}
                checked={selected.has(row.key)}
                onToggle={() => toggleRow(row.key)}
                onStockSaved={(qty) => setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, levels: r.levels.map((l) => l.locationId === locationId ? { ...l, available: qty } : l) } : r))}
                onPriceSaved={(p) => setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, price: p } : r))}
              />
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No products found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex justify-center">
        {hasNext ? (
          <button onClick={() => load(query, cursor, true)} disabled={loading} className="rounded-lg border border-line px-5 py-2.5 text-sm font-medium text-ink transition hover:border-accent disabled:opacity-60">
            {loading ? "Loading…" : "Load more"}
          </button>
        ) : (loading && <p className="text-sm text-muted">Loading…</p>)}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
          {editMode && (
            <div className="mb-2 max-w-[92vw] rounded-2xl border border-line bg-surface p-3 shadow-2xl">
              <div className="flex flex-wrap items-center gap-3">
                <BulkValue label="Set price £" placeholder="9.99" onApply={(v) => runBulk("price", { value: Number(v) })} disabled={bulkBusy} />
                <BulkValue label="Set stock" placeholder="25" onApply={(v) => runBulk("stock", { value: Number(v) })} disabled={bulkBusy} />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Add to collection</span>
                  <select disabled={bulkBusy} onChange={(e) => e.target.value && runBulk("collection", { collectionId: e.target.value })} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink" defaultValue="">
                    <option value="" disabled>Choose…</option>
                    {manualCols.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <span className="text-xs font-medium text-muted">Channels →</span>
                {CHANNELS.map((c) => (
                  <label key={c.key} className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs text-ink">
                    <input type="checkbox" value={c.key} onChange={(e) => {
                      setChannelDraft((prev) => e.target.checked ? [...prev, c.key] : prev.filter((k) => k !== c.key));
                    }} className="h-3.5 w-3.5 accent-amber-500" />
                    {c.short}
                  </label>
                ))}
                <button disabled={bulkBusy || channelDraft.length === 0} onClick={() => runBulk("channels", { addChannels: channelDraft, removeChannels: [] })} className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-accentfg disabled:opacity-50">Assign</button>
                <button disabled={bulkBusy || channelDraft.length === 0} onClick={() => runBulk("channels", { addChannels: [], removeChannels: channelDraft })} className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted disabled:opacity-50">Remove</button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-full border border-line bg-ink px-4 py-2.5 text-sm text-bg shadow-2xl">
            <span className="font-medium">{selected.size} selected</span>
            <span className="h-4 w-px bg-bg/20" />
            <button disabled={bulkBusy} onClick={() => runBulk("activate")} className="rounded-full px-3 py-1 hover:bg-bg/10 disabled:opacity-50">Activate</button>
            <button disabled={bulkBusy} onClick={() => runBulk("draft")} className="rounded-full px-3 py-1 hover:bg-bg/10 disabled:opacity-50">Draft</button>
            <button disabled={bulkBusy} onClick={() => setEditMode((v) => !v)} className={`rounded-full px-3 py-1 hover:bg-bg/10 ${editMode ? "text-accent" : ""}`}>Edit values</button>
            <button disabled={bulkBusy} onClick={() => runBulk("delete")} className="rounded-full px-3 py-1 text-red-400 hover:bg-red-500/20 disabled:opacity-50">Delete</button>
            <span className="h-4 w-px bg-bg/20" />
            <button onClick={clearSelection} className="rounded-full px-2 py-1 text-bg/50 hover:text-bg">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BulkValue({ label, placeholder, onApply, disabled }: { label: string; placeholder: string; onApply: (v: string) => void; disabled: boolean }) {
  const [v, setV] = useState("");
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} type="number" step="0.01" className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink" />
      <button disabled={disabled || !v} onClick={() => { onApply(v); setV(""); }} className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-accentfg disabled:opacity-50">Apply</button>
    </div>
  );
}

function StockRow({
  row, available, locationId, lowStock, checked, onToggle, onStockSaved, onPriceSaved,
}: {
  row: FlatRow; available: number; locationId: string; lowStock: number; checked: boolean;
  onToggle: () => void; onStockSaved: (qty: number) => void; onPriceSaved: (p: string) => void;
}) {
  const [stockVal, setStockVal] = useState(String(available));
  const [stockDirty, setStockDirty] = useState(false);
  const [priceVal, setPriceVal] = useState(row.price);
  const [priceDirty, setPriceDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setStockVal(String(available)); setStockDirty(false); }, [available]);
  useEffect(() => { setPriceVal(row.price); setPriceDirty(false); }, [row.price]);

  const status = available <= 0 ? "out" : available <= lowStock ? "low" : "in";

  async function saveStock() {
    if (!row.inventoryItemId || !locationId) return;
    const qty = Math.max(0, Math.round(Number(stockVal)));
    setSaving(true);
    try {
      const res = await fetch("/api/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inventoryItemId: row.inventoryItemId, locationId, quantity: qty }) });
      if (res.ok) { onStockSaved(qty); setStockDirty(false); }
    } finally { setSaving(false); }
  }

  async function savePrice() {
    setSaving(true);
    try {
      const res = await fetch("/api/products/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "price", variants: [{ id: row.key, productId: row.productId }], value: Number(priceVal) }) });
      if (res.ok) { onPriceSaved(String(priceVal)); setPriceDirty(false); }
    } finally { setSaving(false); }
  }

  return (
    <tr className={checked ? "bg-accent/10" : "hover:bg-subtle"}>
      <td className="px-4 py-3"><input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 accent-amber-500" /></td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {row.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.image} alt="" className="h-10 w-10 rounded-md border border-line object-cover" />
          ) : <div className="h-10 w-10 rounded-md bg-subtle" />}
          <div>
            <p className="font-medium text-ink">{row.productTitle}</p>
            <p className="text-xs text-muted">
              {row.variantTitle && <span>{row.variantTitle} · </span>}
              <span className={row.status === "ACTIVE" ? "text-emerald-500" : "text-muted"}>{row.status}</span>
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-muted">{row.sku || "—"}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <input type="number" step="0.01" value={priceVal} onChange={(e) => { setPriceVal(e.target.value); setPriceDirty(true); }} className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink" />
          {priceDirty && <button onClick={savePrice} disabled={saving} className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-accentfg disabled:opacity-60">Save</button>}
        </div>
      </td>
      <td className="px-4 py-3">
        {!row.tracked ? <span className="rounded-full bg-subtle px-2.5 py-1 text-xs font-medium text-muted">Not tracked</span>
          : status === "out" ? <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-500">Out</span>
          : status === "low" ? <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-600">Low</span>
          : <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600">In stock</span>}
      </td>
      <td className="px-4 py-3">
        {row.channels.length === 0 ? (
          <span className="text-xs text-muted/60">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.channels.map((k) => {
              const c = CHANNELS.find((x) => x.key === k);
              return c ? <span key={k} className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">{c.short}</span> : null;
            })}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <input type="number" value={stockVal} disabled={!row.tracked || !row.inventoryItemId} onChange={(e) => { setStockVal(e.target.value); setStockDirty(true); }} className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-right text-sm text-ink disabled:opacity-50" />
          {stockDirty && <button onClick={saveStock} disabled={saving} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-bg disabled:opacity-60">Save</button>}
        </div>
      </td>
    </tr>
  );
}
