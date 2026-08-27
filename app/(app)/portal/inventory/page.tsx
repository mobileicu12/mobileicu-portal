"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ProductRow, Location } from "@/lib/shopify";
import { CHANNELS, channelKeysFromTags } from "@/lib/channels";
import type { TierPrices } from "@/lib/pricing";
import { printBarcodeLabels, LABEL_PRESETS, type LabelPresetKey } from "@/lib/barcode-labels";
import ColumnChooser, { useColumns, type ColumnDef } from "@/components/ColumnChooser";
import { loadPortalSettings } from "@/lib/settings-client";
import { DuplicatesModal, MergeModal } from "@/components/MergeTools";
import Pagination, { usePaging } from "@/components/Pagination";

const LOW_STOCK_DEFAULT = 5;

const STOCK_COLUMNS: ColumnDef[] = [
  { key: "product", label: "Product", locked: true },
  { key: "sku", label: "SKU" },
  { key: "price", label: "Price (online)" },
  { key: "wholesale", label: "Wholesale £" },
  { key: "shop", label: "Shop £" },
  { key: "ebay", label: "eBay £" },
  { key: "amazon", label: "Amazon £" },
  { key: "status", label: "Stock status" },
  { key: "channels", label: "Channels" },
  { key: "available", label: "Available", locked: true },
];

// Keep the table readable by default — the channel-price columns start hidden
// and can be switched on from the ⋯ Columns menu.
const STOCK_DEFAULT_HIDDEN = ["wholesale", "shop", "ebay", "amazon"];

type FlatRow = {
  key: string;
  productId: string;
  productTitle: string;
  image: string | null;
  variantTitle: string;
  sku: string;
  barcode: string;
  price: string;
  tiers: TierPrices;
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
        barcode: v.barcode,
        price: v.price,
        tiers: p.tiers,
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
  const cols = useColumns("cols:inventory", STOCK_COLUMNS, STOCK_DEFAULT_HIDDEN);
  const [rows, setRows] = useState<FlatRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [lowStock, setLowStock] = useState(LOW_STOCK_DEFAULT);
  // Owner-configured threshold from Settings; falls back to the constant.
  useEffect(() => {
    void loadPortalSettings().then((s) => {
      const n = Number(s?.lowStock);
      if (Number.isFinite(n) && n > 0) setLowStock(n);
    });
  }, []);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [flash, setFlash] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [channelDraft, setChannelDraft] = useState<string[]>([]);
  // Barcode label printing
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelPreset, setLabelPreset] = useState<LabelPresetKey>("sheet-65");
  const [labelCopies, setLabelCopies] = useState(1);
  const [labelShowSku, setLabelShowSku] = useState(true);
  const [labelShowPrice, setLabelShowPrice] = useState(true);
  const [manualCols, setManualCols] = useState<ManualCollection[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [sortKey, setSortKey] = useState("TITLE");
  const [reverse, setReverse] = useState(false);
  const [allCols, setAllCols] = useState<{ id: string; title: string }[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeQueryRef = useRef(""); // the full built query currently in effect (search + filters)

  const load = useCallback(async (q: string, after: string | null, append: boolean, sort = "TITLE", rev = false) => {
    setLoading(true);
    setError("");
    try {
      const url = new URL("/api/inventory", window.location.origin);
      if (q) url.searchParams.set("query", q);
      if (after) url.searchParams.set("after", after);
      if (sort) url.searchParams.set("sort", sort);
      if (rev) url.searchParams.set("reverse", "1");
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
      const cols = d.collections ?? [];
      setManualCols(cols.filter((c: { smart: boolean }) => !c.smart).map((c: ManualCollection) => ({ id: c.id, title: c.title })));
      setAllCols(cols.map((c: { id: string; title: string }) => ({ id: c.id, title: c.title })).sort((a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title)));
    }).catch(() => {});
    load("", null, false);
  }, [load]);

  function buildQuery(text: string, status: string, stock: string, channel: string, collection: string): string {
    const parts: string[] = [];
    if (text.trim()) parts.push(text.trim());
    if (status) parts.push(`status:${status}`);
    if (stock === "out") parts.push("inventory_total:0");
    else if (stock === "low") parts.push(`inventory_total:>0 inventory_total:<=${lowStock}`);
    else if (stock === "in") parts.push(`inventory_total:>${lowStock}`);
    if (channel) parts.push(`tag:'channel:${channel}'`);
    if (collection) parts.push(`collection_id:${collection}`);
    return parts.join(" ");
  }

  // Build the query, remember it as the active one, and reload from page 1.
  function reload(built: string) {
    activeQueryRef.current = built;
    load(built, null, false, sortKey, reverse);
  }

  function onSearch(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => reload(buildQuery(value, statusFilter, stockFilter, channelFilter, collectionFilter)), 350);
  }

  function applyFilters(next: { status?: string; stock?: string; channel?: string; collection?: string }) {
    const s = next.status ?? statusFilter;
    const st = next.stock ?? stockFilter;
    const ch = next.channel ?? channelFilter;
    const co = next.collection ?? collectionFilter;
    if (next.status !== undefined) setStatusFilter(next.status);
    if (next.stock !== undefined) setStockFilter(next.stock);
    if (next.channel !== undefined) setChannelFilter(next.channel);
    if (next.collection !== undefined) setCollectionFilter(next.collection);
    reload(buildQuery(query, s, st, ch, co));
  }

  function changeSort(key: string, rev: boolean) {
    setSortKey(key);
    setReverse(rev);
    load(activeQueryRef.current, null, false, key, rev);
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

  // Paged over what's been loaded so far; "Load more" keeps pulling the next
  // slice from Shopify and the page count grows with it.
  const paging = usePaging(rows, 50);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  function toggleRow(key: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleAll() { setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.key))); }
  function clearSelection() { setSelected(new Set()); setEditMode(false); setChannelDraft([]); }

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.key)), [rows, selected]);
  const selectedProductIds = useMemo(
    () => Array.from(new Set(selectedRows.map((r) => r.productId))),
    [selectedRows],
  );

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
      load(activeQueryRef.current, null, false, sortKey, reverse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  }

  function printLabels() {
    const items = selectedRows
      .map((r) => ({ code: (r.barcode || r.sku || "").trim(), title: `${r.productTitle}${r.variantTitle ? ` ${r.variantTitle}` : ""}`, price: r.price, sku: r.sku }))
      .filter((i) => i.code);
    if (!items.length) { setError("Selected products have no barcode or SKU. Use ‘Assign barcodes’ first."); return; }
    printBarcodeLabels(items, { preset: labelPreset, copies: labelCopies, showSku: labelShowSku, showPrice: labelShowPrice, currency: "GBP" });
    setLabelOpen(false);
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
      <div className="sticky top-0 z-20 -mx-8 mb-5 border-b border-line bg-bg/90 px-8 py-3 backdrop-blur">
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
            <button onClick={() => setDupOpen(true)} className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition hover:border-accent">Find duplicates</button>
          </div>
        </div>
        {/* Filter ribbon */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Filter</span>
          <select value={statusFilter} onChange={(e) => applyFilters({ status: e.target.value })} className={inputCls}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <select value={stockFilter} onChange={(e) => applyFilters({ stock: e.target.value })} className={inputCls}>
            <option value="">Any stock</option>
            <option value="in">In stock</option>
            <option value="low">Low</option>
            <option value="out">Out of stock</option>
          </select>
          <select value={channelFilter} onChange={(e) => applyFilters({ channel: e.target.value })} className={inputCls}>
            <option value="">Any channel</option>
            {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.short}</option>)}
          </select>
          <select value={collectionFilter} onChange={(e) => applyFilters({ collection: e.target.value })} className={inputCls}>
            <option value="">Any collection</option>
            {allCols.map((c) => <option key={c.id} value={c.id.split("/").pop()}>{c.title}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Sort</span>
            <select
              value={`${sortKey}:${reverse ? "1" : "0"}`}
              onChange={(e) => { const [k, r] = e.target.value.split(":"); changeSort(k, r === "1"); }}
              className={inputCls}
            >
              <option value="TITLE:0">Title A–Z</option>
              <option value="TITLE:1">Title Z–A</option>
              <option value="PRICE:0">Price low–high</option>
              <option value="PRICE:1">Price high–low</option>
              <option value="INVENTORY_TOTAL:0">Stock low–high</option>
              <option value="INVENTORY_TOTAL:1">Stock high–low</option>
              <option value="UPDATED_AT:1">Recently updated</option>
              <option value="CREATED_AT:1">Newest</option>
            </select>
          </div>
          <ColumnChooser columns={STOCK_COLUMNS} isVisible={cols.isVisible} toggle={cols.toggle} />
          {(statusFilter || stockFilter || channelFilter || collectionFilter) && (
            <button onClick={() => { setStatusFilter(""); setStockFilter(""); setChannelFilter(""); setCollectionFilter(""); reload(buildQuery(query, "", "", "", "")); }} className="rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-ink">Clear filters</button>
          )}
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}
      {flash && <p className="mb-4 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">{flash}</p>}

      <div className="max-h-[70vh] overflow-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-line bg-subtle text-xs uppercase tracking-wide text-muted shadow-sm">
            <tr>
              <th className="px-4 py-3 w-10"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-amber-500" /></th>
              <th className="px-4 py-3 font-medium">Product</th>
              {cols.isVisible("sku") && <th className="px-4 py-3 font-medium">SKU</th>}
              {cols.isVisible("price") && <th className="px-4 py-3 font-medium">Price (£)</th>}
              {cols.isVisible("wholesale") && <th className="px-4 py-3 text-right font-medium">Wholesale £</th>}
              {cols.isVisible("shop") && <th className="px-4 py-3 text-right font-medium">Shop £</th>}
              {cols.isVisible("ebay") && <th className="px-4 py-3 text-right font-medium">eBay £</th>}
              {cols.isVisible("amazon") && <th className="px-4 py-3 text-right font-medium">Amazon £</th>}
              {cols.isVisible("status") && <th className="px-4 py-3 font-medium">Status</th>}
              {cols.isVisible("channels") && <th className="px-4 py-3 font-medium">Channels</th>}
              <th className="px-4 py-3 text-right font-medium">Available</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {paging.rows.map((row) => (
              <StockRow
                key={row.key}
                row={row}
                show={cols.isVisible}
                available={availableAt(row)}
                locationId={locationId}
                lowStock={lowStock}
                checked={selected.has(row.key)}
                onToggle={() => toggleRow(row.key)}
                onStockSaved={(qty) => setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, levels: r.levels.map((l) => l.locationId === locationId ? { ...l, available: qty } : l) } : r))}
                onPriceSaved={(p) => setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, price: p } : r))}
                onTierSaved={(tierKey, value) => setRows((prev) => prev.map((r) => r.productId === row.productId ? { ...r, tiers: { ...r.tiers, [tierKey]: value } } : r))}
              />
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={2 + ["sku", "price", "wholesale", "shop", "ebay", "amazon", "status", "channels"].filter((k) => cols.isVisible(k)).length} className="px-4 py-10 text-center text-muted">No products found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination paging={paging} noun="products" />

      <div className="mt-5 flex justify-center">
        {hasNext ? (
          <button onClick={() => load(activeQueryRef.current, cursor, true, sortKey, reverse)} disabled={loading} className="rounded-lg border border-line px-5 py-2.5 text-sm font-medium text-ink transition hover:border-accent disabled:opacity-60">
            {loading ? "Loading…" : "Load more"}
          </button>
        ) : (loading && <p className="text-sm text-muted">Loading…</p>)}
      </div>

      {/* Barcode label print dialog */}
      {labelOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setLabelOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-ink">Print barcode labels</h3>
            <p className="mt-1 text-xs text-muted">{selected.size} product(s) selected. Uses each product&apos;s barcode (or SKU).</p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-muted">Label size</span>
              <select value={labelPreset} onChange={(e) => setLabelPreset(e.target.value as LabelPresetKey)} className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink">
                {LABEL_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-muted">Copies per product</span>
              <input type="number" min={1} value={labelCopies} onChange={(e) => setLabelCopies(Math.max(1, Number(e.target.value)))} className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink" />
            </label>
            <div className="mt-3 flex gap-4 text-sm text-ink">
              <label className="flex items-center gap-2"><input type="checkbox" checked={labelShowPrice} onChange={(e) => setLabelShowPrice(e.target.checked)} className="h-4 w-4 accent-amber-500" /> Show price</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={labelShowSku} onChange={(e) => setLabelShowSku(e.target.checked)} className="h-4 w-4 accent-amber-500" /> Show SKU</label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setLabelOpen(false)} className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-ink">Cancel</button>
              <button onClick={printLabels} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg transition hover:bg-accent hover:text-accentfg">Print</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-40 mx-auto mt-4 w-fit max-w-full">
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
            <button disabled={bulkBusy} onClick={() => setLabelOpen(true)} className="rounded-full px-3 py-1 hover:bg-bg/10 disabled:opacity-50">🏷 Labels</button>
            <button disabled={bulkBusy} onClick={() => runBulk("assignBarcodes")} className="rounded-full px-3 py-1 hover:bg-bg/10 disabled:opacity-50" title="Fill the barcode field from SKU (or generate) for products missing one">Barcodes</button>
            {selectedProductIds.length >= 2 && (
              <button disabled={bulkBusy} onClick={() => setMergeOpen(true)} className="rounded-full px-3 py-1 hover:bg-bg/10 disabled:opacity-50">Merge…</button>
            )}
            <button disabled={bulkBusy} onClick={() => runBulk("delete")} className="rounded-full px-3 py-1 text-red-400 hover:bg-red-500/20 disabled:opacity-50">Delete</button>
            <span className="h-4 w-px bg-bg/20" />
            <button onClick={clearSelection} className="rounded-full px-2 py-1 text-bg/50 hover:text-bg">✕</button>
          </div>
        </div>
      )}

      <MergeModal
        open={mergeOpen}
        productIds={selectedProductIds}
        onClose={() => setMergeOpen(false)}
        onMerged={() => {
          setMergeOpen(false);
          clearSelection();
          reload(activeQueryRef.current);
        }}
      />
      <DuplicatesModal
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        onMerged={() => reload(activeQueryRef.current)}
      />
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

const TIER_FIELD: Record<string, string> = { wholesale: "wholesalePrice", shop: "shopPrice", ebay: "ebayPrice", amazon: "amazonPrice" };

// Inline-editable channel-price cell. Blank = fall back to the online price;
// type a number and hit ✓ to save that tier's metafield.
function TierCell({
  productId, base, tierKey, value, onSaved,
}: {
  productId: string; base: string; tierKey: string; value: string | null | undefined;
  onSaved: (tierKey: string, value: string) => void;
}) {
  const norm = (v: string | null | undefined) =>
    v != null && String(v).trim() && Number(v) > 0 ? String(Number(v)) : "";
  const [val, setVal] = useState(norm(value));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setVal(norm(value)); setDirty(false); }, [value]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${productId.split("/").pop()}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", [TIER_FIELD[tierKey]]: val }),
      });
      if (res.ok) { onSaved(tierKey, val); setDirty(false); }
    } finally { setSaving(false); }
  }

  return (
    <td className="px-4 py-3 text-right">
      <div className="flex items-center justify-end gap-1.5">
        <input
          type="number" step="0.01" value={val} placeholder="base"
          onChange={(e) => { setVal(e.target.value); setDirty(true); }}
          onKeyDown={(e) => { if (e.key === "Enter" && dirty) save(); }}
          title={`Blank = use online price (£${Number(base || 0).toFixed(2)})`}
          className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-right text-sm text-ink placeholder:text-muted/50"
        />
        {dirty && <button onClick={save} disabled={saving} className="rounded-lg bg-accent px-2 py-1.5 text-xs font-semibold text-accentfg disabled:opacity-60">✓</button>}
      </div>
    </td>
  );
}

function StockRow({
  row, show, available, locationId, lowStock, checked, onToggle, onStockSaved, onPriceSaved, onTierSaved,
}: {
  row: FlatRow; show: (k: string) => boolean; available: number; locationId: string; lowStock: number; checked: boolean;
  onToggle: () => void; onStockSaved: (qty: number) => void; onPriceSaved: (p: string) => void;
  onTierSaved: (tierKey: string, value: string) => void;
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
            <Link href={`/portal/products/${row.productId.split("/").pop()}/edit`} className="font-medium text-ink hover:text-accent">{row.productTitle}</Link>
            <p className="text-xs text-muted">
              {row.variantTitle && <span>{row.variantTitle} · </span>}
              <span className={row.status === "ACTIVE" ? "text-emerald-500" : "text-muted"}>{row.status}</span>
            </p>
          </div>
        </div>
      </td>
      {show("sku") && <td className="px-4 py-3 text-muted">{row.sku || "—"}</td>}
      {show("price") && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <input type="number" step="0.01" value={priceVal} onChange={(e) => { setPriceVal(e.target.value); setPriceDirty(true); }} className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink" />
            {priceDirty && <button onClick={savePrice} disabled={saving} className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-accentfg disabled:opacity-60">Save</button>}
          </div>
        </td>
      )}
      {show("wholesale") && <TierCell productId={row.productId} base={row.price} tierKey="wholesale" value={row.tiers?.wholesale} onSaved={onTierSaved} />}
      {show("shop") && <TierCell productId={row.productId} base={row.price} tierKey="shop" value={row.tiers?.shop} onSaved={onTierSaved} />}
      {show("ebay") && <TierCell productId={row.productId} base={row.price} tierKey="ebay" value={row.tiers?.ebay} onSaved={onTierSaved} />}
      {show("amazon") && <TierCell productId={row.productId} base={row.price} tierKey="amazon" value={row.tiers?.amazon} onSaved={onTierSaved} />}
      {show("status") && (
        <td className="px-4 py-3">
          {!row.tracked ? <span className="rounded-full bg-subtle px-2.5 py-1 text-xs font-medium text-muted">Not tracked</span>
            : status === "out" ? <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-500">Out</span>
            : status === "low" ? <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-600">Low</span>
            : <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600">In stock</span>}
        </td>
      )}
      {show("channels") && (
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
      )}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <input type="number" value={stockVal} disabled={!row.tracked || !row.inventoryItemId} onChange={(e) => { setStockVal(e.target.value); setStockDirty(true); }} className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-right text-sm text-ink disabled:opacity-50" />
          {stockDirty && <button onClick={saveStock} disabled={saving} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-bg disabled:opacity-60">Save</button>}
        </div>
      </td>
    </tr>
  );
}
