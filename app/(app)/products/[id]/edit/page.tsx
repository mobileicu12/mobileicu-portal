"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const TYPE_CHOICES = ["", "LCD", "Batteries", "Cables", "Chargers", "Car Chargers", "Adptors", "Holders", "Cases", "Screen Protectors", "Audio", "Power Banks", "Parts"];

type Img = { id: string; url: string };
type Product = {
  id: string; title: string; handle: string; descriptionHtml: string; status: string;
  vendor: string; productType: string; tags: string[]; brand: string; type: string; model: string;
  images: Img[]; variantId: string; sku: string; barcode: string; price: string; compareAt: string;
  available: number; collections: { id: string; title: string }[];
};

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent";

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [p, setP] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const [newImg, setNewImg] = useState("");
  const [descPreview, setDescPreview] = useState(false);

  function load() {
    fetch(`/api/products/${id}`).then((r) => r.json()).then((d) => {
      if (d.error) { setError(d.error); return; }
      const pr: Product = d.product;
      setP(pr);
      setF({
        title: pr.title, status: pr.status, descriptionHtml: pr.descriptionHtml,
        brand: pr.brand, type: pr.type, model: pr.model, productType: pr.productType, vendor: pr.vendor,
        tags: pr.tags.join(", "), price: pr.price, compareAt: pr.compareAt, sku: pr.sku, barcode: pr.barcode,
        stock: String(pr.available),
      });
    }).catch((e) => setError(e.message));
  }
  useEffect(load, [id]);

  function set(k: string, v: string) { setF((prev) => ({ ...prev, [k]: v })); }

  async function save() {
    if (!p) return;
    setSaving(true); setError(""); setFlash("");
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update", variantId: p.variantId,
          title: f.title, status: f.status,
          descriptionHtml: f.descriptionHtml ?? "",
          brand: f.brand, type: f.type, model: f.model, productType: f.productType, vendor: f.vendor, tags: f.tags,
          price: f.price, compareAt: f.compareAt, sku: f.sku, barcode: f.barcode, stock: f.stock,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Save failed");
      setFlash("Saved ✓");
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
  }

  async function addImage() {
    if (!newImg.trim()) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/products/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "addImage", url: newImg.trim() }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setNewImg(""); setTimeout(load, 1200);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  async function delImage(mediaId: string) {
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/products/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteImage", mediaId }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setP((prev) => prev ? { ...prev, images: prev.images.filter((i) => i.id !== mediaId) } : prev);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  if (error && !p) return <div className="px-8 py-7"><p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p></div>;
  if (!p) return <div className="px-8 py-7 text-sm text-muted">Loading…</div>;

  return (
    <div className="px-8 py-7 pb-24">
      {/* Ribbon */}
      <div className="sticky top-0 z-20 -mx-8 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg/90 px-8 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/inventory" className="text-sm text-muted hover:text-ink">← Inventory</Link>
          <h1 className="text-lg font-semibold text-ink">Edit product</h1>
        </div>
        <div className="flex items-center gap-2">
          {flash && <span className="text-sm text-emerald-600">{flash}</span>}
          <a href={`https://mobile-icu-cws.myshopify.com/products/${p.handle}`} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-ink">View</a>
          <button onClick={save} disabled={saving} className="rounded-lg bg-ink px-5 py-2 text-sm font-medium text-bg transition hover:bg-accent hover:text-accentfg disabled:opacity-60">{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Basics">
            <Field label="Title"><input className={input} value={f.title} onChange={(e) => set("title", e.target.value)} /></Field>
            <div className="block text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-muted">Description (HTML supported)</span>
                <div className="flex overflow-hidden rounded-lg border border-line text-xs">
                  <button type="button" onClick={() => setDescPreview(false)} className={`px-2.5 py-1 ${!descPreview ? "bg-ink text-bg" : "text-muted"}`}>HTML</button>
                  <button type="button" onClick={() => setDescPreview(true)} className={`px-2.5 py-1 ${descPreview ? "bg-ink text-bg" : "text-muted"}`}>Preview</button>
                </div>
              </div>
              {descPreview ? (
                <div className="prose-sm min-h-40 rounded-lg border border-line bg-surface p-3 text-sm text-ink [&_a]:text-accent [&_a]:underline [&_h1]:font-semibold [&_h2]:font-semibold [&_img]:max-w-full [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: f.descriptionHtml || "<p class='text-muted'>Nothing yet…</p>" }} />
              ) : (
                <textarea rows={10} spellCheck={false} className={`${input} font-mono text-xs`} value={f.descriptionHtml} onChange={(e) => set("descriptionHtml", e.target.value)} placeholder="<p>Paste or write HTML here…</p>" />
              )}
            </div>
          </Card>

          <Card title="Photos">
            <div className="flex flex-wrap gap-3">
              {p.images.map((img) => (
                <div key={img.id} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="h-24 w-24 rounded-lg border border-line object-cover" />
                  <button onClick={() => delImage(img.id)} className="absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs text-white group-hover:flex">✕</button>
                </div>
              ))}
              {p.images.length === 0 && <p className="text-sm text-muted">No images yet.</p>}
            </div>
            <div className="mt-3 flex gap-2">
              <input className={input} placeholder="Paste image URL to add…" value={newImg} onChange={(e) => setNewImg(e.target.value)} />
              <button onClick={addImage} disabled={saving || !newImg.trim()} className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accentfg disabled:opacity-50">Add</button>
            </div>
          </Card>

          <Card title="Attributes (metadata)">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Brand"><input className={input} value={f.brand} onChange={(e) => set("brand", e.target.value)} /></Field>
              <Field label="Type"><select className={input} value={f.type} onChange={(e) => set("type", e.target.value)}>{TYPE_CHOICES.map((t) => <option key={t} value={t}>{t || "—"}</option>)}</select></Field>
              <Field label="Model(s) (comma separated)"><input className={input} value={f.model} onChange={(e) => set("model", e.target.value)} /></Field>
              <Field label="Tags (comma separated)"><input className={input} value={f.tags} onChange={(e) => set("tags", e.target.value)} /></Field>
              <Field label="Shopify product type"><input className={input} value={f.productType} onChange={(e) => set("productType", e.target.value)} /></Field>
              <Field label="Vendor"><input className={input} value={f.vendor} onChange={(e) => set("vendor", e.target.value)} /></Field>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Status">
            <select className={input} value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="ACTIVE">Active (visible)</option>
              <option value="DRAFT">Draft (hidden)</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </Card>
          <Card title="Pricing & stock">
            <Field label="Price (£)"><input type="number" step="0.01" className={input} value={f.price} onChange={(e) => set("price", e.target.value)} /></Field>
            <Field label="Compare-at (£)"><input type="number" step="0.01" className={input} value={f.compareAt} onChange={(e) => set("compareAt", e.target.value)} /></Field>
            <Field label="SKU"><input className={input} value={f.sku} onChange={(e) => set("sku", e.target.value)} /></Field>
            <Field label="Barcode"><input className={input} value={f.barcode} onChange={(e) => set("barcode", e.target.value)} /></Field>
            <Field label="Stock"><input type="number" className={input} value={f.stock} onChange={(e) => set("stock", e.target.value)} /></Field>
          </Card>
          <Card title="Collections">
            {p.collections.length === 0 ? <p className="text-sm text-muted">None</p> : (
              <div className="flex flex-wrap gap-1.5">
                {p.collections.map((c) => <Link key={c.id} href={`/collections/${c.id.split("/").pop()}`} className="rounded-full bg-subtle px-2.5 py-1 text-xs text-ink hover:text-accent">{c.title}</Link>)}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block text-muted">{label}</span>{children}</label>;
}
