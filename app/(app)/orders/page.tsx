"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";

type Order = {
  id: string;
  name: string;
  customer: string;
  createdAt: string;
  total: string;
  currency: string;
  financialStatus: string;
  fulfillmentStatus: string;
  itemCount: number;
  source: string;
  segment: SegmentKey | null;
};

type Stats = { count: number; sales: number; unfulfilled: number; unpaid: number } | null;

function finBadge(s: string) {
  if (s === "PAID") return "bg-emerald-100 text-emerald-700";
  if (s === "REFUNDED" || s === "PARTIALLY_REFUNDED") return "bg-neutral-200 text-neutral-700";
  return "bg-amber-100 text-amber-700";
}
function fulBadge(s: string) {
  if (s === "FULFILLED") return "bg-emerald-100 text-emerald-700";
  if (s === "PARTIALLY_FULFILLED") return "bg-sky-100 text-sky-700";
  return "bg-rose-100 text-rose-700";
}
function pretty(s: string) {
  return s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [segFilter, setSegFilter] = useState<SegmentKey | "all">("all");
  const [fulFilter, setFulFilter] = useState<"all" | "unfulfilled" | "fulfilled">("all");
  const [payFilter, setPayFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [flash, setFlash] = useState("");

  function reload() {
    setLoading(true);
    fetch("/api/orders")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        setOrders(d.orders ?? []);
        setStats(d.stats ?? null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(reload, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (segFilter !== "all" && o.segment !== segFilter) return false;
      if (fulFilter === "unfulfilled" && o.fulfillmentStatus === "FULFILLED") return false;
      if (fulFilter === "fulfilled" && o.fulfillmentStatus !== "FULFILLED") return false;
      if (payFilter === "paid" && o.financialStatus !== "PAID") return false;
      if (payFilter === "unpaid" && (o.financialStatus === "PAID" || o.financialStatus === "REFUNDED")) return false;
      if (!s) return true;
      return o.name.toLowerCase().includes(s) || o.customer.toLowerCase().includes(s);
    });
  }, [orders, search, segFilter, fulFilter, payFilter]);

  const allSelected = filtered.length > 0 && filtered.every((o) => selected.has(o.id));
  function toggleRow(id: string) { setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleAll() { setSelected(allSelected ? new Set() : new Set(filtered.map((o) => o.id))); }
  function clearSel() { setSelected(new Set()); }
  async function bulkAction(action: "archive" | "unarchive" | "delete") {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (action === "delete" && !confirm(`Delete ${ids.length} order(s)? Shopify only allows deleting some orders (e.g. cancelled/test). This cannot be undone.`)) return;
    setBulkBusy(true); setError(""); setFlash("");
    try {
      const res = await fetch("/api/orders/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ids }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setFlash(`${action === "archive" ? "Archived" : action === "unarchive" ? "Reopened" : "Deleted"}: ${d.ok}${d.failed ? `, ${d.failed} not allowed/failed` : ""}.`);
      clearSel(); reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBulkBusy(false); }
  }
  function bulkExport() {
    const ids = Array.from(selected).map((x) => encodeURIComponent(x)).join(",");
    if (ids) window.location.href = `/api/orders/export?ids=${ids}`;
  }

  return (
    <div className="px-8 py-7 pb-28">
      <div className="sticky top-0 z-20 -mx-8 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white/95 px-8 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Orders</h1>
          <p className="text-sm text-neutral-500">Completed sales across all sources — store, shop, eBay &amp; Amazon.</p>
        </div>
        <button onClick={() => (window.location.href = "/api/orders/export")} disabled={orders.length === 0} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">⬇ Export all</button>
      </div>

      {stats && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Orders" value={String(stats.count)} />
          <Tile label="Sales" value={`£${stats.sales.toFixed(2)}`} />
          <Tile label="Unfulfilled" value={String(stats.unfulfilled)} accent="rose" />
          <Tile label="Unpaid" value={String(stats.unpaid)} accent="amber" />
        </div>
      )}

      {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {flash && <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{flash}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order # or customer…" className="w-56 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100" />
        <div className="flex rounded-lg border border-neutral-300 p-1 dark:border-neutral-700">
          {(["all", "unfulfilled", "fulfilled"] as const).map((f) => (
            <button key={f} onClick={() => setFulFilter(f)} className={`rounded-md px-3 py-1 text-sm font-medium capitalize ${fulFilter === f ? "bg-neutral-900 text-white" : "text-neutral-600 dark:text-neutral-300"}`}>{f}</button>
          ))}
        </div>
        <div className="flex rounded-lg border border-neutral-300 p-1 dark:border-neutral-700">
          {(["all", "paid", "unpaid"] as const).map((f) => (
            <button key={f} onClick={() => setPayFilter(f)} className={`rounded-md px-3 py-1 text-sm font-medium capitalize ${payFilter === f ? "bg-neutral-900 text-white" : "text-neutral-600 dark:text-neutral-300"}`}>{f}</button>
          ))}
        </div>
        <div className="flex flex-wrap rounded-lg border border-neutral-300 p-1 dark:border-neutral-700">
          <button onClick={() => setSegFilter("all")} className={`rounded-md px-3 py-1 text-sm font-medium ${segFilter === "all" ? "bg-neutral-900 text-white" : "text-neutral-600 dark:text-neutral-300"}`}>All sources</button>
          {SEGMENTS.map((s) => (
            <button key={s.key} onClick={() => setSegFilter(s.key)} className={`rounded-md px-3 py-1 text-sm font-medium ${segFilter === s.key ? "bg-neutral-900 text-white" : "text-neutral-600 dark:text-neutral-300"}`}>{s.short}</button>
          ))}
        </div>
        <span className="text-sm text-neutral-400">{filtered.length} shown</span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950">
            <tr>
              <th className="px-4 py-3 w-10"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-amber-500" /></th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Fulfilment</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filtered.map((o) => {
              const seg = SEGMENTS.find((x) => x.key === o.segment);
              return (
                <tr key={o.id} onClick={() => router.push(`/orders/${encodeURIComponent(o.id)}`)} className={`cursor-pointer ${selected.has(o.id) ? "bg-amber-50 dark:bg-amber-500/10" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40"}`}>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleRow(o.id)} className="h-4 w-4 accent-amber-500" /></td>
                  <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{o.name}<span className="ml-1 text-xs font-normal text-neutral-400">· {o.itemCount} item{o.itemCount === 1 ? "" : "s"}</span></td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">{o.customer}</td>
                  <td className="px-4 py-3">{seg ? <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${seg.badge}`}>{seg.short}</span> : <span className="text-neutral-300">—</span>}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${finBadge(o.financialStatus)}`}>{pretty(o.financialStatus)}</span></td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${fulBadge(o.fulfillmentStatus)}`}>{pretty(o.fulfillmentStatus)}</span></td>
                  <td className="px-4 py-3 text-neutral-500">{new Date(o.createdAt).toLocaleDateString("en-GB")}</td>
                  <td className="px-4 py-3 text-right font-medium text-neutral-900 dark:text-neutral-100">£{o.total}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-neutral-400">{orders.length === 0 ? "No orders yet." : "No orders match."}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-14 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-white shadow-2xl">
          <span className="font-medium">{selected.size} selected</span>
          <span className="h-4 w-px bg-white/20" />
          <button disabled={bulkBusy} onClick={bulkExport} className="rounded-full px-3 py-1 hover:bg-white/10 disabled:opacity-50">⬇ Export</button>
          <button disabled={bulkBusy} onClick={() => bulkAction("archive")} className="rounded-full px-3 py-1 hover:bg-white/10 disabled:opacity-50">Archive</button>
          <button disabled={bulkBusy} onClick={() => bulkAction("unarchive")} className="rounded-full px-3 py-1 hover:bg-white/10 disabled:opacity-50">Reopen</button>
          <button disabled={bulkBusy} onClick={() => bulkAction("delete")} className="rounded-full px-3 py-1 text-red-400 hover:bg-red-500/20 disabled:opacity-50">Delete</button>
          <span className="h-4 w-px bg-white/20" />
          <button onClick={clearSel} className="rounded-full px-2 py-1 text-white/50 hover:text-white">✕</button>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: "amber" | "rose" }) {
  const ring = accent === "amber" ? "text-amber-600" : accent === "rose" ? "text-rose-600" : "text-neutral-900 dark:text-neutral-100";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${ring}`}>{value}</p>
    </div>
  );
}
