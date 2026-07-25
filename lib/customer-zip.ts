// Client-side: bundle today's per-customer day statements into a single ZIP,
// each file named by the customer. Used by the invoices page and the header
// "download today's reports" button (no email/WhatsApp wiring needed).
"use client";

import { buildCustomerDayDoc } from "./report-pdf";
import { loadBusiness } from "./business";

type Row = { invoiceNo: string; name: string; customer: string; customerId: string | null; status: string; total: string; createdAt: string };

export async function downloadCustomerReportsZip(opts: { onlyToday?: boolean } = {}): Promise<{ customers: number }> {
  const res = await fetch("/api/billing");
  const d = await res.json().catch(() => null);
  if (!res.ok || !d?.invoices) throw new Error(d?.error || "Couldn't load invoices.");
  let rows = d.invoices as Row[];
  if (opts.onlyToday !== false) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    rows = rows.filter((r) => new Date(r.createdAt) >= start);
  }
  if (!rows.length) throw new Error("No invoices for today yet.");

  const biz = await loadBusiness();
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  // Group strictly by customer (never mixed).
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.customer || "Unknown";
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const label = new Date().toLocaleDateString("en-GB");
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
  a.href = url; a.download = `mobileicu-customer-reports-${stamp}.zip`; a.click();
  URL.revokeObjectURL(url);
  return { customers: groups.size };
}
