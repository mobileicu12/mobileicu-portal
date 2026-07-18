"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Form = {
  title: string;
  descriptionHtml: string;
  brand: string;
  model: string;
  type: string;
  shopifyType: string;
  tags: string;
  sku: string;
  barcode: string;
  price: string;
  compareAt: string;
  stock: string;
  status: string;
  image: string;
};

const EMPTY: Form = {
  title: "",
  descriptionHtml: "",
  brand: "",
  model: "",
  type: "",
  shopifyType: "",
  tags: "",
  sku: "",
  barcode: "",
  price: "",
  compareAt: "",
  stock: "0",
  status: "ACTIVE",
  image: "",
};

export default function NewProductPage() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [descPreview, setDescPreview] = useState(false);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(addAnother: boolean) {
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      if (addAnother) {
        setForm({ ...EMPTY, brand: form.brand, type: form.type, shopifyType: form.shopifyType });
        setSuccess(`Saved “${form.title}”. Add the next one.`);
      } else {
        router.push("/inventory");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-8 py-7 pb-16">
      <div className="sticky top-0 z-20 -mx-8 mb-5 border-b border-neutral-200 bg-white/95 px-8 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Add Product</h1>
        <p className="text-sm text-neutral-500">
          Create a product. Tags &amp; Type/Brand/Model auto-place it into your smart collections and
          power the storefront filters.
        </p>
      </div>

      {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {success && (
        <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p>
      )}

      <div className="mt-6 grid max-w-4xl gap-5 lg:grid-cols-2">
        <Field label="Title *" className="lg:col-span-2">
          <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="iPhone 15 Pro LCD Screen Replacement" />
        </Field>

        <div className="lg:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-700">Description (HTML supported)</span>
            <div className="flex overflow-hidden rounded-lg border border-line text-xs">
              <button type="button" onClick={() => setDescPreview(false)} className={`px-2.5 py-1 ${!descPreview ? "bg-ink text-bg" : "text-muted"}`}>HTML</button>
              <button type="button" onClick={() => setDescPreview(true)} className={`px-2.5 py-1 ${descPreview ? "bg-ink text-bg" : "text-muted"}`}>Preview</button>
            </div>
          </div>
          {descPreview ? (
            <div className="min-h-32 rounded-lg border border-line bg-surface p-3 text-sm text-ink [&_a]:text-accent [&_a]:underline [&_img]:max-w-full [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: form.descriptionHtml || "<p class='text-muted'>Nothing yet…</p>" }} />
          ) : (
            <textarea rows={6} spellCheck={false} className={`${inputCls} font-mono text-xs`} value={form.descriptionHtml} onChange={(e) => set("descriptionHtml", e.target.value)} placeholder="<p>Paste or write product HTML here…</p>" />
          )}
        </div>

        <Field label="Brand">
          <input className={inputCls} value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="MobileICU / AHL / KM…" />
        </Field>
        <Field label="Model(s) (comma separated)">
          <input className={inputCls} value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="iPhone 15 Pro" />
        </Field>

        <Field label="Type (e.g. Screen, Cables, Battery)">
          <input className={inputCls} value={form.type} onChange={(e) => set("type", e.target.value)} placeholder="Screen" />
        </Field>
        <Field label="Tags (comma separated)">
          <input className={inputCls} value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="iPhone 15 Pro, iPhone Parts, LCD" />
        </Field>

        <Field label="SKU">
          <input className={inputCls} value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="IP15P-LCD" />
        </Field>
        <Field label="Barcode">
          <input className={inputCls} value={form.barcode} onChange={(e) => set("barcode", e.target.value)} placeholder="Optional" />
        </Field>

        <Field label="Price (£)">
          <input className={inputCls} type="number" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="39.99" />
        </Field>
        <Field label="Compare-at price (£)">
          <input className={inputCls} type="number" step="0.01" value={form.compareAt} onChange={(e) => set("compareAt", e.target.value)} placeholder="Optional" />
        </Field>

        <Field label="Stock">
          <input className={inputCls} type="number" value={form.stock} onChange={(e) => set("stock", e.target.value)} />
        </Field>
        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value)}>
            <option value="ACTIVE">Active (visible)</option>
            <option value="DRAFT">Draft (hidden)</option>
          </select>
        </Field>

        <Field label="Image URL" className="lg:col-span-2">
          <input className={inputCls} value={form.image} onChange={(e) => set("image", e.target.value)} placeholder="https://… (Shopify downloads it)" />
        </Field>

        <Field label="Shopify Product Type (optional)">
          <input className={inputCls} value={form.shopifyType} onChange={(e) => set("shopifyType", e.target.value)} placeholder="iPhone Parts" />
        </Field>
      </div>

      <div className="mt-7 flex gap-3">
        <button
          onClick={() => save(false)}
          disabled={saving}
          className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save product"}
        </button>
        <button
          onClick={() => save(true)}
          disabled={saving}
          className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-60"
        >
          Save &amp; add another
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}
