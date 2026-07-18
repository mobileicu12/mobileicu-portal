"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";

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
  const [flash, setFlash] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [segMode, setSegMode] = useState(false);
  const [segDraft, setSegDraft] = useState<SegmentKey[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
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

  const allSelected = customers.length > 0 && selected.size === customers.length;
  function toggleRow(id: string) { setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleAll() { setSelected(allSelected ? new Set() : new Set(customers.map((c) => c.id))); }
  function clearSel() { setSelected(new Set()); setSegMode(false); setSegDraft([]); }

  async function runBulk(action: "addSegments" | "removeSegments" | "delete") {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (action === "delete" && !confirm(`Delete ${ids.length} customer(s)? This cannot be undone.`)) return;
    if ((action === "addSegments" || action === "removeSegments") && segDraft.length === 0) { setError("Pick a segment first."); return; }
    setBulkBusy(true); setError(""); setFlash("");
    try {
      const res = await fetch("/api/customers/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids, segments: segDraft }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Bulk action failed");
      setFlash(`Done: ${d.ok} updated${d.failed ? `, ${d.failed} failed` : ""}.`);
      clearSel();
      load(q, segFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  }

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
    <div className="px-8 py-7 pb-28">
      <div className="sticky top-0 z-20 -mx-8 mb-5 border-b border-neutral-200 bg-white/95 px-8 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Customers</h1>
            <p className="text-sm text-neutral-500">
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SegTab active={segFilter === "all"} onClick={() => pickSeg("all")} label="All" />
          {SEGMENTS.map((s) => (
            <SegTab key={s.key} active={segFilter === s.key} onClick={() => pickSeg(s.key)} label={s.label} />
          ))}
          <input
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search name, company, email or phone…"
            className="ml-auto w-64 rounded-lg border border-neutral-300 px-4 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {flash && <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{flash}</p>}

      {showForm && <RegisterForm onCreated={() => { setShowForm(false); load(q, segFilter); }} />}

      <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950">
            <tr>
              <th className="px-4 py-3 w-10"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-amber-500" /></th>
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
              <tr key={c.id} className={selected.has(c.id) ? "bg-amber-50 dark:bg-amber-500/10" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40"}>
                <td className="px-4 py-3"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleRow(c.id)} className="h-4 w-4 accent-amber-500" /></td>
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
                <td colSpan={7} className="px-4 py-10 text-center text-neutral-400">
                  No customers in this segment yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk action bar — sticky so it never hides or covers rows */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-40 mx-auto mt-4 w-fit max-w-full">
          {segMode && (
            <div className="mb-2 max-w-[92vw] rounded-2xl border border-neutral-200 bg-white p-3 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-neutral-500">Segments →</span>
                {SEGMENTS.map((s) => (
                  <label key={s.key} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${segDraft.includes(s.key) ? s.badge : "border-neutral-300 text-neutral-500 dark:border-neutral-700"}`}>
                    <input type="checkbox" checked={segDraft.includes(s.key)} onChange={(e) => setSegDraft((prev) => e.target.checked ? [...prev, s.key] : prev.filter((k) => k !== s.key))} className="h-3.5 w-3.5 accent-amber-500" />
                    {s.short}
                  </label>
                ))}
                <button disabled={bulkBusy || !segDraft.length} onClick={() => runBulk("addSegments")} className="rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-50">Assign</button>
                <button disabled={bulkBusy || !segDraft.length} onClick={() => runBulk("removeSegments")} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300">Remove</button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-white shadow-2xl">
            <span className="font-medium">{selected.size} selected</span>
            <span className="h-4 w-px bg-white/20" />
            <button disabled={bulkBusy} onClick={() => setSegMode((v) => !v)} className={`rounded-full px-3 py-1 hover:bg-white/10 ${segMode ? "text-amber-400" : ""}`}>Set segment</button>
            <button disabled={bulkBusy} onClick={() => runBulk("delete")} className="rounded-full px-3 py-1 text-red-400 hover:bg-red-500/20 disabled:opacity-50">Delete</button>
            <span className="h-4 w-px bg-white/20" />
            <button onClick={clearSel} className="rounded-full px-2 py-1 text-white/50 hover:text-white">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

function L({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      {children}
    </label>
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
  const [f, setF] = useState({ firstName: "", lastName: "", company: "", email: "", phoneNumber: "", note: "", address1: "", city: "", zip: "", openingBalance: "" });
  const [countryIso, setCountryIso] = useState(DEFAULT_COUNTRY);
  const [segments, setSegments] = useState<SegmentKey[]>(["online"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dial = COUNTRIES.find((c) => c.iso === countryIso)?.dial ?? "";
  function toggleSeg(k: SegmentKey) {
    setSegments((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  async function save() {
    if (!f.firstName.trim() || !f.lastName.trim()) { setError("First and last name are required."); return; }
    setSaving(true);
    setError("");
    try {
      const phone = f.phoneNumber.trim() ? `${dial} ${f.phoneNumber.trim()}` : "";
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: f.firstName, lastName: f.lastName, company: f.company, email: f.email, note: f.note,
          phone, address1: f.address1, city: f.city, zip: f.zip, country: countryIso,
          openingBalance: f.openingBalance ? Number(f.openingBalance) : 0,
          segments,
        }),
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
        <L label="First name *"><input className={input} value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></L>
        <L label="Last name *"><input className={input} value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></L>
        <L label="Company (for wholesale)"><input className={input} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></L>
        <L label="Email"><input type="email" className={input} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></L>
        <L label="Phone">
          <div className="flex gap-2">
            <select value={countryIso} onChange={(e) => setCountryIso(e.target.value)} className={`${input.replace("w-full", "")} w-28 shrink-0`}>
              {COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.flag} {c.dial}</option>)}
            </select>
            <input className={`${input} min-w-0 flex-1`} placeholder="7911 123456" value={f.phoneNumber} onChange={(e) => setF({ ...f, phoneNumber: e.target.value })} />
          </div>
        </L>
        <L label="Opening balance (£) — old outstanding brought forward">
          <input type="number" step="0.01" className={input} value={f.openingBalance} onChange={(e) => setF({ ...f, openingBalance: e.target.value })} placeholder="0.00" />
        </L>
        <L label="Address" className="sm:col-span-2"><input className={input} value={f.address1} onChange={(e) => setF({ ...f, address1: e.target.value })} placeholder="Street address" /></L>
        <L label="City / Town"><input className={input} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></L>
        <L label="Postcode"><input className={input} value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value })} /></L>
        <L label="Note (optional)" className="sm:col-span-2"><input className={input} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></L>
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
