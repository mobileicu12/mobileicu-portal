"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadBusiness, type Business } from "@/lib/business";
import InvoicePreviewModal from "@/components/InvoicePreviewModal";
import type { InvoiceDetail } from "@/lib/billing";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";

type Invoice = {
  id: string;
  name: string;
  invoiceNo: string;
  customer: string;
  status: string;
  total: string;
  createdAt: string;
  invoiceUrl: string | null;
  segment: SegmentKey | null;
  staff: string | null;
};

type Stats = {
  count: number;
  outstanding: number;
  paid: number;
  openCount: number;
  paidCount: number;
} | null;

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<Stats>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "paid">("all");
  const [segFilter, setSegFilter] = useState<SegmentKey | "all">("all");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const [preview, setPreview] = useState<{ invoice: InvoiceDetail; business: Business } | null>(null);

  const staffList = useMemo(() => Array.from(new Set(invoices.map((i) => i.staff).filter(Boolean))) as string[], [invoices]);

  function reload() {
    setLoading(true);
    fetch("/api/billing")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        setInvoices(d.invoices ?? []);
        setStats(d.stats ?? null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(reload, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter === "open" && inv.status === "COMPLETED") return false;
      if (statusFilter === "paid" && inv.status !== "COMPLETED") return false;
      if (segFilter !== "all" && inv.segment !== segFilter) return false;
      if (staffFilter !== "all" && (inv.staff || "") !== staffFilter) return false;
      if (!s) return true;
      return inv.invoiceNo.toLowerCase().includes(s) || inv.name.toLowerCase().includes(s) || inv.customer.toLowerCase().includes(s) || (inv.staff || "").toLowerCase().includes(s);
    });
  }, [invoices, search, statusFilter, segFilter, staffFilter]);

  async function downloadPdf(e: React.MouseEvent, inv: Invoice) {
    e.stopPropagation();
    setBusy(inv.id + ":pdf");
    setError("");
    try {
      const [res, biz] = await Promise.all([fetch(`/api/billing/${encodeURIComponent(inv.id)}`), loadBusiness()]);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load invoice");
      setPreview({ invoice: data.invoice as InvoiceDetail, business: biz });
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF failed");
    } finally {
      setBusy("");
    }
  }

  function downloadXlsx(id?: string) {
    window.location.href = id ? `/api/billing/export?id=${encodeURIComponent(id)}` : "/api/billing/export";
  }

  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  function toggleRow(id: string) { setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleAll() { setSelected(allSelected ? new Set() : new Set(filtered.map((i) => i.id))); }
  function clearSel() { setSelected(new Set()); }

  async function bulkMarkPaid() {
    const ids = filtered.filter((i) => selected.has(i.id) && i.status !== "COMPLETED").map((i) => i.id);
    if (!ids.length) { setError("Only draft invoices can be marked paid."); return; }
    if (!confirm(`Mark ${ids.length} invoice(s) as PAID? This creates the orders and deducts stock.`)) return;
    setBulkBusy(true); setError(""); setFlash("");
    let ok = 0, fail = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/billing/${encodeURIComponent(id)}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete" }) });
        res.ok ? ok++ : fail++;
      } catch { fail++; }
    }
    setFlash(`Marked paid: ${ok}${fail ? `, ${fail} failed` : ""}.`);
    clearSel(); reload(); setBulkBusy(false);
  }

  async function bulkDelete() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} invoice(s)? This cannot be undone.`)) return;
    setBulkBusy(true); setError(""); setFlash("");
    let ok = 0, fail = 0;
    for (const id of ids) {
      try { const res = await fetch(`/api/billing/${encodeURIComponent(id)}`, { method: "DELETE" }); res.ok ? ok++ : fail++; } catch { fail++; }
    }
    setFlash(`Deleted: ${ok}${fail ? `, ${fail} failed` : ""}.`);
    clearSel(); reload(); setBulkBusy(false);
  }

  function bulkExport() {
    const ids = Array.from(selected).map((x) => encodeURIComponent(x)).join(",");
    if (ids) window.location.href = `/api/billing/export?ids=${ids}`;
  }

  return (
    <div className="px-8 py-7 pb-28">
      <div className="sticky top-0 z-20 -mx-8 mb-5 border-b border-neutral-200 bg-white/95 px-8 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Invoices</h1>
            <p className="text-sm text-neutral-500">Bills &amp; invoices created from the portal. Click a row to edit.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <a href="/billing" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900">+ New bill</a>
            <button onClick={() => downloadXlsx()} disabled={invoices.length === 0} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">⬇ Export all</button>
          </div>
        </div>
        {/* controls */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice # or customer…"
            className="w-56 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
          <div className="flex rounded-lg border border-neutral-300 p-1 dark:border-neutral-700">
            {(["all", "open", "paid"] as const).map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)} className={`rounded-md px-3 py-1 text-sm font-medium capitalize ${statusFilter === f ? "bg-neutral-900 text-white" : "text-neutral-600 dark:text-neutral-300"}`}>{f}</button>
            ))}
          </div>
          <div className="flex flex-wrap rounded-lg border border-neutral-300 p-1 dark:border-neutral-700">
            <button onClick={() => setSegFilter("all")} className={`rounded-md px-3 py-1 text-sm font-medium ${segFilter === "all" ? "bg-neutral-900 text-white" : "text-neutral-600 dark:text-neutral-300"}`}>All</button>
            {SEGMENTS.map((s) => (
              <button key={s.key} onClick={() => setSegFilter(s.key)} className={`rounded-md px-3 py-1 text-sm font-medium ${segFilter === s.key ? "bg-neutral-900 text-white" : "text-neutral-600 dark:text-neutral-300"}`}>{s.short}</button>
            ))}
          </div>
          {staffList.length > 0 && (
            <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100">
              <option value="all">All staff</option>
              {staffList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <span className="text-sm text-neutral-400">{filtered.length} shown</span>
        </div>
      </div>

      {/* stat tiles */}
      {stats && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Invoices" value={String(stats.count)} />
          <Tile label="Outstanding" value={`£${stats.outstanding.toFixed(2)}`} sub={`${stats.openCount} open`} accent="amber" />
          <Tile label="Paid" value={`£${stats.paid.toFixed(2)}`} sub={`${stats.paidCount} completed`} accent="emerald" />
          <Tile label="Total billed" value={`£${(stats.outstanding + stats.paid).toFixed(2)}`} />
        </div>
      )}

      {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {flash && <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{flash}</p>}

      <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950">
            <tr>
              <th className="px-4 py-3 w-10"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-amber-500" /></th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Export</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filtered.map((inv) => (
              <tr key={inv.id} onClick={() => router.push(`/invoices/${encodeURIComponent(inv.id)}`)} className={`cursor-pointer ${selected.has(inv.id) ? "bg-amber-50 dark:bg-amber-500/10" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40"}`}>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggleRow(inv.id)} className="h-4 w-4 accent-amber-500" /></td>
                <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{inv.invoiceNo}<span className="ml-1 text-xs font-normal text-neutral-400">{inv.name}</span></td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">{inv.customer}</td>
                <td className="px-4 py-3">
                  {(() => {
                    const s = SEGMENTS.find((x) => x.key === inv.segment);
                    return s ? <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.badge}`}>{s.short}</span> : <span className="text-neutral-300">—</span>;
                  })()}
                </td>
                <td className="px-4 py-3 text-xs text-neutral-500">{inv.staff ? inv.staff.split("@")[0] : "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${inv.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {inv.status === "COMPLETED" ? "PAID" : "DRAFT"}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-500">{new Date(inv.createdAt).toLocaleDateString("en-GB")}</td>
                <td className="px-4 py-3 text-right font-medium text-neutral-900 dark:text-neutral-100">£{inv.total}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={(e) => downloadPdf(e, inv)} disabled={busy === inv.id + ":pdf"} className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-50">{busy === inv.id + ":pdf" ? "…" : "PDF"}</button>
                    <button onClick={(e) => { e.stopPropagation(); downloadXlsx(inv.id); }} className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-semibold text-neutral-700 transition hover:border-neutral-900 dark:border-neutral-700 dark:text-neutral-200">Excel</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-neutral-400">{invoices.length === 0 ? "No invoices yet. Create one in Billing / POS." : "No invoices match."}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk action bar — sticky so it never hides or covers rows */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-40 mx-auto mt-4 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-white shadow-2xl">
          <span className="font-medium">{selected.size} selected</span>
          <span className="h-4 w-px bg-white/20" />
          <button disabled={bulkBusy} onClick={bulkMarkPaid} className="rounded-full px-3 py-1 hover:bg-white/10 disabled:opacity-50">✓ Mark paid</button>
          <button disabled={bulkBusy} onClick={bulkExport} className="rounded-full px-3 py-1 hover:bg-white/10 disabled:opacity-50">⬇ Export</button>
          <button disabled={bulkBusy} onClick={bulkDelete} className="rounded-full px-3 py-1 text-red-400 hover:bg-red-500/20 disabled:opacity-50">Delete</button>
          <span className="h-4 w-px bg-white/20" />
          <button onClick={clearSel} className="rounded-full px-2 py-1 text-white/50 hover:text-white">✕</button>
        </div>
      )}

      {preview && <InvoicePreviewModal invoice={preview.invoice} business={preview.business} onClose={() => setPreview(null)} />}
    </div>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "amber" | "emerald" }) {
  const ring = accent === "amber" ? "text-amber-600" : accent === "emerald" ? "text-emerald-600" : "text-neutral-900 dark:text-neutral-100";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${ring}`}>{value}</p>
      {sub && <p className="text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}
