"use client";

import { useEffect, useState } from "react";

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

  return (
    <div className="px-8 py-7">
      <h1 className="text-2xl font-semibold text-neutral-900">Invoices</h1>
      <p className="mt-1 text-sm text-neutral-500">Bills &amp; invoices created from the portal.</p>

      {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-medium text-neutral-900">{inv.name}</td>
                <td className="px-4 py-3 text-neutral-600">{inv.customer}</td>
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
                <td className="px-4 py-3 text-right font-medium text-neutral-900">£{inv.total}</td>
                <td className="px-4 py-3 text-right">
                  {inv.invoiceUrl && (
                    <a className="text-sm text-amber-600 underline" href={inv.invoiceUrl} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  )}
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
