"use client";

import { useEffect, useState } from "react";

type Settings = {
  bizName: string;
  tagline: string;
  address: string;
  email: string;
  phone: string;
  website: string;
  vatNumber: string;
  bank: string;
  invoiceFooter: string;
  invoicePrefix: string;
  vatRate: number;
  lowStock: number;
};

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setS(d.settings))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof Settings>(k: K, v: Settings[K]) {
    setS((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  async function save() {
    if (!s) return;
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to save");
      setMsg("Saved. Invoices & statements will use these details.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !s) return <div className="px-8 py-7 text-sm text-neutral-400">Loading settings…</div>;

  return (
    <div className="px-8 py-7">
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Settings</h1>
      <p className="mt-1 text-sm text-neutral-500">Business details used on your invoices, statements &amp; PDFs.</p>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {msg && <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{msg}</p>}

      <div className="mt-6 grid max-w-4xl gap-6 lg:grid-cols-2">
        <Section title="Business identity">
          <Field label="Business name"><input className={inp} value={s.bizName} onChange={(e) => set("bizName", e.target.value)} /></Field>
          <Field label="Tagline"><input className={inp} value={s.tagline} onChange={(e) => set("tagline", e.target.value)} /></Field>
          <Field label="Address (one line per row)">
            <textarea rows={4} className={inp} value={s.address} onChange={(e) => set("address", e.target.value)} placeholder={"Unit 1, Example Road\nLondon\nSW1A 1AA\nUnited Kingdom"} />
          </Field>
        </Section>

        <Section title="Contact & legal">
          <Field label="Email"><input className={inp} value={s.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Phone"><input className={inp} value={s.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Website"><input className={inp} value={s.website} onChange={(e) => set("website", e.target.value)} /></Field>
          <Field label="VAT number (shown on VAT invoices)"><input className={inp} value={s.vatNumber} onChange={(e) => set("vatNumber", e.target.value)} placeholder="GB123456789" /></Field>
        </Section>

        <Section title="Invoice footer">
          <Field label="Bank / payment details (footer)">
            <textarea rows={3} className={inp} value={s.bank} onChange={(e) => set("bank", e.target.value)} placeholder="Bank: … · Sort: … · Acc: …" />
          </Field>
          <Field label="Footer note"><input className={inp} value={s.invoiceFooter} onChange={(e) => set("invoiceFooter", e.target.value)} /></Field>
        </Section>

        <Section title="Defaults">
          <Field label="Invoice number prefix"><input className={inp} value={s.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value)} placeholder="MICU" /></Field>
          <p className="text-xs text-neutral-400">New invoices are numbered <strong>{s.invoicePrefix || "MICU"}-{new Date().getFullYear()}-0001</strong>, incrementing uniquely.</p>
          <Field label="VAT rate (%)"><input type="number" className={inp} value={s.vatRate} onChange={(e) => set("vatRate", Number(e.target.value))} /></Field>
          <Field label="Low-stock threshold"><input type="number" className={inp} value={s.lowStock} onChange={(e) => set("lowStock", Number(e.target.value))} /></Field>
        </Section>
      </div>

      <button onClick={save} disabled={saving} className="mt-7 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">
        {saving ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}

const inp = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      {children}
    </label>
  );
}
