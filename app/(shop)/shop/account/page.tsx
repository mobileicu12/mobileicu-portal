"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Order = { name: string; status: string; total: string; balance: number; createdAt: string };
type Account = { firstName: string; lastName: string; email: string; phone: string; company: string; outstanding: number; orders: Order[] } | null;

export default function AccountPage() {
  const [acc, setAcc] = useState<Account>(null);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/shop/account").then((r) => {
      if (r.status === 401) { window.location.href = "/shop/trade-login"; return null; }
      return r.json();
    }).then((d) => {
      if (d?.account) {
        setAcc(d.account);
        setF({ firstName: d.account.firstName || "", lastName: d.account.lastName || "", email: d.account.email || "", phone: d.account.phone || "", company: d.account.company || "" });
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setMsg(""); setError("");
    try {
      const res = await fetch("/api/shop/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't save.");
      setMsg("Saved ✓");
      setTimeout(() => setMsg(""), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save."); } finally { setSaving(false); }
  }

  async function logout() {
    await fetch("/api/shop/trade-logout", { method: "POST" }).catch(() => {});
    window.location.href = "/shop";
  }

  if (loading) return <div className="mx-auto max-w-4xl px-4 py-16 text-center text-neutral-400">Loading your account…</div>;
  if (!acc) return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-neutral-900">Please log in</h1>
      <a href="/shop/trade-login" className="mt-6 inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-500 hover:text-neutral-900">Trade login</a>
    </div>
  );

  const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">My account</h1>
          <p className="text-sm text-neutral-500">{acc.company || `${acc.firstName} ${acc.lastName}`.trim()}</p>
        </div>
        <button onClick={logout} className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-red-400 hover:text-red-600">Log out</button>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Profile */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Your details</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <L label="First name"><input className={input} value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></L>
              <L label="Last name"><input className={input} value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></L>
              <L label="Company"><input className={input} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></L>
              <L label="Email"><input type="email" className={input} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></L>
              <L label="Phone"><input className={input} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></L>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button onClick={save} disabled={saving} className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">{saving ? "Saving…" : "Save details"}</button>
              {msg && <span className="text-sm text-emerald-600">{msg}</span>}
            </div>
          </div>

          {/* Recent orders */}
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Recent orders</h2>
            {acc.orders.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-400">No orders yet. <Link href="/shop/all" className="text-amber-600 hover:underline">Start shopping →</Link></p>
            ) : (
              <div className="mt-3 divide-y divide-neutral-100">
                {acc.orders.map((o) => (
                  <div key={o.name} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <span className="font-medium text-neutral-900">{o.name}</span>
                      <span className="ml-2 text-xs text-neutral-400">{new Date(o.createdAt).toLocaleDateString("en-GB")}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{o.status === "COMPLETED" ? "Paid" : "Open"}</span>
                      <span className="font-semibold text-neutral-900">£{Number(o.total).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Balance */}
        <div className="h-fit rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Account balance</h2>
          <p className={`mt-2 text-3xl font-bold ${acc.outstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>£{acc.outstanding.toFixed(2)}</p>
          <p className="mt-1 text-xs text-neutral-400">{acc.outstanding > 0 ? "Outstanding balance on your account." : "You're all settled up."}</p>
          <Link href="/shop/all" className="mt-5 block rounded-full bg-neutral-900 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900">Continue shopping</Link>
        </div>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>{children}</label>;
}
