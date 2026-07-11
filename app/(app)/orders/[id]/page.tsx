"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";

type Line = { title: string; sku: string; quantity: number; unitPrice: string; lineTotal: string; image: string | null };
type Detail = {
  id: string;
  name: string;
  createdAt: string;
  customer: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string[];
  financialStatus: string;
  fulfillmentStatus: string;
  source: string;
  segment: SegmentKey | null;
  note: string;
  currency: string;
  lines: Line[];
  subtotal: string;
  shipping: string;
  tax: string;
  total: string;
};

function pretty(s: string) {
  return s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [o, setO] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/orders/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setO(d.order);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="px-8 py-7 text-sm text-neutral-400">Loading order…</div>;
  if (error) return <div className="px-8 py-7"><p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p></div>;
  if (!o) return null;

  const seg = SEGMENTS.find((x) => x.key === o.segment);

  return (
    <div className="px-8 py-7">
      <Link href="/orders" className="text-sm text-neutral-500 hover:text-amber-600">← All orders</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{o.name}</h1>
        {seg && <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${seg.badge}`}>{seg.label}</span>}
        <span className="text-sm text-neutral-400">{new Date(o.createdAt).toLocaleString("en-GB")}</span>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 w-16 text-center">Qty</th>
                  <th className="px-4 py-3 text-right">Unit</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {o.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {l.image ? <img src={l.image} alt="" className="h-9 w-9 rounded border border-neutral-200 object-cover" /> : <div className="h-9 w-9 rounded bg-neutral-100" />}
                        <div>
                          <p className="font-medium text-neutral-900 dark:text-neutral-100">{l.title}</p>
                          <p className="text-xs text-neutral-500">{l.sku || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">{l.quantity}</td>
                    <td className="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300">£{Number(l.unitPrice).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900 dark:text-neutral-100">£{Number(l.lineTotal).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {o.note && <p className="mt-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"><strong>Note:</strong> {o.note}</p>}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Status</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">Payment: {pretty(o.financialStatus)}</span>
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">{pretty(o.fulfillmentStatus)}</span>
            </div>
            <p className="mt-2 text-xs text-neutral-400">Source: {o.source}</p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Customer</h2>
            <p className="mt-2 font-medium text-neutral-900 dark:text-neutral-100">{o.customer}</p>
            {o.customerEmail && <p className="text-sm text-neutral-500">{o.customerEmail}</p>}
            {o.customerPhone && <p className="text-sm text-neutral-500">{o.customerPhone}</p>}
            {o.shippingAddress.length > 0 && (
              <p className="mt-2 text-sm text-neutral-500">{o.shippingAddress.join(", ")}</p>
            )}
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Totals</h2>
            <div className="mt-2 space-y-1.5 text-sm">
              <Row label="Subtotal" value={o.subtotal} />
              <Row label="Shipping" value={o.shipping} />
              <Row label="Tax" value={o.tax} />
              <div className="flex items-center justify-between border-t border-neutral-200 pt-2 text-base font-semibold text-neutral-900 dark:border-neutral-800 dark:text-neutral-100">
                <span>Total</span><span>£{Number(o.total).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
      <span>{label}</span>
      <span>£{Number(value).toFixed(2)}</span>
    </div>
  );
}
