"use client";

import { useEffect, useState } from "react";
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

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>(""); // invoice id currently exporting

  useEffect(() => {
    fetch("/api/billing")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        setInvoices(d.invoices ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function downloadPdf(inv: Invoice) {
    setBusy(inv.id + ":pdf");
    setError("");
    try {
      const res = await fetch(`/api/billing/${encodeURIComponent(inv.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load invoice");
      generateInvoicePdf(data.invoice as InvoiceDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF failed");
    } finally {
      setBusy("");
    }
  }

  function downloadXlsx(id?: string) {
    const url = id ? `/api/billing/export?id=${encodeURIComponent(id)}` : "/api/billing/export";
    window.location.href = url;
  }

  return (
    <div className="px-8 py-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Invoices</h1>
          <p className="mt-1 text-sm text-neutral-500">Bills &amp; invoices created from the portal.</p>
        </div>
        <button
          onClick={() => downloadXlsx()}
          disabled={invoices.length === 0}
          className="shrink-0 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        >
          ⬇ Export all (Excel)
        </button>
      </div>

      {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
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
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{inv.name}</td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">{inv.customer}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      inv.status === "COMPLETED"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {inv.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {new Date(inv.createdAt).toLocaleDateString("en-GB")}
                </td>
                <td className="px-4 py-3 text-right font-medium text-neutral-900 dark:text-neutral-100">£{inv.total}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => downloadPdf(inv)}
                      disabled={busy === inv.id + ":pdf"}
                      className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-50"
                    >
                      {busy === inv.id + ":pdf" ? "…" : "PDF"}
                    </button>
                    <button
                      onClick={() => downloadXlsx(inv.id)}
                      className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-semibold text-neutral-700 transition hover:border-neutral-900 dark:border-neutral-700 dark:text-neutral-200"
                    >
                      Excel
                    </button>
                    {inv.invoiceUrl && (
                      <a
                        className="rounded-md px-2 py-1 text-xs font-semibold text-amber-600 underline"
                        href={inv.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-neutral-400">
                  No invoices yet. Create one in Billing / POS.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
