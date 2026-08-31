"use client";

import { useEffect, useMemo, useState } from "react";
import { EXPENSE_CATEGORIES, type Expense } from "@/lib/expenses";
import Pagination, { usePaging } from "@/components/Pagination";

const PERIODS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "1m", label: "This month" },
  { key: "3m", label: "Last 3 months" },
  { key: "1y", label: "Last year" },
  { key: "all", label: "All time" },
];

function rangeStart(key: string): number {
  const now = new Date();
  const d = new Date();
  switch (key) {
    case "today": d.setHours(0, 0, 0, 0); break;
    case "7d": d.setDate(now.getDate() - 7); d.setHours(0, 0, 0, 0); break;
    case "1m": d.setDate(1); d.setHours(0, 0, 0, 0); break;
    case "3m": d.setMonth(now.getMonth() - 3); d.setHours(0, 0, 0, 0); break;
    case "1y": d.setFullYear(now.getFullYear() - 1); d.setHours(0, 0, 0, 0); break;
    default: return 0;
  }
  return +d;
}

export default function ExpensesPage() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("1m");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/expenses")
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setRows(d.expenses || []); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))).sort(), [rows]);
  const shown = useMemo(() => {
    const from = rangeStart(period);
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (from && +new Date(r.date) < from) return false;
      if (cat !== "all" && r.category !== cat) return false;
      if (ql && !(`${r.category} ${r.description} ${r.note}`.toLowerCase().includes(ql))) return false;
      return true;
    });
  }, [rows, period, cat, q]);

  const paging = usePaging(shown, 20);

  const total = shown.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of shown) m.set(r.category, (m.get(r.category) || 0) + (Number(r.amount) || 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [shown]);

  async function remove(id: string) {
    if (!confirm("Delete this expense?")) return;
    const res = await fetch(`/api/expenses?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setRows((rs) => rs.filter((r) => r.id !== id));
    else { const d = await res.json().catch(() => ({})); setError(d.error || "Failed to delete."); }
  }

  function exportCsv() {
    const header = ["Date", "Category", "Description", "Amount", "Method", "Note", "Added by"];
    const lines = shown.map((r) => [new Date(r.date).toLocaleDateString("en-GB"), r.category, r.description, r.amount.toFixed(2), r.method, r.note, r.createdBy]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const sel = "rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

  return (
    <div className="px-8 py-7">
      <div className="sticky top-0 z-20 -mx-8 mb-5 border-b border-neutral-200 bg-white/95 px-8 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Expenses</h1>
            <p className="text-sm text-neutral-500">Record and track what the shop spends.</p>
          </div>
          <button onClick={exportCsv} disabled={!shown.length} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200">⬇ Export CSV</button>
        </div>
      </div>

      <AddExpense onAdded={load} />

      {/* Totals */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Total ({PERIODS.find((p) => p.key === period)?.label.toLowerCase()})</p>
          <p className="mt-2 text-3xl font-semibold text-red-600">£{total.toFixed(2)}</p>
          <p className="mt-1 text-xs text-neutral-400">{shown.length} expense{shown.length === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:col-span-2 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">By category</p>
          {byCat.length === 0 ? <p className="text-sm text-neutral-400">Nothing in this period.</p> : (
            <div className="flex flex-wrap gap-2">
              {byCat.map(([c, v]) => (
                <span key={c} className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">{c}: <strong>£{v.toFixed(2)}</strong></span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className={sel}>
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={sel}>
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className={`${sel} flex-1 min-w-[8rem]`} />
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {/* List */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-400">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-400">No expenses{rows.length ? " match these filters" : " yet — add your first above"}.</p>
        ) : (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {paging.rows.map((r) => (
              <div key={r.id} className="group flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {r.category}{r.description ? <span className="font-normal text-neutral-500"> · {r.description}</span> : ""}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {new Date(r.date).toLocaleDateString("en-GB")} · {r.method}{r.note ? ` · ${r.note}` : ""}{r.createdBy ? ` · by ${r.createdBy}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold text-red-600">£{Number(r.amount).toFixed(2)}</span>
                  <button onClick={() => remove(r.id)} className="rounded-md px-2 py-1 text-xs text-red-500 opacity-0 transition hover:bg-red-50 group-hover:opacity-100">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* The totals and the CSV export above still run over every row the filters
          match — only the list on screen is sliced. */}
      <Pagination paging={paging} noun="expenses" />
    </div>
  );
}

function AddExpense({ onAdded }: { onAdded: () => void }) {
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState("cash");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function save() {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError("Enter a valid amount."); return; }
    setSaving(true); setError(""); setOk("");
    try {
      const res = await fetch("/api/expenses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, amount: amt, description, method, note, date: new Date(`${date}T12:00:00`).toISOString() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setOk(`Added £${amt.toFixed(2)} · ${category}.`);
      setAmount(""); setDescription(""); setNote("");
      onAdded();
      setTimeout(() => setOk(""), 4000);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  const inp = "rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Add an expense</h2>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {ok && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10">{ok}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inp} w-full`}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">Amount (£)</span>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={`${inp} w-full`} />
        </label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inp} w-full`} />
        </label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">Paid by</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={`${inp} w-full`}>
            <option value="cash">Cash</option><option value="card">Card</option><option value="bank transfer">Bank transfer</option><option value="other">Other</option>
          </select>
        </label>
        <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Screens from supplier X" className={`${inp} w-full`} />
        </label>
        <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`${inp} w-full`} />
        </label>
      </div>
      <button onClick={save} disabled={saving} className="mt-4 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">{saving ? "Saving…" : "Add expense"}</button>
    </div>
  );
}
