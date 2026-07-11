"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function RegisterPage() {
  const [f, setF] = useState({ firstName: "", lastName: "", company: "", email: "", phone: "", note: "", website: "" });
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState("");

  function set<K extends keyof typeof f>(k: K, v: string) { setF((p) => ({ ...p, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.email.trim()) { setError("Please enter your email."); return; }
    setState("saving"); setError("");
    try {
      const res = await fetch("/api/shop/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Registration failed");
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setState("idle");
    }
  }

  const input = "w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200";

  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <div className="text-center">
        <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Trade accounts</span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-neutral-900">Open a wholesale account</h1>
        <p className="mt-2 text-neutral-500">Register your details and we&apos;ll review your application. Once approved you&apos;ll get access to trade pricing.</p>
      </div>

      {state === "done" ? (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-2xl text-white">✓</div>
          <h2 className="mt-4 text-xl font-bold text-neutral-900">Application received</h2>
          <p className="mt-2 text-sm text-neutral-600">Thanks! Your account has been created in our system. We&apos;ll review it and be in touch by email. You can browse the catalogue in the meantime.</p>
          <Link href="/shop/all" className="mt-5 inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900">Browse products</Link>
        </motion.div>
      ) : (
        <form onSubmit={submit} className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-sm font-medium text-neutral-700">First name</span><input className={input} value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></label>
            <label className="block"><span className="mb-1 block text-sm font-medium text-neutral-700">Last name</span><input className={input} value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></label>
            <label className="block sm:col-span-2"><span className="mb-1 block text-sm font-medium text-neutral-700">Business name</span><input className={input} value={f.company} onChange={(e) => set("company", e.target.value)} placeholder="Your shop / company" /></label>
            <label className="block"><span className="mb-1 block text-sm font-medium text-neutral-700">Email *</span><input type="email" required className={input} value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
            <label className="block"><span className="mb-1 block text-sm font-medium text-neutral-700">Phone</span><input className={input} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
            <label className="block sm:col-span-2"><span className="mb-1 block text-sm font-medium text-neutral-700">Anything else? (optional)</span><textarea rows={3} className={input} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Tell us about your business / what you're looking for" /></label>
          </div>
          {/* honeypot */}
          <input type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} className="hidden" aria-hidden />

          <button disabled={state === "saving"} className="mt-6 w-full rounded-full bg-neutral-900 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">
            {state === "saving" ? "Submitting…" : "Submit application"}
          </button>
          <p className="mt-3 text-center text-xs text-neutral-400">Already have an account? <a href="/shop" className="text-amber-600">Contact us</a> or use Trade login.</p>
        </form>
      )}
    </div>
  );
}
