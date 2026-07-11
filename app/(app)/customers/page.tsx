"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";

type Customer = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  orders: number;
  totalSpent: string;
  segments: SegmentKey[];
};

function numericId(gid: string) {
  return gid.split("/").pop() ?? gid;
}

function SegBadges({ segments }: { segments: SegmentKey[] }) {
  if (!segments.length) return <span className="text-neutral-300">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {segments.map((k) => {
        const s = SEGMENTS.find((x) => x.key === k);
        if (!s) return null;
        return (
          <span key={k} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.badge}`}>
            {s.short}
          </span>
        );
      })}
    </div>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [segFilter, setSegFilter] = useState<SegmentKey | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = (query: string, seg: SegmentKey | "all") => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (seg !== "all") params.set("segment", seg);
    fetch(`/api/customers?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        setCustomers(d.customers ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => load("", "all"), []);

  function onSearch(v: string) {
    setQ(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(v, segFilter), 350);
  }
  function pickSeg(seg: SegmentKey | "all") {
    setSegFilter(seg);
    load(q, seg);
  }

  return (
    <div className="px-8 py-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Customers</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Segmented by source. <strong>Online / Registered</strong> customers are the only ones with wholesale price access.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900"
        >
          {showForm ? "Close" : "+ Register customer"}
        </button>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {showForm && <RegisterForm onCreated={() => { setShowForm(false); load(q, segFilter); }} />}

      {/* segment tabs */}
      <div className="mt-5 flex flex-wrap gap-2">
        <SegTab active={segFilter === "all"} onClick={() => pickSeg("all")} label="All" />
        {SEGMENTS.map((s) => (
          <SegTab key={s.key} active={segFilter === s.key} onClick={() => pickSeg(s.key)} label={s.label} />
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search by name, company, email or phone…"
        className="mt-4 w-full max-w-md rounded-lg border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
      />

      <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Segment</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3 text-right">Orders</th>
              <th className="px-4 py-3 text-right">Total spent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">
                  <Link href={`/customers/${numericId(c.id)}`} className="hover:text-amber-600">
                    {c.name || "(no name)"}
                  </Link>
                </td>
                <td className="px-4 py-3"><SegBadges segments={c.segments} /></td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">{c.company || "—"}</td>
                <td className="px-4 py-3 text-neutral-500">
                  {c.email || "—"}{c.phone ? ` · ${c.phone}` : ""}
                </td>
                <td className="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300">{c.orders}</td>
                <td className="px-4 py-3 text-right font-medium text-neutral-900 dark:text-neutral-100">£{c.totalSpent}</td>
              </tr>
            ))}
            {customers.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-neutral-400">
                  No customers in this segment yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SegTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
          : "border-neutral-300 text-neutral-600 hover:border-neutral-900 dark:border-neutral-700 dark:text-neutral-300"
      }`}
    >
      {label}
    </button>
  );
}

function RegisterForm({ onCreated }: { onCreated: () => void }) {
  const [f, setF] = useState({ firstName: "", lastName: "", company: "", email: "", phone: "", note: "" });
  const [segments, setSegments] = useState<SegmentKey[]>(["online"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleSeg(k: SegmentKey) {
    setSegments((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, segments }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

  return (
    <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Register customer</h2>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-2">
        <input className={input} placeholder="First name" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
        <input className={input} placeholder="Last name" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
        <input className={input} placeholder="Company (for wholesale)" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
        <input className={input} placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <input className={input} placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input className={input} placeholder="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Segment(s)</p>
        <p className="text-xs text-neutral-400">A customer can belong to more than one (e.g. a registered online customer who also visits the shop).</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => toggleSeg(s.key)}
              title={s.desc}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                segments.includes(s.key) ? s.badge : "border-neutral-300 text-neutral-500 dark:border-neutral-700"
              }`}
            >
              {segments.includes(s.key) ? "✓ " : ""}{s.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-5 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save customer"}
      </button>
    </div>
  );
}
