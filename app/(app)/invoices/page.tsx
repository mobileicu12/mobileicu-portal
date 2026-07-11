"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import type { InvoiceDetail } from "@/lib/billing";

type Invoice = {
  id: string;
  name: string;
  customer: string;
  status: string;
  total: string;
  createdAt: string;
  invoiceUrl: string | null;
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

  useEffect(() => {
    fetch("/api/billing")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        setInvoices(d.invoices ?? []);
        setStats(d.stats ?? null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter === "open" && inv.status === "COMPLETED") return false;
      if (statusFilter === "paid" && inv.status !== "COMPLETED") return false;
      if (!s) return true;
      return inv.name.toLowerCase().includes(s) || inv.customer.toLowerCase().includes(s);
    });
  }, [invoices, search, statusFilter]);

  async function downloadPdf(e: React.MouseEvent, inv: Invoice) {
    e.stopPropagation();
    setBusy(inv.id + ":pdf");
    setError("");
    try {
      const res = await fetch(`/api/billing/${encodeURIComponent(inv.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load invoice");
      generateInvoicePdf(data.invoice as InvoiceDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF failed");
    } finally {
      setBusy("");
    }
  }

  function downloadXlsx(id?: string) {
    window.location.href = id ? `/api/billing/export?id=${encodeURIComponent(id)}` : "/api/billing/export";
  }

  return (
    <div className="px-8 py-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Invoices</h1>
          <p className="mt-1 text-sm text-neutral-500">Bills &amp; invoices created from the portal. Click a row to edit.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <a href="/billing" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900">+ New bill</a>
          <button onClick={() => downloadXlsx()} disabled={invoices.length === 0} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">⬇ Export all</button>
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

      {/* controls */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoice # or customer…"
          className="w-64 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
        <div className="flex rounded-lg border border-neutral-300 p-1 dark:border-neutral-700">
          {(["all", "open", "paid"] as const).map((f) => (
            <button key={f} onClick={() => setStatusFilter(f)} className={`rounded-md px-3 py-1 text-sm font-medium capitalize ${statusFilter === f ? "bg-neutral-900 text-white" : "text-neutral-600 dark:text-neutral-300"}`}>{f}</button>
          ))}
        </div>
        <span className="text-sm text-neutral-400">{filtered.length} shown</span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Export</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filtered.map((inv) => (
              <tr key={inv.id} onClick={() => router.push(`/invoices/${encodeURIComponent(inv.id)}`)} className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{inv.name}</td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">{inv.customer}</td>
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
              <tr><td colSpan={6} className="px-4 py-10 text-center text-neutral-400">{invoices.length === 0 ? "No invoices yet. Create one in Billing / POS." : "No invoices match."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
