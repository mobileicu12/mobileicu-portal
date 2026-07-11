"use client";

import { useState } from "react";
import Link from "next/link";

export default function TradeLoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/shop/trade-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Login failed");
      window.location.href = "/shop";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200";

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="text-center">
        <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Trade access</span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-neutral-900">Trade login</h1>
        <p className="mt-2 text-sm text-neutral-500">Enter your email and the trade access code we gave you to unlock wholesale prices.</p>
      </div>

      <form onSubmit={submit} className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
        <label className="block"><span className="mb-1 block text-sm font-medium text-neutral-700">Email</span><input type="email" required className={input} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="mt-4 block"><span className="mb-1 block text-sm font-medium text-neutral-700">Trade access code</span><input required className={`${input} font-mono tracking-widest`} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXXXXXX" /></label>
        <button disabled={busy} className="mt-6 w-full rounded-full bg-neutral-900 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">{busy ? "Signing in…" : "Unlock trade pricing"}</button>
      </form>

      <p className="mt-4 text-center text-sm text-neutral-500">No account yet? <Link href="/shop/register" className="font-medium text-amber-600 hover:underline">Apply for a trade account →</Link></p>
    </div>
  );
}
