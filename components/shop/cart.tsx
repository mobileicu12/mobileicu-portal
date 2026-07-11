"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type CartItem = { variantId: string; numericId: string; title: string; price: number; image: string | null; qty: number };

type CartCtx = {
  items: CartItem[];
  count: number;
  subtotal: number;
  open: boolean;
  trade: boolean;
  setOpen: (v: boolean) => void;
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (numericId: string, qty: number) => void;
  remove: (numericId: string) => void;
  checkout: () => void;
};

const Ctx = createContext<CartCtx | null>(null);
const KEY = "micu_cart_v1";

export function CartProvider({ domain, trade = false, children }: { domain: string; trade?: boolean; children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setItems(JSON.parse(raw)); } catch {}
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(KEY, JSON.stringify(items)); }, [items, ready]);

  const add = useCallback((item: Omit<CartItem, "qty">, qty = 1) => {
    setItems((prev) => {
      const ex = prev.find((i) => i.numericId === item.numericId);
      if (ex) return prev.map((i) => (i.numericId === item.numericId ? { ...i, qty: i.qty + qty } : i));
      return [...prev, { ...item, qty }];
    });
    setOpen(true);
  }, []);
  const setQty = useCallback((numericId: string, qty: number) => {
    setItems((prev) => prev.map((i) => (i.numericId === numericId ? { ...i, qty: Math.max(1, qty) } : i)));
  }, []);
  const remove = useCallback((numericId: string) => setItems((prev) => prev.filter((i) => i.numericId !== numericId)), []);

  const checkout = useCallback(async () => {
    if (!items.length || checkingOut) return;
    if (trade) {
      setCheckingOut(true);
      try {
        const res = await fetch("/api/shop/trade-checkout", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: items.map((i) => ({ variantId: i.variantId, quantity: i.qty, unitPrice: i.price })) }),
        });
        const d = await res.json();
        if (res.ok && d.invoiceUrl) { window.location.href = d.invoiceUrl; return; }
        alert(d.error || "Checkout failed.");
      } finally { setCheckingOut(false); }
      return;
    }
    const line = items.map((i) => `${i.numericId}:${i.qty}`).join(",");
    window.location.href = `https://${domain}/cart/${line}`;
  }, [items, domain, trade, checkingOut]);

  const value = useMemo<CartCtx>(() => ({
    items,
    count: items.reduce((s, i) => s + i.qty, 0),
    subtotal: items.reduce((s, i) => s + i.price * i.qty, 0),
    open, trade, setOpen, add, setQty, remove, checkout,
  }), [items, open, trade, add, setQty, remove, checkout]);

  return <Ctx.Provider value={value}>{children}<CartDrawer /></Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used within CartProvider");
  return c;
}

function CartDrawer() {
  const { items, open, setOpen, subtotal, setQty, remove, checkout } = useCart();
  return (
    <AnimatePresence>
      {open && (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "tween", duration: 0.3, ease: "easeInOut" }} className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">Your cart</h2>
          <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-900">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 && <p className="py-10 text-center text-sm text-neutral-400">Your cart is empty.</p>}
          {items.map((i) => (
            <div key={i.numericId} className="flex gap-3 border-b border-neutral-100 py-3">
              {i.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.image} alt="" className="h-16 w-16 rounded-lg border border-neutral-200 object-cover" />
              ) : <div className="h-16 w-16 rounded-lg bg-neutral-100" />}
              <div className="flex-1">
                <p className="text-sm font-medium text-neutral-900">{i.title}</p>
                <p className="text-sm text-neutral-500">£{i.price.toFixed(2)}</p>
                <div className="mt-1 flex items-center gap-2">
                  <input type="number" min={1} value={i.qty} onChange={(e) => setQty(i.numericId, Number(e.target.value))} className="w-16 rounded-lg border border-neutral-300 px-2 py-1 text-sm" />
                  <button onClick={() => remove(i.numericId)} className="text-xs text-neutral-400 hover:text-red-600">remove</button>
                </div>
              </div>
              <p className="text-sm font-semibold text-neutral-900">£{(i.price * i.qty).toFixed(2)}</p>
            </div>
          ))}
        </div>
        {items.length > 0 && (
          <div className="border-t border-neutral-200 px-5 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">Subtotal</span>
              <span className="text-lg font-semibold text-neutral-900">£{subtotal.toFixed(2)}</span>
            </div>
            <p className="mt-1 text-xs text-neutral-400">Shipping &amp; taxes calculated at checkout.</p>
            <button onClick={checkout} className="mt-3 w-full rounded-full bg-neutral-900 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900">
              Secure checkout →
            </button>
          </div>
        )}
      </motion.div>
    </div>
      )}
    </AnimatePresence>
  );
}
