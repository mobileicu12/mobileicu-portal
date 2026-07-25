"use client";

import { useEffect, useRef, useState } from "react";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";
import { priceForContext, type TierPrices } from "@/lib/pricing";
import InvoicePreviewModal from "@/components/InvoicePreviewModal";
import { loadBusiness, type Business } from "@/lib/business";
import type { InvoiceDetail } from "@/lib/billing";

const VAT_RATE = 0.2;

type Hit = {
  variantId: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  price: string;
  image: string | null;
  available: number;
  tiers?: TierPrices;
};

type Line = {
  variantId: string;
  title: string;
  sku: string;
  price: number;
  qty: number;
  image: string | null;
  base: number; // catalog online/retail price (0 for custom items)
  tiers?: TierPrices; // channel prices, for auto-repricing when Source changes
};

type BillResult = {
  id: string;
  invoiceNo?: string;
  name: string;
  invoiceUrl: string | null;
  completed: boolean;
};

export default function BillingPage() {
  const [mode, setMode] = useState<"invoice" | "pos">("invoice");
  const [segment, setSegment] = useState<SegmentKey>("online");
  const [vat, setVat] = useState(true);
  const [discount, setDiscount] = useState(0);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  // Walk-in / one-off customer details (POS, no registered account).
  const [walkName, setWalkName] = useState("");
  const [walkPhone, setWalkPhone] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [custQ, setCustQ] = useState("");
  const [custHits, setCustHits] = useState<{ id: string; name: string; company: string }[]>([]);
  const custDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [custOutstanding, setCustOutstanding] = useState<number | null>(null);
  const [custIsOnline, setCustIsOnline] = useState(false);
  const [received, setReceived] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  // Open (unpaid) invoices for the selected customer — lets you add to a running tab.
  const [openInvoices, setOpenInvoices] = useState<{ id: string; name: string; invoiceNo?: string; total: string; balance: number; createdAt: string }[]>([]);
  const [addToInvoiceId, setAddToInvoiceId] = useState("");

  // Load the selected customer's account outstanding + whether they're Online/Registered.
  useEffect(() => {
    if (!customerId) { setCustOutstanding(null); setCustIsOnline(false); setOpenInvoices([]); setAddToInvoiceId(""); return; }
    const numId = customerId.split("/").pop();
    fetch(`/api/customers/${numId}`)
      .then((r) => r.json())
      .then((d) => {
        const c = d.customer;
        if (!c) { setCustOutstanding(null); setCustIsOnline(false); setOpenInvoices([]); return; }
        // Owed = opening balance + still-unpaid invoice balances − on-account payments.
        // (A completed invoice already counts as paid, so use its balance, not total.)
        const invoiceDue = (c.invoices ?? []).reduce((s: number, i: { balance?: number }) => s + Number(i.balance || 0), 0);
        const ledgerPaid = (c.ledger?.payments ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount || 0), 0);
        setCustOutstanding((c.openingBalance || 0) + invoiceDue - ledgerPaid);
        setCustIsOnline((c.segments ?? []).includes("online"));
        // Today's draft (unpaid) invoices this customer can add more items to (a running tab).
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        setOpenInvoices(
          (c.invoices ?? [])
            .filter((i: { status: string; createdAt: string }) => i.status !== "COMPLETED" && new Date(i.createdAt) >= startOfToday)
            .map((i: { id: string; name: string; total: string; balance: number; createdAt: string }) => ({ id: i.id, name: i.name, total: i.total, balance: i.balance, createdAt: i.createdAt })),
        );
        setAddToInvoiceId("");
      })
      .catch(() => { setCustOutstanding(null); setCustIsOnline(false); setOpenInvoices([]); });
  }, [customerId]);

  // Pre-fill customer from ?customer=<id> (e.g. coming from a customer page).
  useEffect(() => {
    const cid = new URLSearchParams(window.location.search).get("customer");
    if (!cid) return;
    fetch(`/api/customers/${cid}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.customer) {
          setCustomerId(d.customer.id);
          setCustomerName(d.customer.company ? `${d.customer.name} (${d.customer.company})` : d.customer.name);
        }
      })
      .catch(() => {});
  }, []);

  function onCustSearch(v: string) {
    setCustQ(v);
    if (custDebounce.current) clearTimeout(custDebounce.current);
    if (!v.trim()) {
      setCustHits([]);
      return;
    }
    custDebounce.current = setTimeout(async () => {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(v)}`);
      const d = await res.json();
      setCustHits((d.customers ?? []).map((c: { id: string; name: string; company: string }) => ({ id: c.id, name: c.name, company: c.company })));
    }, 300);
  }

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BillResult | null>(null);
  const [resultBusy, setResultBusy] = useState("");
  const [preview, setPreview] = useState<{ invoice: InvoiceDetail; business: Business } | null>(null);

  // Open the branded PDF of the bill we just created (preview → download / print / share).
  async function openInvoicePdf() {
    if (!result) return;
    setResultBusy("pdf"); setError("");
    try {
      const [res, biz] = await Promise.all([fetch(`/api/billing/${encodeURIComponent(result.id)}`), loadBusiness()]);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to load invoice");
      setPreview({ invoice: d.invoice as InvoiceDetail, business: biz });
    } catch (e) { setError(e instanceof Error ? e.message : "PDF failed"); } finally { setResultBusy(""); }
  }

  // Mark a just-created (draft) invoice as PAID — for a customer who paid in person.
  async function markResultPaid() {
    if (!result) return;
    if (!confirm("Mark this invoice as PAID? This records the sale and deducts stock.")) return;
    setResultBusy("paid"); setError("");
    try {
      const res = await fetch(`/api/billing/${encodeURIComponent(result.id)}/action`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setResult({ ...result, completed: true });
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setResultBusy(""); }
  }

  function onSearch(value: string) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setHits([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/variants?q=${encodeURIComponent(value)}`);
        const d = await res.json();
        setHits(d.hits ?? []);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  // Which price tier is active for the current mode/source, and its label.
  const wholesale = mode === "invoice";
  const priceCtx = { wholesale, segment };
  const activeTierLabel = wholesale
    ? "Wholesale"
    : segment === "shop" ? "In-shop / offline"
    : segment === "ebay" ? "eBay"
    : segment === "amazon" ? "Amazon"
    : "Online / retail (base)";

  function addLine(h: Hit) {
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === h.variantId);
      if (existing) {
        return prev.map((l) => (l.variantId === h.variantId ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          variantId: h.variantId,
          title: h.variantTitle ? `${h.productTitle} — ${h.variantTitle}` : h.productTitle,
          sku: h.sku,
          price: priceForContext(h.price, h.tiers, priceCtx),
          qty: 1,
          image: h.image,
          base: Number(h.price) || 0,
          tiers: h.tiers,
        },
      ];
    });
    setQ("");
    setHits([]);
  }

  // When the sales Source (or wholesale/POS mode) changes, re-price catalog lines
  // to the matching tier. Custom items (no tiers) are left untouched.
  useEffect(() => {
    setLines((prev) => {
      let changed = false;
      const next = prev.map((l) => {
        if (l.variantId.startsWith("custom:") || !l.tiers) return l;
        const p = priceForContext(l.base, l.tiers, { wholesale, segment });
        if (p === l.price) return l;
        changed = true;
        return { ...l, price: p };
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, segment]);

  function updateQty(id: string, qty: number) {
    setLines((prev) => prev.map((l) => (l.variantId === id ? { ...l, qty: Math.max(1, qty) } : l)));
  }
  function updatePrice(id: string, price: number) {
    setLines((prev) => prev.map((l) => (l.variantId === id ? { ...l, price: Math.max(0, price) } : l)));
  }
  function updateTitle(id: string, title: string) {
    setLines((prev) => prev.map((l) => (l.variantId === id ? { ...l, title } : l)));
  }
  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.variantId !== id));
  }
  function addCustomLine() {
    const tempId = `custom:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    setLines((prev) => [...prev, { variantId: tempId, title: "", sku: "", price: 0, qty: 1, image: null, base: 0 }]);
  }

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const discountAmt = subtotal * (discount / 100);
  const net = subtotal - discountAmt;
  const vatAmt = vat ? net * VAT_RATE : 0;
  const total = net + vatAmt;

  // Clear the whole bill back to a fresh slate after a sale is created.
  function resetForm() {
    setLines([]);
    setDiscount(0);
    setEmail("");
    setNote("");
    setReceived("");
    setWalkName("");
    setWalkPhone("");
    setQ("");
    setHits([]);
    setCustQ("");
    setCustHits([]);
    setCustomerId("");
    setCustomerName("");
    setAddToInvoiceId("");
  }

  async function submit() {
    if (lines.length === 0) {
      setError("Add at least one product.");
      return;
    }
    if (mode === "invoice" && !customerId) {
      setError("Wholesale invoices are for registered customers only — select a customer, or switch to POS for a walk-in sale.");
      return;
    }
    if (mode === "invoice" && !custIsOnline) {
      setError("Wholesale is for Online / Registered customers only. Set this customer's segment to 'Online / Registered', or use POS.");
      return;
    }
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      // "Open tab": append these items to the customer's existing draft invoice.
      if (mode === "invoice" && addToInvoiceId) {
        const newLines = lines.map((l) => {
          const custom = l.variantId.startsWith("custom:");
          return { variantId: custom ? null : l.variantId, quantity: l.qty, unitPrice: l.price, title: l.title, custom };
        });
        const detRes = await fetch(`/api/billing/${encodeURIComponent(addToInvoiceId)}`);
        const det = await detRes.json();
        if (!detRes.ok) throw new Error(det.error || "Couldn't load the open invoice.");
        const inv = det.invoice as InvoiceDetail;
        // Merge: same catalog variant → add quantity; custom items always appended.
        const merged = inv.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: Number(l.unitPrice), title: l.title, custom: !l.variantId }));
        for (const nl of newLines) {
          const hit = nl.variantId ? merged.find((m) => m.variantId === nl.variantId) : null;
          if (hit) hit.quantity += nl.quantity;
          else merged.push(nl);
        }
        const upRes = await fetch(`/api/billing/${encodeURIComponent(addToInvoiceId)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: merged, vat, customerId, email, note, discountPercent: discount }),
        });
        const upd = await upRes.json();
        if (!upRes.ok) throw new Error(upd.error || "Failed to add to the open invoice.");
        setResult({ ...upd, completed: false });
        resetForm();
        setSubmitting(false);
        return;
      }

      // Full payment for THIS bill collected now → complete it (marks paid, shows PAID on print).
      const payThisBillInFull = (Number(received) || 0) >= total && total > 0;

      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => {
            const custom = l.variantId.startsWith("custom:");
            return { variantId: custom ? null : l.variantId, quantity: l.qty, unitPrice: l.price, title: l.title, custom };
          }),
          vat,
          email,
          customerId,
          customerName: !customerId ? walkName : undefined,
          customerPhone: !customerId ? walkPhone : undefined,
          note,
          discountPercent: discount,
          // Auto-mark PAID when the full amount for this bill is collected now.
          complete: mode === "pos" || payThisBillInFull,
          segment,
          payMethod,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");

      // Record the amount received against the customer's account.
      // When the bill itself is settled (completed), the invoice already counts as
      // paid — so only ledger any surplus that clears OLDER dues (avoids double-count).
      const recv = Number(received) || 0;
      if (customerId && recv > 0) {
        const toLedger = (mode === "pos" || payThisBillInFull) ? Math.max(0, recv - total) : recv;
        if (toLedger > 0) {
          const numId = customerId.split("/").pop();
          await fetch(`/api/customers/${numId}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: toLedger, method: payMethod, note: `Payment with ${d.invoiceNo || d.name || "sale"}`, date: new Date().toISOString() }),
          }).catch(() => {});
        }
        setCustOutstanding((prev) => (prev ?? 0) + total - recv);
      }

      setResult(d);
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-8 py-7 pb-16">
      <div className="sticky top-0 z-20 -mx-8 mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 bg-white/95 px-8 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Billing / POS</h1>
        <div className="flex rounded-lg border border-neutral-300 p-1 dark:border-neutral-700">
          <button
            onClick={() => { setMode("invoice"); setSegment("online"); }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${mode === "invoice" ? "bg-neutral-900 text-white" : "text-neutral-600 dark:text-neutral-300"}`}
          >
            Wholesale invoice
          </button>
          <button
            onClick={() => { setMode("pos"); setSegment("shop"); }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${mode === "pos" ? "bg-neutral-900 text-white" : "text-neutral-600 dark:text-neutral-300"}`}
          >
            POS (instant sale)
          </button>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{result.completed ? "✓ Sale completed (paid)" : "Invoice created"} — <strong>{result.invoiceNo || result.name}</strong>.</span>
            {result.invoiceUrl && <a className="underline" href={result.invoiceUrl} target="_blank" rel="noreferrer">Open in Shopify</a>}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={openInvoicePdf} disabled={!!resultBusy} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-50">{resultBusy === "pdf" ? "…" : "📄 Invoice PDF"}</button>
            {!result.completed && (
              <button onClick={markResultPaid} disabled={!!resultBusy} className="rounded-lg border border-emerald-400 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">{resultBusy === "paid" ? "…" : "✓ Paid in person (mark paid)"}</button>
            )}
            <button onClick={() => { setResult(null); setError(""); }} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">+ New bill</button>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* Left: search + lines */}
        <div className="lg:col-span-2">
          <div className="relative">
            <input
              value={q}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search product or SKU to add…"
              className="w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
            {(hits.length > 0 || searching) && (
              <div className="absolute z-10 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
                {searching && <p className="px-4 py-3 text-sm text-neutral-400">Searching…</p>}
                {hits.map((h) => (
                  <button
                    key={h.variantId}
                    onClick={() => addLine(h)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-50"
                  >
                    {h.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.image} alt="" className="h-9 w-9 rounded border border-neutral-200 object-cover" />
                    ) : (
                      <div className="h-9 w-9 rounded bg-neutral-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900">
                        {h.productTitle}
                        {h.variantTitle ? ` — ${h.variantTitle}` : ""}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {h.sku || "no SKU"} · {h.available} in stock
                      </p>
                    </div>
                    <span className="text-sm font-medium text-neutral-700">£{h.price}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 w-24">Qty</th>
                  <th className="px-4 py-3 text-right">Unit Price</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {lines.map((l) => {
                  const custom = l.variantId.startsWith("custom:");
                  return (
                  <tr key={l.variantId}>
                    <td className="px-4 py-3">
                      {custom ? (
                        <input value={l.title} onChange={(e) => updateTitle(l.variantId, e.target.value)} placeholder="Custom item name…" className="w-full rounded-lg border border-dashed border-amber-400 bg-amber-50/40 px-2 py-1.5 text-sm" />
                      ) : (
                        <>
                          <p className="font-medium text-neutral-900">{l.title}</p>
                          <p className="text-xs text-neutral-500">{l.sku}</p>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) => updateQty(l.variantId, Number(e.target.value))}
                        className="w-20 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-neutral-400">£</span>
                        <input type="number" min={0} step="0.01" value={l.price} onChange={(e) => updatePrice(l.variantId, Number(e.target.value))} className="w-24 rounded-lg border border-neutral-300 px-2 py-1.5 text-right text-sm" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900">£{(l.price * l.qty).toFixed(2)}</td>
                    <td className="px-2 py-3 text-right">
                      <button onClick={() => removeLine(l.variantId)} className="text-neutral-400 hover:text-red-600">✕</button>
                    </td>
                  </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-neutral-400">
                      Search above to add products, or add a custom item.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <button onClick={addCustomLine} className="mt-3 rounded-lg border border-dashed border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-amber-500 hover:text-amber-600">
            + Add custom item (labour, service, one-off…)
          </button>
        </div>

        {/* Right: summary */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-neutral-900">Summary</h2>

          <label className="mt-4 block text-sm">
            <span className="font-medium text-neutral-700">Source</span>
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value as SegmentKey)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              {SEGMENTS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-neutral-500">
              Prices auto-fill from the <strong className="text-amber-600">{activeTierLabel}</strong> tier{wholesale ? " (wholesale invoice)" : ""}. Blank tiers use the online price; you can still edit any line.
            </span>
          </label>

          <label className="mt-3 flex items-center justify-between text-sm">
            <span className="font-medium text-neutral-700">Charge VAT (20%)</span>
            <input type="checkbox" checked={vat} onChange={(e) => setVat(e.target.checked)} className="h-4 w-4" />
          </label>

          <label className="mt-3 block text-sm">
            <span className="flex items-center justify-between font-medium text-neutral-700">
              <span>Discount %</span>
              {discount > 0 && <span className="text-xs font-normal text-amber-600">= £{discountAmt.toFixed(2)} off</span>}
            </span>
            <input
              type="number"
              min={0}
              max={100}
              value={discount}
              onChange={(e) => setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="mt-3 text-sm">
            <span className="font-medium text-neutral-700">Customer</span>
            {customerId ? (
              <div className="mt-1 flex items-center justify-between rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2">
                <span className="text-neutral-800">{customerName}</span>
                <button
                  onClick={() => { setCustomerId(""); setCustomerName(""); setCustQ(""); }}
                  className="text-xs text-neutral-400 hover:text-red-600"
                >
                  change
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={custQ}
                  onChange={(e) => onCustSearch(e.target.value)}
                  placeholder="Search a registered customer…"
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
                {custHits.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
                    {custHits.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setCustomerId(c.id);
                          setCustomerName(c.company ? `${c.name} (${c.company})` : c.name);
                          setCustHits([]);
                          setCustQ("");
                        }}
                        className="block w-full px-3 py-2 text-left hover:bg-neutral-50"
                      >
                        <span className="font-medium text-neutral-900">{c.name || "(no name)"}</span>
                        {c.company && <span className="text-neutral-500"> · {c.company}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {mode === "invoice" && customerId && openInvoices.length > 0 && (
              <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-3">
                <p className="text-xs font-medium text-sky-700">This customer has {openInvoices.length} open invoice{openInvoices.length === 1 ? "" : "s"} from today — add these items to a running tab, or start a new one:</p>
                <select value={addToInvoiceId} onChange={(e) => setAddToInvoiceId(e.target.value)} className="mt-1 w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm">
                  <option value="">➕ Create a new invoice</option>
                  {openInvoices.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} · {new Date(i.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} — £{i.total}{i.balance > 0.001 ? ` (£${i.balance.toFixed(2)} due)` : ""}</option>
                  ))}
                </select>
              </div>
            )}
            {mode === "pos" && !customerId && (
              <div className="mt-2 space-y-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3">
                <p className="text-xs font-medium text-neutral-500">Walk-in / one-off customer <span className="font-normal">(optional — no account needed)</span></p>
                <input value={walkName} onChange={(e) => setWalkName(e.target.value)} placeholder="Customer name" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
                <div className="flex gap-2">
                  <input value={walkPhone} onChange={(e) => setWalkPhone(e.target.value)} placeholder="Phone" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
                </div>
              </div>
            )}
          </div>

          <label className="mt-3 block text-sm">
            <span className="font-medium text-neutral-700">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="mt-4 space-y-1.5 border-t border-neutral-200 pt-4 text-sm">
            <Row label="Subtotal" value={subtotal} />
            {discount > 0 && <Row label={`Discount (${discount}%)`} value={-discountAmt} />}
            {vat && <Row label="VAT (20%)" value={vatAmt} />}
            <div className="flex items-center justify-between border-t border-neutral-200 pt-2 text-base font-semibold text-neutral-900">
              <span>This bill</span>
              <span>£{total.toFixed(2)}</span>
            </div>
          </div>

          {/* How the sale was paid (POS) */}
          {mode === "pos" && (
            <div className="mt-3">
              <span className="text-sm font-medium text-neutral-700">Paid by</span>
              <div className="mt-1 flex rounded-lg border border-neutral-300 p-1">
                {(["cash", "card", "bank transfer", "other"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setPayMethod(m)} className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize ${payMethod === m ? "bg-neutral-900 text-white" : "text-neutral-600"}`}>{m === "bank transfer" ? "Bank" : m}</button>
                ))}
              </div>
            </div>
          )}

          {/* Account payment (registered customer) */}
          {customerId && (
            <div className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-neutral-600">Old outstanding</span>
                <span className="font-medium text-neutral-900">£{(custOutstanding ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between font-medium text-neutral-800">
                <span>Total due (old + this bill)</span>
                <span>£{((custOutstanding ?? 0) + total).toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span className="shrink-0 text-neutral-600">Received now £</span>
                <input type="number" step="0.01" value={received} onChange={(e) => setReceived(e.target.value)} placeholder="0.00" className="w-24 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" />
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm">
                  <option value="cash">Cash</option><option value="card">Card</option><option value="bank transfer">Bank</option><option value="cheque">Cheque</option>
                </select>
                <button type="button" onClick={() => setReceived(((custOutstanding ?? 0) + total).toFixed(2))} className="text-xs text-amber-600 hover:underline">pay all</button>
              </div>
              <div className="flex items-center justify-between border-t border-amber-200 pt-2 text-base font-semibold">
                <span className="text-neutral-700">New outstanding</span>
                <span className={((custOutstanding ?? 0) + total - Number(received || 0)) > 0.001 ? "text-red-600" : "text-emerald-600"}>£{Math.max(0, (custOutstanding ?? 0) + total - Number(received || 0)).toFixed(2)}</span>
              </div>
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting || lines.length === 0}
            className="mt-5 w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60"
          >
            {submitting
              ? "Processing…"
              : mode === "pos"
                ? `Charge £${total.toFixed(2)} & complete`
                : addToInvoiceId
                  ? `Add £${total.toFixed(2)} to open invoice`
                  : "Create invoice"}
          </button>
          <p className="mt-2 text-xs text-neutral-400">
            {mode === "pos"
              ? "Completes the sale immediately and deducts stock."
              : "Creates a draft invoice you can send or take payment on later."}
          </p>
        </div>
      </div>

      {preview && <InvoicePreviewModal invoice={preview.invoice} business={preview.business} onClose={() => setPreview(null)} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-neutral-600">
      <span>{label}</span>
      <span>£{value.toFixed(2)}</span>
    </div>
  );
}
