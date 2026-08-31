"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProductRow } from "@/lib/shopify";
import ColumnChooser, { useColumns, useSort, type ColumnDef } from "@/components/ColumnChooser";
import { Menu, MenuItem } from "@/components/Menu";
import Pagination, { usePaging } from "@/components/Pagination";
import SelectionBar from "@/components/SelectionBar";

const COLUMNS: ColumnDef[] = [
  { key: "product", label: "Item", locked: true },
  { key: "sku", label: "SKU" },
  { key: "barcode", label: "Barcode" },
  { key: "price", label: "Price" },
  { key: "stock", label: "Stock" },
];

type Row = { key: string; productId: string; title: string; sku: string; barcode: string; price: string; inventoryItemId: string | null; tracked: boolean; available: number; image: string | null };

function flatten(rows: ProductRow[]): Row[] {
  const out: Row[] = [];
  for (const p of rows) for (const v of p.variants) {
    out.push({ key: v.variantId, productId: p.productId, title: p.title, sku: v.sku, barcode: v.barcode, price: v.price, inventoryItemId: v.inventoryItemId, tracked: v.tracked, available: v.available, image: p.image });
  }
  return out;
}

export default function TillPage() {
  const cols = useColumns("cols:till", COLUMNS);
  const sort = useSort<"product" | "sku" | "price">("product", "asc");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [nt, setNt] = useState({ title: "", price: "" });
  const [addBusy, setAddBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((q: string) => {
    setLoading(true); setError("");
    const query = `tag:'channel:till'${q.trim() ? ` ${q.trim()}` : ""}`;
    fetch(`/api/inventory?query=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); setRows(flatten((d.rows as ProductRow[]) ?? [])); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(""); }, [load]);

  function onSearch(v: string) {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(v), 350);
  }

  const shown = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (r: Row): string | number => sort.key === "price" ? Number(r.price) || 0 : sort.key === "sku" ? r.sku.toLowerCase() : r.title.toLowerCase();
    return [...rows].sort((a, b) => { const av = val(a), bv = val(b); return typeof av === "number" && typeof bv === "number" ? (av - bv) * dir : String(av).localeCompare(String(bv)) * dir; });
  }, [rows, sort.key, sort.dir]);
  const paging = usePaging(shown, 50);

  function toggleRow(k: string) { setSelected((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; }); }

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.key)), [rows, selected]);

  async function runBulk(action: string, extra: Record<string, unknown> = {}) {
    const productIds = Array.from(new Set(selectedRows.map((r) => r.productId)));
    if (!productIds.length) return;
    if (action === "delete" && !confirm(`Delete ${productIds.length} till item(s)? This can't be undone.`)) return;
    setBulkBusy(true); setError(""); setFlash("");
    try {
      const res = await fetch("/api/products/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, productIds, variants: selectedRows.map((r) => ({ id: r.key, productId: r.productId })), ...extra }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setFlash(`Done: ${d.ok} updated${d.failed ? `, ${d.failed} failed` : ""}.`);
      setSelected(new Set());
      load(search);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBulkBusy(false); }
  }

  async function addItem() {
    if (!nt.title.trim() || !(Number(nt.price) >= 0)) { setError("Enter a name and price."); return; }
    setAddBusy(true); setError("");
    try {
      const res = await fetch("/api/products/till", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: nt.title.trim(), price: Number(nt.price) }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setNt({ title: "", price: "" }); setAddOpen(false); setFlash("Till item added."); load(search);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setAddBusy(false); }
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkBusy(true); setError(""); setFlash("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/import?scope=till", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Import failed");
      setFlash(`Imported: ${d.created} created, ${d.updated} updated${d.failed ? `, ${d.failed} failed` : ""}.`);
      load(search);
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed"); } finally { setBulkBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const inp = "rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

  return (
    <div className="px-8 py-7 pb-16">
      <div className="sticky top-0 z-20 -mx-8 mb-4 border-b border-neutral-200 bg-white/95 px-8 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Till items</h1>
            <p className="text-sm text-neutral-500">Simplified in-shop products for POS — separate from your online listings. {rows.length} item(s).</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setAddOpen((v) => !v)} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900">+ Till item</button>
            <Menu label="Import / Export">
              <MenuItem onClick={() => (window.location.href = "/api/export?scope=till")}>⬇ Export till items (Excel)</MenuItem>
              <MenuItem onClick={() => fileRef.current?.click()}>⬆ Import from Excel</MenuItem>
              <MenuItem onClick={() => (window.location.href = "/api/template")}>📄 Download template</MenuItem>
            </Menu>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onImport} className="hidden" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search till items…" className={`${inp} w-64`} />
          <span className="text-sm text-neutral-400">{shown.length} shown</span>
          <div className="ml-auto"><ColumnChooser columns={COLUMNS} isVisible={cols.isVisible} toggle={cols.toggle} /></div>
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
      {flash && <p className="mb-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{flash}</p>}

      {addOpen && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <label className="text-sm"><span className="mb-1 block text-neutral-600">Item name</span><input value={nt.title} onChange={(e) => setNt({ ...nt, title: e.target.value })} placeholder="e.g. Glue case" className={`${inp} w-64`} /></label>
          <label className="text-sm"><span className="mb-1 block text-neutral-600">Price (£)</span><input type="number" step="0.01" min={0} value={nt.price} onChange={(e) => setNt({ ...nt, price: e.target.value })} className={`${inp} w-28`} /></label>
          <button onClick={addItem} disabled={addBusy} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">{addBusy ? "Adding…" : "Add"}</button>
        </div>
      )}

      {/* Persistent action ribbon */}
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <SelectionBar
          pageKeys={paging.rows.map((r) => r.key)}
          allKeys={shown.map((r) => r.key)}
          selected={selected}
          onChange={setSelected}
          noun="items"
        />
        <span className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />
        <button disabled={!selected.size || bulkBusy} onClick={() => runBulk("channels", { addChannels: [], removeChannels: ["till"] })} className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-200 dark:hover:bg-neutral-800">Remove from till</button>
        <button disabled={!selected.size || bulkBusy} onClick={() => runBulk("delete")} className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-500/10">Delete</button>
      </div>

      {/* Scrolls sideways on narrow screens, but not vertically: with paging below,
          an inner 70vh scrollbar meant two scrollbars over one list and a pager
          stranded past the bottom of the box. */}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950">
            <tr>
              {/* The tick box is in the action ribbon above, where it can say
                  whether it takes this page or every matching row. */}
              <th className="px-4 py-3 w-10"></th>
              <th className="px-4 py-3"><button onClick={() => sort.onSort("product")} className="uppercase hover:text-neutral-900 dark:hover:text-neutral-200">Item{sort.arrow("product")}</button></th>
              {cols.isVisible("sku") && <th className="px-4 py-3"><button onClick={() => sort.onSort("sku")} className="uppercase hover:text-neutral-900 dark:hover:text-neutral-200">SKU{sort.arrow("sku")}</button></th>}
              {cols.isVisible("barcode") && <th className="px-4 py-3">Barcode</th>}
              {cols.isVisible("price") && <th className="px-4 py-3 text-right"><button onClick={() => sort.onSort("price")} className="uppercase hover:text-neutral-900 dark:hover:text-neutral-200">Price{sort.arrow("price")}</button></th>}
              {cols.isVisible("stock") && <th className="px-4 py-3 text-right">Stock</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {paging.rows.map((r) => <TillRow key={r.key} row={r} show={cols.isVisible} checked={selected.has(r.key)} onToggle={() => toggleRow(r.key)} onPriceSaved={(p) => setRows((prev) => prev.map((x) => x.key === r.key ? { ...x, price: p } : x))} />)}
            {shown.length === 0 && !loading && (
              <tr><td colSpan={2 + ["sku", "barcode", "price", "stock"].filter((k) => cols.isVisible(k)).length} className="px-4 py-12 text-center text-neutral-400">
                No till items yet. Click <strong>+ Till item</strong> to add one, or tag products in Inventory → Channels → Till.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination paging={paging} noun="items" />
      {loading && <p className="mt-4 text-center text-sm text-neutral-400">Loading…</p>}
    </div>
  );
}

function TillRow({ row, show, checked, onToggle, onPriceSaved }: { row: Row; show: (k: string) => boolean; checked: boolean; onToggle: () => void; onPriceSaved: (p: string) => void }) {
  const [price, setPrice] = useState(row.price);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setPrice(row.price); setDirty(false); }, [row.price]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/products/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "price", variants: [{ id: row.key, productId: row.productId }], value: Number(price) }) });
      if (res.ok) { onPriceSaved(String(price)); setDirty(false); }
    } finally { setSaving(false); }
  }

  return (
    <tr className={checked ? "bg-amber-50 dark:bg-amber-500/10" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40"}>
      <td className="px-4 py-3"><input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 accent-amber-500" /></td>
      <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{row.title}</td>
      {show("sku") && <td className="px-4 py-3 text-neutral-500">{row.sku || "—"}</td>}
      {show("barcode") && <td className="px-4 py-3 text-neutral-500">{row.barcode || "—"}</td>}
      {show("price") && (
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <span className="text-neutral-400">£</span>
            <input type="number" step="0.01" value={price} onChange={(e) => { setPrice(e.target.value); setDirty(true); }} className="w-24 rounded-lg border border-neutral-300 px-2 py-1.5 text-right text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100" />
            {dirty && <button onClick={save} disabled={saving} className="rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Save</button>}
          </div>
        </td>
      )}
      {show("stock") && <td className="px-4 py-3 text-right text-neutral-500">{row.tracked ? row.available : "—"}</td>}
    </tr>
  );
}
