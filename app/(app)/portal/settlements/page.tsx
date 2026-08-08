"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsOwner } from "@/lib/use-me";
import type { Buying } from "@/lib/settlements";

const PERIODS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "1m", label: "This month" },
  { key: "3m", label: "Last 3 months" },
  { key: "1y", label: "Last year" },
  { key: "all", label: "All time" },
];

function rangeFor(key: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toLocaleDateString("en-CA");
  const d = new Date();
  switch (key) {
    case "today": break;
    case "7d": d.setDate(now.getDate() - 6); break;
    case "1m": d.setDate(1); break;
    case "3m": d.setMonth(now.getMonth() - 3); break;
    case "1y": d.setFullYear(now.getFullYear() - 1); break;
    default: return { from: "", to: "" }; // all time
  }
  return { from: d.toLocaleDateString("en-CA"), to };
}

export default function SettlementsPage() {
  const isOwner = useIsOwner();
  const [period, setPeriod] = useState("1m");
  const [rows, setRows] = useState<Buying[]>([]);
  const [sales, setSales] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const { from, to } = rangeFor(period);
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    fetch(`/api/settlements?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else { setRows(d.buying || []); setSales(Number(d.salesReceived) || 0); } })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period]);
  useEffect(() => { if (isOwner) load(); }, [isOwner, load]);

  // Buying entries within the selected period.
  const { from, to } = rangeFor(period);
  const inPeriod = useMemo(() => {
    const f = from ? +new Date(`${from}T00:00:00`) : 0;
    const t = to ? +new Date(`${to}T23:59:59`) : Date.now();
    return rows.filter((r) => { const x = +new Date(r.date); return x >= f && x <= t; });
  }, [rows, from, to]);

  const buyingIncluded = inPeriod.filter((r) => r.included).reduce((s, r) => s + r.amount, 0);
  const buyingExcluded = inPeriod.filter((r) => !r.included).reduce((s, r) => s + r.amount, 0);
  const net = Math.round((sales - buyingIncluded) * 100) / 100;

  async function toggle(id: string, included: boolean) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, included } : r)));
    await fetch("/api/settlements", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, included }) });
  }
  async function remove(id: string) {
    if (!confirm("Delete this buying entry?")) return;
    const res = await fetch(`/api/settlements?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setRows((rs) => rs.filter((r) => r.id !== id));
  }

  if (!isOwner) return <div className="px-8 py-7"><p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10">This page is owner-only.</p></div>;

  const money = (n: number) => `£${(n || 0).toFixed(2)}`;
  const sel = "rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

  return (
    <div className="px-8 py-7">
      <div className="sticky top-0 z-20 -mx-8 mb-5 border-b border-neutral-200 bg-white/95 px-8 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Settlement &amp; buying</h1>
        <p className="text-sm text-neutral-500">Log stock-buying costs and settle them against sales to see your <strong>net</strong> earnings. Separate from Expenses.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-neutral-600 dark:text-neutral-300">Period:</span>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className={sel}>
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>

      {/* Earnings settlement summary */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card label="Sales received" value={money(sales)} tone="ink" hint="money collected on this period's bills" />
        <Card label="Buying (included)" value={`− ${money(buyingIncluded)}`} tone="red" hint="reduces net earnings" />
        <Card label="Net earnings" value={money(net)} tone={net >= 0 ? "emerald" : "red"} hint="sales received − included buying" />
        <Card label="Excluded buying" value={money(buyingExcluded)} tone="muted" hint="logged but not settled" />
      </div>

      <p className="mt-2 text-xs text-neutral-400">Tip: switch an entry off to see your <strong>real gross</strong> (sales only); switch it on to <strong>settle</strong> it against earnings.</p>

      <AddBuying onAdded={load} />

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-400">Loading…</p>
        ) : inPeriod.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-400">No buying logged in this period.</p>
        ) : (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {inPeriod.map((r) => (
              <div key={r.id} className={`group flex items-center justify-between gap-3 px-4 py-3 text-sm ${!r.included ? "opacity-60" : ""}`}>
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">{r.supplier || "Buying"}{r.description ? <span className="font-normal text-neutral-500"> · {r.description}</span> : ""}</p>
                  <p className="truncate text-xs text-neutral-500">{new Date(r.date).toLocaleDateString("en-GB")}{r.createdBy ? ` · by ${r.createdBy}` : ""}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold text-red-600">− £{Number(r.amount).toFixed(2)}</span>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-500">
                    <input type="checkbox" checked={r.included} onChange={(e) => toggle(r.id, e.target.checked)} className="h-4 w-4 accent-amber-500" />
                    {r.included ? "settled" : "excluded"}
                  </label>
                  <button onClick={() => remove(r.id)} className="rounded-md px-2 py-1 text-xs text-red-500 opacity-0 transition hover:bg-red-50 group-hover:opacity-100">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ label, value, tone, hint }: { label: string; value: string; tone: "ink" | "emerald" | "red" | "muted"; hint?: string }) {
  const color = tone === "emerald" ? "text-emerald-600" : tone === "red" ? "text-red-600" : tone === "muted" ? "text-neutral-400" : "text-neutral-900 dark:text-neutral-100";
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}

function AddBuying({ onAdded }: { onAdded: () => void }) {
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function save() {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError("Enter a valid amount."); return; }
    setSaving(true); setError(""); setOk("");
    try {
      const res = await fetch("/api/settlements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier, amount: amt, description, date: new Date(`${date}T12:00:00`).toISOString() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setOk(`Added buying £${amt.toFixed(2)}.`);
      setSupplier(""); setAmount(""); setDescription("");
      onAdded();
      setTimeout(() => setOk(""), 4000);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  const inp = "rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
  return (
    <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Log a buying cost</h2>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {ok && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10">{ok}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">Supplier</span>
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. ABC Wholesale" className={`${inp} w-full`} />
        </label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">Amount (£)</span>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={`${inp} w-full`} />
        </label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inp} w-full`} />
        </label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 20× screens" className={`${inp} w-full`} />
        </label>
      </div>
      <button onClick={save} disabled={saving} className="mt-4 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">{saving ? "Saving…" : "Add buying cost"}</button>
    </div>
  );
}
