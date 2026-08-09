"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadBusiness, type Business } from "@/lib/business";
import InvoicePreviewModal from "@/components/InvoicePreviewModal";
import PdfPreviewModal from "@/components/PdfPreviewModal";
import { buildInvoicesReportDoc, buildCustomerDayDoc, type ReportRow } from "@/lib/report-pdf";
import { Menu, MenuItem } from "@/components/Menu";
import type { jsPDF } from "jspdf";
import type { InvoiceDetail } from "@/lib/billing";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";
import { useCanSeeFinance } from "@/lib/use-me";
import { FinanceLockBar } from "@/components/Finance";
import { invoiceStatus, STATUS_BADGE } from "@/lib/invoice-status";
import ColumnChooser, { useColumns, useSort, type ColumnDef } from "@/components/ColumnChooser";
import { BRAND_SLUG } from "@/lib/brand";

const INV_COLUMNS: ColumnDef[] = [
  { key: "invoice", label: "Invoice", locked: true },
  { key: "customer", label: "Customer" },
  { key: "source", label: "Source" },
  { key: "staff", label: "Staff" },
  { key: "status", label: "Status" },
  { key: "date", label: "Raised" },
  { key: "paidOn", label: "Paid on" },
  { key: "total", label: "Total", locked: true },
];

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
  payMethod: string | null;
  amountPaid: number;
  balance: number;
  completedAt: string | null; // when the money actually arrived
};

export default function InvoicesPage() {
  const router = useRouter();
  const canSeeFinance = useCanSeeFinance();
  const cols = useColumns("cols:invoices", INV_COLUMNS);
  const sort = useSort<"invoice" | "customer" | "source" | "staff" | "status" | "date" | "total">("date", "desc");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "paid">("all");
  const [segFilter, setSegFilter] = useState<SegmentKey | "all">("all");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const [preview, setPreview] = useState<{ invoice: InvoiceDetail; business: Business } | null>(null);
  const [report, setReport] = useState<{ doc: jsPDF; filename: string; subtitle: string } | null>(null);

  const staffList = useMemo(() => Array.from(new Set(invoices.map((i) => i.staff).filter(Boolean))) as string[], [invoices]);

  function reload() {
    setLoading(true);
    fetch("/api/billing")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        setInvoices(d.invoices ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(reload, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const fromT = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toT = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    return invoices.filter((inv) => {
      if (statusFilter === "open" && inv.status === "COMPLETED") return false;
      if (statusFilter === "paid" && inv.status !== "COMPLETED") return false;
      if (segFilter !== "all" && inv.segment !== segFilter) return false;
      if (staffFilter !== "all" && (inv.staff || "") !== staffFilter) return false;
      const t = new Date(inv.createdAt).getTime();
      if (fromT !== null && t < fromT) return false;
      if (toT !== null && t > toT) return false;
      if (!s) return true;
      return inv.invoiceNo.toLowerCase().includes(s) || inv.name.toLowerCase().includes(s) || inv.customer.toLowerCase().includes(s) || (inv.staff || "").toLowerCase().includes(s);
    });
  }, [invoices, search, statusFilter, segFilter, staffFilter, dateFrom, dateTo]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (inv: Invoice): string | number => {
      switch (sort.key) {
        case "invoice": return inv.invoiceNo;
        case "customer": return inv.customer.toLowerCase();
        case "source": return inv.segment || "";
        case "staff": return inv.staff || "";
        case "status": return inv.status;
        case "date": return +new Date(inv.createdAt);
        case "total": return Number(inv.total) || 0;
        default: return 0;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sort.key, sort.dir]);

  // --- Paging. Filters/sort apply across the whole set; only the rows shown are paged.
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );

  // Live summary of whatever range/filters are currently applied. Counts money
  // actually settled vs still due, so a part-paid bill splits correctly.
  const rangeStats = useMemo(() => {
    let total = 0, paid = 0, outstanding = 0, openCount = 0, paidCount = 0;
    for (const inv of filtered) {
      total += parseFloat(inv.total) || 0;
      paid += Number(inv.amountPaid) || 0;
      outstanding += Number(inv.balance) || 0;
      if (inv.status === "COMPLETED") paidCount++;
      if ((Number(inv.balance) || 0) > 0.001) openCount++;
    }
    return {
      count: filtered.length,
      total: Math.round(total * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      outstanding: Math.round(outstanding * 100) / 100,
      openCount, paidCount,
    };
  }, [filtered]);

  function todayStr() { return new Date().toLocaleDateString("en-CA"); } // YYYY-MM-DD (local)
  function setPreset(preset: "today" | "7d" | "month" | "all") {
    if (preset === "all") { setDateFrom(""); setDateTo(""); return; }
    const now = new Date();
    const to = todayStr();
    if (preset === "today") { setDateFrom(to); setDateTo(to); return; }
    if (preset === "7d") { const d = new Date(now); d.setDate(d.getDate() - 6); setDateFrom(d.toLocaleDateString("en-CA")); setDateTo(to); return; }
    if (preset === "month") { const d = new Date(now.getFullYear(), now.getMonth(), 1); setDateFrom(d.toLocaleDateString("en-CA")); setDateTo(to); }
  }
  function downloadReport() {
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    // No range selected → report defaults to today on the server.
    window.location.href = `/api/billing/report?${params.toString()}`;
  }

  function rangeLabel() {
    if (dateFrom && dateTo) return dateFrom === dateTo ? new Date(dateFrom).toLocaleDateString("en-GB") : `${new Date(dateFrom).toLocaleDateString("en-GB")} – ${new Date(dateTo).toLocaleDateString("en-GB")}`;
    if (dateFrom) return `From ${new Date(dateFrom).toLocaleDateString("en-GB")}`;
    if (dateTo) return `Until ${new Date(dateTo).toLocaleDateString("en-GB")}`;
    return "All time";
  }

  async function openPdfReport(rows: Invoice[], label: string) {
    if (!rows.length) { setError("No invoices to include in the report."); return; }
    const biz = await loadBusiness();
    const reportRows: ReportRow[] = rows.map((r) => ({ invoiceNo: r.invoiceNo, name: r.name, customer: r.customer, staff: r.staff, segment: r.segment, status: r.status, total: r.total, createdAt: r.createdAt, payMethod: r.payMethod }));
    const doc = buildInvoicesReportDoc(reportRows, { rangeLabel: label, business: biz });
    const stamp = (dateFrom || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
    setReport({ doc, filename: `${BRAND_SLUG}-report-${stamp}.pdf`, subtitle: `${rows.length} invoice(s) · ${label}` });
  }

  // Download one PDF report PER CUSTOMER for the current filtered set, zipped and
  // named by customer — so an end-of-day batch can be forwarded to each customer.
  async function downloadPerCustomerZip(rows: Invoice[], label: string) {
    if (!rows.length) { setError("No invoices in view to bundle."); return; }
    setBusy("zip"); setError("");
    try {
      const biz = await loadBusiness();
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      // Group strictly by customer (id when present, else name) — never mixed.
      const groups = new Map<string, Invoice[]>();
      for (const r of rows) {
        const key = r.customer || "Unknown";
        const arr = groups.get(key) ?? []; arr.push(r); groups.set(key, arr);
      }
      const stamp = (dateFrom || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
      const used = new Set<string>();
      for (const [customer, list] of groups) {
        const doc = buildCustomerDayDoc(
          customer,
          list.map((r) => ({ invoiceNo: r.invoiceNo, createdAt: r.createdAt, status: r.status, total: r.total })),
          { dateLabel: label, business: biz },
        );
        let safe = (customer || "customer").replace(/[^\w\- ]/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "customer";
        while (used.has(safe)) safe += "_";
        used.add(safe);
        zip.file(`${safe}_${stamp}.pdf`, doc.output("arraybuffer"));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${BRAND_SLUG}-customer-reports-${stamp}.zip`; a.click();
      URL.revokeObjectURL(url);
      setFlash(`Bundled ${groups.size} customer report(s).`);
    } catch (e) { setError(e instanceof Error ? e.message : "ZIP failed"); } finally { setBusy(""); }
  }

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

  // Undo banner after a removal, so the way back is right where it happened.
  const [removed, setRemoved] = useState<{ id: string; label: string } | null>(null);
  const [undoMsg, setUndoMsg] = useState("");
  useEffect(() => {
    // Deferred a tick: reading this synchronously in the effect body would set
    // state during the effect and cascade a second render.
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive) return;
      const label = new URLSearchParams(window.location.search).get("removed");
      if (!label) return;
      try {
        const raw = sessionStorage.getItem("mi:lastRemovedInvoice");
        const v = raw ? JSON.parse(raw) : null;
        if (v?.id && Date.now() - (v.at ?? 0) < 10 * 60 * 1000) setRemoved({ id: v.id, label: v.label || label });
      } catch { /* ignore */ }
    });
    return () => { alive = false; };
  }, []);

  async function undoRemove() {
    if (!removed) return;
    const res = await fetch(`/api/billing/${encodeURIComponent(removed.id)}`, { method: "PUT" });
    if (res.ok) {
      setUndoMsg(`${removed.label} restored.`);
      setRemoved(null);
      sessionStorage.removeItem("mi:lastRemovedInvoice");
      reload();
    } else {
      const d = await res.json().catch(() => ({}));
      setUndoMsg(d.error || "Couldn't restore it — try Admin → Activity log.");
    }
  }

  return (
    <div className="px-8 py-7 pb-28">
      {removed && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <span className="text-sm text-amber-800 dark:text-amber-300">
            <strong>{removed.label}</strong> removed. It&apos;s hidden from lists and balances — nothing was destroyed.
          </span>
          <button onClick={undoRemove} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-neutral-900 transition hover:bg-amber-400">
            ↩ Undo
          </button>
          <button onClick={() => setRemoved(null)} className="ml-auto text-xs text-amber-700/70 hover:text-amber-900">dismiss</button>
        </div>
      )}
      {undoMsg && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10">{undoMsg}</p>}
      <div className="sticky top-0 z-20 -mx-8 mb-5 border-b border-neutral-200 bg-white/95 px-8 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Invoices</h1>
            <p className="text-sm text-neutral-500">Bills &amp; invoices created from the portal. Click a row to edit.</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <a href="/portal/billing" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900">+ New bill</a>
            <Menu label="Export / Reports">
              <MenuItem onClick={() => openPdfReport(filtered, rangeLabel())}>📄 Sales report PDF</MenuItem>
              <MenuItem onClick={() => downloadPerCustomerZip(filtered, rangeLabel())}>📦 Per-customer PDFs (ZIP)</MenuItem>
              <MenuItem onClick={downloadReport}>📊 Export view to Excel</MenuItem>
              <MenuItem onClick={() => downloadXlsx()}>⬇ Export all to Excel</MenuItem>
            </Menu>
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
          <div className="ml-auto"><ColumnChooser columns={INV_COLUMNS} isVisible={cols.isVisible} toggle={cols.toggle} /></div>
        </div>
        {/* date range */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-neutral-300 p-1 dark:border-neutral-700">
            {([["today", "Today"], ["7d", "7 days"], ["month", "Month"], ["all", "All"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setPreset(k)} className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">{label}</button>
            ))}
          </div>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100" />
          <span className="text-xs text-neutral-400">to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100" />
        </div>
      </div>

      {/* Summary reflects the CURRENT filters/date range, so picking "Last 7 days"
          etc. updates these figures. Outstanding is shown to all staff; the
          sales/earnings totals need finance access. */}
      <div className="mt-5 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Summary · {rangeLabel()}</p>
      </div>
      <div className="mt-2"><FinanceLockBar label="Sales & earnings totals" /></div>
      <div className={`mt-2 grid grid-cols-2 gap-3 ${canSeeFinance ? "sm:grid-cols-4" : "sm:grid-cols-2"}`}>
        <Tile label="Invoices" value={String(rangeStats.count)} sub={`${rangeStats.paidCount} paid · ${rangeStats.openCount} unpaid`} />
        <Tile label="Outstanding" value={`£${rangeStats.outstanding.toFixed(2)}`} sub={`${rangeStats.openCount} unpaid`} accent="amber" />
        {canSeeFinance && <Tile label="Received" value={`£${rangeStats.paid.toFixed(2)}`} sub="paid so far" accent="emerald" />}
        {canSeeFinance && <Tile label="Total billed" value={`£${rangeStats.total.toFixed(2)}`} />}
      </div>

      {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {flash && <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{flash}</p>}

      {/* Persistent action ribbon — always above the table (not a floating-on-select bar) */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-amber-500" />
          {selected.size ? `${selected.size} selected` : "Select all"}
        </label>
        <span className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />
        <div className="flex flex-wrap items-center gap-1">
          <button disabled={!selected.size || bulkBusy} onClick={bulkMarkPaid} className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-200 dark:hover:bg-neutral-800">✓ Mark paid</button>
          <button disabled={!selected.size || bulkBusy} onClick={() => openPdfReport(filtered.filter((i) => selected.has(i.id)), `${selected.size} selected`)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-200 dark:hover:bg-neutral-800">📄 PDF</button>
          <button disabled={!selected.size || bulkBusy} onClick={bulkExport} className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-200 dark:hover:bg-neutral-800">⬇ Excel</button>
          <button disabled={!selected.size || bulkBusy} onClick={bulkDelete} className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-500/10">Delete</button>
        </div>
        {selected.size > 0 && <button onClick={clearSel} className="ml-auto text-xs font-medium text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">Clear</button>}
      </div>

      <div className="mt-2 max-h-[70vh] overflow-auto rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
            <tr>
              <th className="px-4 py-3 w-10"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-amber-500" /></th>
              <th className="px-4 py-3"><button onClick={() => sort.onSort("invoice")} className="uppercase hover:text-neutral-900 dark:hover:text-neutral-200">Invoice{sort.arrow("invoice")}</button></th>
              {cols.isVisible("customer") && <th className="px-4 py-3"><button onClick={() => sort.onSort("customer")} className="uppercase hover:text-neutral-900 dark:hover:text-neutral-200">Customer{sort.arrow("customer")}</button></th>}
              {cols.isVisible("source") && <th className="px-4 py-3"><button onClick={() => sort.onSort("source")} className="uppercase hover:text-neutral-900 dark:hover:text-neutral-200">Source{sort.arrow("source")}</button></th>}
              {cols.isVisible("staff") && <th className="px-4 py-3"><button onClick={() => sort.onSort("staff")} className="uppercase hover:text-neutral-900 dark:hover:text-neutral-200">Staff{sort.arrow("staff")}</button></th>}
              {cols.isVisible("status") && <th className="px-4 py-3"><button onClick={() => sort.onSort("status")} className="uppercase hover:text-neutral-900 dark:hover:text-neutral-200">Status{sort.arrow("status")}</button></th>}
              {cols.isVisible("date") && <th className="px-4 py-3"><button onClick={() => sort.onSort("date")} className="uppercase hover:text-neutral-900 dark:hover:text-neutral-200">Raised{sort.arrow("date")}</button></th>}
              {cols.isVisible("paidOn") && <th className="px-4 py-3 uppercase">Paid on</th>}
              <th className="px-4 py-3 text-right"><button onClick={() => sort.onSort("total")} className="uppercase hover:text-neutral-900 dark:hover:text-neutral-200">Total{sort.arrow("total")}</button></th>
              <th className="px-4 py-3 text-right">Export</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {pageRows.map((inv) => (
              <tr key={inv.id} onClick={() => router.push(`/portal/invoices/${encodeURIComponent(inv.id)}`)} className={`cursor-pointer ${selected.has(inv.id) ? "bg-amber-50 dark:bg-amber-500/10" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40"}`}>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggleRow(inv.id)} className="h-4 w-4 accent-amber-500" /></td>
                <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{inv.invoiceNo}<span className="ml-1 text-xs font-normal text-neutral-400">{inv.name}</span></td>
                {cols.isVisible("customer") && <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">{inv.customer}</td>}
                {cols.isVisible("source") && (
                  <td className="px-4 py-3">
                    {(() => {
                      const s = SEGMENTS.find((x) => x.key === inv.segment);
                      return s ? <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.badge}`}>{s.short}</span> : <span className="text-neutral-300">—</span>;
                    })()}
                  </td>
                )}
                {cols.isVisible("staff") && <td className="px-4 py-3 text-xs text-neutral-500">{inv.staff ? inv.staff.split("@")[0] : "—"}</td>}
                {cols.isVisible("status") && (
                  <td className="px-4 py-3">
                    {(() => {
                      const st = invoiceStatus(inv);
                      return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${STATUS_BADGE[st.tone]}`}>{st.label}</span>;
                    })()}
                  </td>
                )}
                {cols.isVisible("date") && <td className="px-4 py-3 text-neutral-500">{new Date(inv.createdAt).toLocaleDateString("en-GB")}</td>}
                {cols.isVisible("paidOn") && (
                  // Settled date, NOT the raised date — a July bill paid today
                  // reads "09 Aug", which is where that money actually counts.
                  <td className="px-4 py-3 text-neutral-500">
                    {inv.completedAt
                      ? new Date(inv.completedAt).toLocaleDateString("en-GB")
                      : inv.amountPaid > 0.001
                        ? <span className="text-amber-600">part-paid</span>
                        : <span className="text-neutral-300">—</span>}
                  </td>
                )}
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
              <tr><td colSpan={4 + ["customer", "source", "staff", "status", "date"].filter((k) => cols.isVisible(k)).length} className="px-4 py-10 text-center text-neutral-400">{invoices.length === 0 ? "No invoices yet. Create one in Billing / POS." : "No invoices match."}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-neutral-500">
          <span>Show</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          >
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>
            per page · {sorted.length === 0 ? "no invoices" : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, sorted.length)} of ${sorted.length}`}
          </span>
        </div>
        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={safePage === 1} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs disabled:opacity-40 dark:border-neutral-700">« First</button>
            <button onClick={() => setPage(safePage - 1)} disabled={safePage === 1} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs disabled:opacity-40 dark:border-neutral-700">‹ Prev</button>
            <span className="px-3 text-xs text-neutral-500">Page {safePage} of {pageCount}</span>
            <button onClick={() => setPage(safePage + 1)} disabled={safePage === pageCount} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs disabled:opacity-40 dark:border-neutral-700">Next ›</button>
            <button onClick={() => setPage(pageCount)} disabled={safePage === pageCount} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs disabled:opacity-40 dark:border-neutral-700">Last »</button>
          </div>
        )}
      </div>

      {preview && <InvoicePreviewModal invoice={preview.invoice} business={preview.business} onClose={() => setPreview(null)} />}
      {report && <PdfPreviewModal doc={report.doc} filename={report.filename} title="Sales report" subtitle={report.subtitle} onClose={() => setReport(null)} />}
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
