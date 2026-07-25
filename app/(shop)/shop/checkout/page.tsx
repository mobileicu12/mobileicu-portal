"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCart } from "@/components/shop/cart";

type Me = { name: string; email: string; company: string; phone: string } | null;

const PAY_OPTIONS = [
  { key: "cash", label: "Cash on collection", desc: "Pay in the shop when you collect. We'll have it ready." },
  { key: "bank transfer", label: "Bank transfer", desc: "We'll send bank details on the invoice; goods released on payment." },
  { key: "on account", label: "On account", desc: "Add to your trade account balance to settle later." },
];

export default function CheckoutPage() {
  const { items, subtotal, trade, setQty, remove, clear } = useCart();
  const [me, setMe] = useState<Me>(null);
  const [pay, setPay] = useState("cash");
  const [note, setNote] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ name: string; invoiceNo: string; total: string; method: string } | null>(null);

  useEffect(() => {
    fetch("/api/shop/me").then((r) => r.json()).then((d) => setMe(d.customer)).catch(() => {});
  }, []);

  async function placeOrder() {
    if (!items.length) return;
    setPlacing(true); setError("");
    try {
      const res = await fetch("/api/shop/trade-checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: items.map((i) => ({ variantId: i.variantId, quantity: i.qty, unitPrice: i.price })),
          payMethod: pay,
          note: note.trim() || (pay === "cash" ? "Collect in shop" : undefined),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't place your order.");
      setDone({ name: d.name, invoiceNo: d.invoiceNo, total: d.total, method: pay });
      clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't place your order.");
    } finally {
      setPlacing(false);
    }
  }

  // Order placed confirmation
  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</div>
        <h1 className="mt-5 text-2xl font-bold text-neutral-900">Order placed</h1>
        <p className="mt-2 text-neutral-600">Thank you! Your order <strong>{done.invoiceNo}</strong> is confirmed.</p>
        <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-neutral-200 bg-white p-5 text-left text-sm">
          <Row label="Order" value={done.invoiceNo} />
          <Row label="Reference" value={done.name} />
          <Row label="Total" value={`£${Number(done.total).toFixed(2)}`} strong />
          <Row label="Payment" value={PAY_OPTIONS.find((p) => p.key === done.method)?.label || done.method} />
        </div>
        <p className="mt-4 text-sm text-neutral-500">
          {done.method === "cash"
            ? "Come in to collect and pay in cash — we'll have it ready."
            : "We'll be in touch to arrange payment and collection/delivery."}
        </p>
        <Link href="/shop/all" className="mt-6 inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900">Continue shopping</Link>
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-neutral-900">Trade login required</h1>
        <p className="mt-2 text-neutral-600">Please log in to your trade account to place an order.</p>
        <a href="/shop/trade-login" className="mt-6 inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-500 hover:text-neutral-900">Trade login</a>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-neutral-900">Your cart is empty</h1>
        <Link href="/shop/all" className="mt-6 inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-500 hover:text-neutral-900">Browse products</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-neutral-900">Checkout</h1>
      <p className="mt-1 text-sm text-neutral-500">Review your order and choose how you&apos;d like to pay. No account leaves this site.</p>
      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Items + payment */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-neutral-200 bg-white">
            {items.map((i) => (
              <div key={i.numericId} className="flex items-center gap-3 border-b border-neutral-100 p-4 last:border-0">
                {i.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.image} alt="" className="h-14 w-14 rounded-lg border border-neutral-200 object-cover" />
                ) : <div className="h-14 w-14 rounded-lg bg-neutral-100" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">{i.title}</p>
                  <p className="text-sm text-neutral-500">£{i.price.toFixed(2)}</p>
                </div>
                <input type="number" min={1} value={i.qty} onChange={(e) => setQty(i.numericId, Number(e.target.value))} className="w-16 rounded-lg border border-neutral-300 px-2 py-1 text-sm" />
                <span className="w-20 text-right text-sm font-semibold text-neutral-900">£{(i.price * i.qty).toFixed(2)}</span>
                <button onClick={() => remove(i.numericId)} className="text-neutral-300 hover:text-red-600">✕</button>
              </div>
            ))}
          </div>

          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-neutral-500">Payment method</h2>
          <div className="mt-2 space-y-2">
            {PAY_OPTIONS.map((p) => (
              <label key={p.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${pay === p.key ? "border-amber-500 bg-amber-50" : "border-neutral-200 hover:border-neutral-300"}`}>
                <input type="radio" name="pay" checked={pay === p.key} onChange={() => setPay(p.key)} className="mt-1 h-4 w-4 accent-amber-500" />
                <span>
                  <span className="block text-sm font-medium text-neutral-900">{p.label}</span>
                  <span className="block text-xs text-neutral-500">{p.desc}</span>
                </span>
              </label>
            ))}
          </div>

          <label className="mt-4 block text-sm">
            <span className="font-medium text-neutral-700">Note for the shop (optional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. collection time, delivery request…" className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
          </label>
        </div>

        {/* Summary */}
        <div className="h-fit rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-neutral-900">Summary</h2>
          {me && (
            <div className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              <p className="font-medium text-neutral-800">{me.company || me.name}</p>
              {me.email && <p>{me.email}</p>}
              {me.phone && <p>{me.phone}</p>}
            </div>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-neutral-200 pt-4 text-sm">
            <span className="text-neutral-500">Subtotal (wholesale)</span>
            <span className="text-lg font-semibold text-neutral-900">£{subtotal.toFixed(2)}</span>
          </div>
          <p className="mt-1 text-xs text-neutral-400">VAT &amp; any delivery are confirmed on your invoice.</p>
          <button onClick={placeOrder} disabled={placing} className="mt-4 w-full rounded-full bg-neutral-900 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">
            {placing ? "Placing order…" : "Place order"}
          </button>
          <p className="mt-2 text-center text-xs text-neutral-400">You&apos;ll get an order number instantly.</p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-neutral-500">{label}</span>
      <span className={strong ? "font-semibold text-neutral-900" : "text-neutral-800"}>{value}</span>
    </div>
  );
}
