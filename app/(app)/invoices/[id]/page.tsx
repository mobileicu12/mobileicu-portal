"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import type { InvoiceDetail } from "@/lib/billing";

const VAT_RATE = 0.2;

type Line = {
  variantId: string | null;
  title: string;
  sku: string;
  price: number;
  qty: number;
  image: string | null;
};

type Hit = {
  variantId: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  price: string;
  image: string | null;
  available: number;
};

export default function InvoiceEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const encId = encodeURIComponent(id);

  const [meta, setMeta] = useState<InvoiceDetail | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [vat, setVat] = useState(true);
  const [discount, setDiscount] = useState(0);
  const [note, setNote] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [dirty, setDirty] = useState(false);

  const completed = meta?.status === "COMPLETED";
  const readOnly = completed;

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/billing/${encId}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to load");
      const inv = d.invoice as InvoiceDetail;
      setMeta(inv);
      setLines(
        inv.lines.map((l) => ({
          variantId: l.variantId,
          title: l.title,
          sku: l.sku,
          price: Number(l.unitPrice),
          qty: l.quantity,
          image: l.image,
        })),
      );
      setVat(!inv.taxExempt);
      setDiscount(inv.subtotal && Number(inv.subtotal) > 0 ? Math.round((Number(inv.discount) / Number(inv.subtotal)) * 100) : 0);
      setNote(inv.note);
      setEmail(inv.customerEmail);
      setCustomerName(inv.customerName !== "—" ? inv.customerName : "");
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // --- product search ---
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onSearch(v: string) {
    setQ(v);
    if (debounce.current) clearTimeout(debounce.current);
    if (!v.trim()) return setHits([]);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/variants?q=${encodeURIComponent(v)}`);
        const d = await res.json();
        setHits(d.hits ?? []);
      } finally {
        setSearching(false);
      }
    }, 300);
  }
  function addLine(h: Hit) {
    setLines((prev) => {
      const ex = prev.find((l) => l.variantId === h.variantId);
      if (ex) return prev.map((l) => (l.variantId === h.variantId ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { variantId: h.variantId, title: h.variantTitle ? `${h.productTitle} — ${h.variantTitle}` : h.productTitle, sku: h.sku, price: Number(h.price), qty: 1, image: h.image }];
    });
    setQ("");
    setHits([]);
    setDirty(true);
  }

  // --- customer search ---
  const [custQ, setCustQ] = useState("");
  const [custHits, setCustHits] = useState<{ id: string; name: string; company: string }[]>([]);
  const custDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onCustSearch(v: string) {
    setCustQ(v);
    if (custDebounce.current) clearTimeout(custDebounce.current);
    if (!v.trim()) return setCustHits([]);
    custDebounce.current = setTimeout(async () => {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(v)}`);
      const d = await res.json();
      setCustHits((d.customers ?? []).map((c: { id: string; name: string; company: string }) => ({ id: c.id, name: c.name, company: c.company })));
    }, 300);
  }

  function updateQty(vid: string | null, qty: number) {
    setLines((prev) => prev.map((l) => (l.variantId === vid ? { ...l, qty: Math.max(1, qty) } : l)));
    setDirty(true);
  }
  function updatePrice(vid: string | null, price: number) {
    setLines((prev) => prev.map((l) => (l.variantId === vid ? { ...l, price: Math.max(0, price) } : l)));
    setDirty(true);
  }
  function removeLine(vid: string | null) {
    setLines((prev) => prev.filter((l) => l.variantId !== vid));
    setDirty(true);
  }

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const discountAmt = subtotal * (discount / 100);
  const net = subtotal - discountAmt;
  const vatAmt = vat ? net * VAT_RATE : 0;
  const total = net + vatAmt;
  const hasCustomLine = lines.some((l) => !l.variantId);

  async function save() {
    if (lines.length === 0) return setError("An invoice needs at least one product.");
    if (hasCustomLine) return setError("This invoice has a manual line item — edit it in Shopify admin.");
    setBusy("save");
    setError(""); setMsg("");
    try {
      const res = await fetch(`/api/billing/${encId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.qty, unitPrice: l.price })),
          vat, customerId, email, note, discountPercent: discount,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Save failed");
      setMsg("Saved.");
      setDirty(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy("");
    }
  }

  async function doAction(action: "complete" | "duplicate", extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(""); setMsg("");
    try {
      const res = await fetch(`/api/billing/${encId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Action failed");
      if (action === "duplicate" && d.id) {
        router.push(`/invoices/${encodeURIComponent(d.id)}`);
        return;
      }
      await load();
      setMsg(action === "complete" ? "Marked as paid — stock deducted." : "Done.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy("");
    }
  }

  async function sendEmail() {
    const to = window.prompt("Send invoice to which email?", email || meta?.customerEmail || "");
    if (to === null) return;
    setBusy("send");
    setError(""); setMsg("");
    try {
      const res = await fetch(`/api/billing/${encId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", to }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Send failed");
      setMsg(`Invoice emailed${to ? ` to ${to}` : ""}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy("");
    }
  }

  async function del() {
    if (!window.confirm(`Delete invoice ${meta?.name}? This cannot be undone.`)) return;
    setBusy("delete");
    setError("");
    try {
      const res = await fetch(`/api/billing/${encId}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Delete failed");
      router.push("/invoices");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setBusy("");
    }
  }

  async function downloadPdf() {
    const res = await fetch(`/api/billing/${encId}`);
    const d = await res.json();
    if (res.ok) generateInvoicePdf(d.invoice as InvoiceDetail);
  }

  if (loading) return <div className="px-8 py-7 text-sm text-neutral-400">Loading invoice…</div>;
  if (!meta) return <div className="px-8 py-7 text-sm text-red-600">{error || "Not found."}</div>;

  return (
    <div className="px-8 py-7">
      <Link href="/invoices" className="text-sm text-neutral-500 hover:text-amber-600">← All invoices</Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{meta.name}</h1>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${completed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {completed ? "PAID" : "DRAFT"}
          </span>
          <span className="text-sm text-neutral-400">{new Date(meta.createdAt).toLocaleDateString("en-GB")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={downloadPdf} className={btnGhost}>PDF</button>
          <a href={`/api/billing/export?id=${encId}`} className={btnGhost}>Excel</a>
          <button onClick={() => doAction("duplicate")} disabled={!!busy} className={btnGhost}>{busy === "duplicate" ? "…" : "Duplicate"}</button>
          {!completed && <button onClick={sendEmail} disabled={!!busy} className={btnGhost}>{busy === "send" ? "…" : "✉ Send"}</button>}
          <button onClick={del} disabled={!!busy} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">{busy === "delete" ? "…" : "Delete"}</button>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {msg && <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{msg}</p>}
      {completed && <p className="mt-4 rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">This invoice is paid and locked. Duplicate it to make an editable copy.</p>}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* Left: line items */}
        <div className="lg:col-span-2">
          {!readOnly && (
            <div className="relative">
              <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Search product or SKU to add…" className={input} />
              {(hits.length > 0 || searching) && (
                <div className="absolute z-10 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                  {searching && <p className="px-4 py-3 text-sm text-neutral-400">Searching…</p>}
                  {hits.map((h) => (
                    <button key={h.variantId} onClick={() => addLine(h)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800">
                      {h.image ? <img src={h.image} alt="" className="h-9 w-9 rounded border border-neutral-200 object-cover" /> : <div className="h-9 w-9 rounded bg-neutral-100" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{h.productTitle}{h.variantTitle ? ` — ${h.variantTitle}` : ""}</p>
                        <p className="text-xs text-neutral-500">{h.sku || "no SKU"} · {h.available} in stock</p>
                      </div>
                      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">£{h.price}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 w-24">Qty</th>
                  <th className="px-4 py-3 text-right">Unit</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  {!readOnly && <th className="px-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {lines.map((l, i) => (
                  <tr key={l.variantId ?? i}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-neutral-900 dark:text-neutral-100">{l.title}</p>
                      <p className="text-xs text-neutral-500">{l.sku || "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      {readOnly ? l.qty : (
                        <input type="number" min={1} value={l.qty} onChange={(e) => updateQty(l.variantId, Number(e.target.value))} className="w-20 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300">
                      {readOnly ? `£${l.price.toFixed(2)}` : (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-neutral-400">£</span>
                          <input type="number" min={0} step="0.01" value={l.price} onChange={(e) => updatePrice(l.variantId, Number(e.target.value))} className="w-24 rounded-lg border border-neutral-300 px-2 py-1.5 text-right text-sm dark:border-neutral-700 dark:bg-neutral-800" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900 dark:text-neutral-100">£{(l.price * l.qty).toFixed(2)}</td>
                    {!readOnly && <td className="px-2 py-3 text-right"><button onClick={() => removeLine(l.variantId)} className="text-neutral-400 hover:text-red-600">✕</button></td>}
                  </tr>
                ))}
                {lines.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-neutral-400">No items.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: summary */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Summary</h2>

          <label className="mt-4 flex items-center justify-between text-sm">
            <span className="font-medium text-neutral-700 dark:text-neutral-300">Charge VAT (20%)</span>
            <input type="checkbox" checked={vat} disabled={readOnly} onChange={(e) => { setVat(e.target.checked); setDirty(true); }} className="h-4 w-4" />
          </label>

          <label className="mt-3 block text-sm">
            <span className="font-medium text-neutral-700 dark:text-neutral-300">Discount %</span>
            <input type="number" min={0} max={100} value={discount} disabled={readOnly} onChange={(e) => { setDiscount(Math.min(100, Math.max(0, Number(e.target.value)))); setDirty(true); }} className={`mt-1 ${input}`} />
          </label>

          <div className="mt-3 text-sm">
            <span className="font-medium text-neutral-700 dark:text-neutral-300">Customer</span>
            {customerName || (customerId && !readOnly) ? (
              <div className="mt-1 flex items-center justify-between rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
                <span className="text-neutral-800 dark:text-neutral-200">{customerName || "Selected"}</span>
                {!readOnly && <button onClick={() => { setCustomerId(""); setCustomerName(""); setDirty(true); }} className="text-xs text-neutral-400 hover:text-red-600">change</button>}
              </div>
            ) : !readOnly ? (
              <div className="relative">
                <input value={custQ} onChange={(e) => onCustSearch(e.target.value)} placeholder="Search a registered customer…" className={`mt-1 ${input}`} />
                {custHits.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                    {custHits.map((c) => (
                      <button key={c.id} onClick={() => { setCustomerId(c.id); setCustomerName(c.company ? `${c.name} (${c.company})` : c.name); setCustHits([]); setCustQ(""); setDirty(true); }} className="block w-full px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800">
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">{c.name || "(no name)"}</span>
                        {c.company && <span className="text-neutral-500"> · {c.company}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : <p className="mt-1 text-neutral-500">{meta.customerName}</p>}
          </div>

          <label className="mt-3 block text-sm">
            <span className="font-medium text-neutral-700 dark:text-neutral-300">Note</span>
            <textarea value={note} disabled={readOnly} onChange={(e) => { setNote(e.target.value); setDirty(true); }} rows={2} className={`mt-1 ${input}`} />
          </label>

          <div className="mt-4 space-y-1.5 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800">
            <Row label="Subtotal" value={subtotal} />
            {discount > 0 && <Row label={`Discount (${discount}%)`} value={-discountAmt} />}
            <Row label={vat ? "VAT (20%)" : "VAT"} value={vatAmt} note={vat ? undefined : "No VAT"} />
            <div className="flex items-center justify-between border-t border-neutral-200 pt-2 text-base font-semibold text-neutral-900 dark:border-neutral-800 dark:text-neutral-100">
              <span>Total</span><span>£{total.toFixed(2)}</span>
            </div>
          </div>

          {!readOnly && (
            <>
              <button onClick={save} disabled={!!busy || !dirty} className="mt-5 w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-50">
                {busy === "save" ? "Saving…" : dirty ? "Save changes" : "Saved"}
              </button>
              <button onClick={() => { if (window.confirm(`Mark ${meta.name} as PAID? This creates the order and deducts stock.`)) doAction("complete"); }} disabled={!!busy} className="mt-2 w-full rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">
                {busy === "complete" ? "Processing…" : `✓ Mark paid (£${total.toFixed(2)})`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Payments on this invoice */}
      <PaymentsPanel invoiceId={encId} meta={meta} onChanged={load} />
    </div>
  );
}

function PaymentsPanel({ invoiceId, meta, onChanged }: { invoiceId: string; meta: InvoiceDetail; onChanged: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function record() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return setErr("Enter a valid amount.");
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`/api/billing/${invoiceId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "payment", amount: amt, method, note }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setAmount(""); setNote("");
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const paid = meta.amountPaid;
  const balance = meta.balance;
  const fully = balance <= 0.001;

  return (
    <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Payments on this invoice</h2>
        <div className="flex gap-4 text-sm">
          <span className="text-neutral-500">Total <strong className="text-neutral-900 dark:text-neutral-100">£{Number(meta.total).toFixed(2)}</strong></span>
          <span className="text-emerald-600">Paid <strong>£{paid.toFixed(2)}</strong></span>
          <span className={fully ? "text-emerald-600" : "text-red-600"}>Balance <strong>£{balance.toFixed(2)}</strong></span>
          {fully && paid > 0 && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">FULLY PAID</span>}
        </div>
      </div>

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/50">
        <input className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800" type="number" step="0.01" placeholder="Amount £" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="bank transfer">Bank transfer</option>
          <option value="cheque">Cheque</option>
          <option value="other">Other</option>
        </select>
        <input className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button onClick={record} disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">{saving ? "…" : "Record payment"}</button>
        {balance > 0 && <button onClick={() => setAmount(balance.toFixed(2))} className="text-xs text-amber-600 hover:underline">Pay balance (£{balance.toFixed(2)})</button>}
      </div>

      <div className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
        {[...meta.payments].reverse().map((p, i) => (
          <div key={i} className="flex items-center justify-between py-2.5 text-sm">
            <div>
              <p className="font-medium text-neutral-900 dark:text-neutral-100">£{Number(p.amount).toFixed(2)} <span className="font-normal text-neutral-500">· {p.method}</span></p>
              <p className="text-xs text-neutral-500">{new Date(p.date).toLocaleDateString("en-GB")}{p.note ? ` · ${p.note}` : ""}</p>
            </div>
          </div>
        ))}
        {meta.payments.length === 0 && <p className="py-4 text-sm text-neutral-400">No payments recorded on this invoice yet.</p>}
      </div>
    </div>
  );
}

const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
const btnGhost = "rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200";

function Row({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
      <span>{label}</span>
      <span>{note ?? `£${value.toFixed(2)}`}</span>
    </div>
  );
}
