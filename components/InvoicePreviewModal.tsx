"use client";

import { useEffect, useState } from "react";
import { buildInvoiceDoc, invoiceFilename } from "@/lib/invoice-pdf";
import type { InvoiceDetail } from "@/lib/billing";
import type { Business } from "@/lib/business";

export default function InvoicePreviewModal({ invoice, business, onClose }: { invoice: InvoiceDetail; business: Business; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [emailing, setEmailing] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const blob = buildInvoiceDoc(invoice, business).output("blob");
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [invoice, business]);

  function download() {
    buildInvoiceDoc(invoice, business).save(invoiceFilename(invoice, business));
  }

  async function email() {
    const to = window.prompt("Email this invoice to:", invoice.customerEmail || "");
    if (to === null) return;
    setEmailing(true); setMsg("");
    try {
      const res = await fetch(`/api/billing/${encodeURIComponent(invoice.id)}/action`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", to }),
      });
      const d = await res.json();
      setMsg(res.ok ? `✓ Invoice emailed${to ? ` to ${to}` : ""}.` : (d.error || "Send failed."));
    } catch {
      setMsg("Send failed.");
    } finally {
      setEmailing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-5 py-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">Invoice {invoice.invoiceNo}</h3>
            <p className="text-xs text-neutral-400">Preview before you download or send</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={email} disabled={emailing} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-neutral-900 disabled:opacity-50">{emailing ? "Sending…" : "✉ Email"}</button>
            <button onClick={download} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900">⬇ Download</button>
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-900">Close</button>
          </div>
        </div>
        {msg && <p className={`px-5 py-2 text-sm ${msg.startsWith("✓") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{msg}</p>}
        <div className="flex-1 bg-neutral-100">
          {url ? <iframe src={url} title="Invoice preview" className="h-full w-full" /> : <div className="flex h-full items-center justify-center text-sm text-neutral-400">Rendering…</div>}
        </div>
      </div>
    </div>
  );
}
