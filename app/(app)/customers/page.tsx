"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Customer = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  orders: number;
  totalSpent: string;
};

function numericId(gid: string) {
  return gid.split("/").pop() ?? gid;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = (query: string) => {
    setLoading(true);
    fetch(`/api/customers?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        setCustomers(d.customers ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(""), []);

  function onSearch(v: string) {
    setQ(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(v), 350);
  }

  return (
    <div className="px-8 py-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Customers</h1>
          <p className="mt-1 text-sm text-neutral-500">Register customers, then bill them and track payments.</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900"
        >
          {showForm ? "Close" : "+ Register customer"}
        </button>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {showForm && <RegisterForm onCreated={() => { setShowForm(false); load(""); }} />}

      <input
        value={q}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search by name, company, email or phone…"
        className="mt-5 w-full max-w-md rounded-lg border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
      />

      <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3 text-right">Orders</th>
              <th className="px-4 py-3 text-right">Total spent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-medium text-neutral-900">
                  <Link href={`/customers/${numericId(c.id)}`} className="hover:text-amber-600">
                    {c.name || "(no name)"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600">{c.company || "—"}</td>
                <td className="px-4 py-3 text-neutral-500">
                  {c.email || "—"}
                  {c.phone ? ` · ${c.phone}` : ""}
                </td>
                <td className="px-4 py-3 text-right text-neutral-700">{c.orders}</td>
                <td className="px-4 py-3 text-right font-medium text-neutral-900">£{c.totalSpent}</td>
              </tr>
            ))}
            {customers.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-neutral-400">
                  No customers yet. Register your first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RegisterForm({ onCreated }: { onCreated: () => void }) {
  const [f, setF] = useState({ firstName: "", lastName: "", company: "", email: "", phone: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
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

  const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200";

  return (
    <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-neutral-900">Register customer</h2>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-2">
        <input className={input} placeholder="First name" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
        <input className={input} placeholder="Last name" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
        <input className={input} placeholder="Company (for wholesale)" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
        <input className={input} placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <input className={input} placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input className={input} placeholder="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="mt-4 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save customer"}
      </button>
    </div>
  );
}
