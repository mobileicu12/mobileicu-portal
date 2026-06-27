"use client";

import { useEffect, useRef, useState } from "react";

const VAT_RATE = 0.2;

type Hit = {
  variantId: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  price: string;
  image: string | null;
  available: number;
};

type Line = {
  variantId: string;
  title: string;
  sku: string;
  price: number;
  qty: number;
  image: string | null;
};

type BillResult = {
  name: string;
  invoiceUrl: string | null;
  completed: boolean;
};

export default function BillingPage() {
  const [mode, setMode] = useState<"invoice" | "pos">("invoice");
  const [vat, setVat] = useState(true);
  const [discount, setDiscount] = useState(0);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [custQ, setCustQ] = useState("");
  const [custHits, setCustHits] = useState<{ id: string; name: string; company: string }[]>([]);
  const custDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          price: Number(h.price),
          qty: 1,
          image: h.image,
        },
      ];
    });
    setQ("");
    setHits([]);
  }

  function updateQty(id: string, qty: number) {
    setLines((prev) => prev.map((l) => (l.variantId === id ? { ...l, qty: Math.max(1, qty) } : l)));
  }
  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.variantId !== id));
  }

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const discountAmt = subtotal * (discount / 100);
  const net = subtotal - discountAmt;
  const vatAmt = vat ? net * VAT_RATE : 0;
  const total = net + vatAmt;

  async function submit() {
    if (lines.length === 0) {
      setError("Add at least one product.");
      return;
    }
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.qty })),
          vat,
          email,
          customerId,
          note,
          discountPercent: discount,
          complete: mode === "pos",
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setResult(d);
      setLines([]);
      setDiscount(0);
      setEmail("");
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-8 py-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-neutral-900">Billing / POS</h1>
        <div className="flex rounded-lg border border-neutral-300 p-1">
          <button
            onClick={() => setMode("invoice")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${mode === "invoice" ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
          >
            Wholesale invoice
          </button>
          <button
            onClick={() => setMode("pos")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${mode === "pos" ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
          >
            POS (instant sale)
          </button>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {result.completed ? "Sale completed" : "Invoice created"} — <strong>{result.name}</strong>.{" "}
          {result.invoiceUrl && (
            <a className="underline" href={result.invoiceUrl} target="_blank" rel="noreferrer">
              Open invoice
            </a>
          )}
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

          <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 w-24">Qty</th>
                  <th className="px-4 py-3 text-right">Unit</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {lines.map((l) => (
                  <tr key={l.variantId}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-neutral-900">{l.title}</p>
                      <p className="text-xs text-neutral-500">{l.sku}</p>
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
                    <td className="px-4 py-3 text-right text-neutral-700">£{l.price.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900">£{(l.price * l.qty).toFixed(2)}</td>
                    <td className="px-2 py-3 text-right">
                      <button onClick={() => removeLine(l.variantId)} className="text-neutral-400 hover:text-red-600">✕</button>
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-neutral-400">
                      Search above to add products.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: summary */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-neutral-900">Summary</h2>

          <label className="mt-4 flex items-center justify-between text-sm">
            <span className="font-medium text-neutral-700">Charge VAT (20%)</span>
            <input type="checkbox" checked={vat} onChange={(e) => setVat(e.target.checked)} className="h-4 w-4" />
          </label>

          <label className="mt-3 block text-sm">
            <span className="font-medium text-neutral-700">Discount %</span>
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
            {mode === "invoice" && !customerId && (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="…or just an email for a one-off"
                className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
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
              <span>Total</span>
              <span>£{total.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={submit}
            disabled={submitting || lines.length === 0}
            className="mt-5 w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60"
          >
            {submitting
              ? "Processing…"
              : mode === "pos"
                ? `Charge £${total.toFixed(2)} & complete`
                : "Create invoice"}
          </button>
          <p className="mt-2 text-xs text-neutral-400">
            {mode === "pos"
              ? "Completes the sale immediately and deducts stock."
              : "Creates a draft invoice you can send or take payment on later."}
          </p>
        </div>
      </div>
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
