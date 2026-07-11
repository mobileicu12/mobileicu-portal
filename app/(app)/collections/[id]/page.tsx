"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CHANNELS } from "@/lib/channels";

type Product = { id: string; title: string; image: string | null; status: string; sku: string; price: string; available: number; variantId: string | null; inventoryItemId: string | null };
type Detail = {
  id: string; title: string; handle: string; descriptionHtml: string; image: string | null;
  smart: boolean; productsCount: number;
  rules: { column: string; relation: string; condition: string }[];
  appliedDisjunctively: boolean;
  products: Product[]; hasNextPage: boolean; endCursor: string | null;
};
type Hit = { id: string; title: string; image: string | null; status: string };
type Loc = { id: string; name: string };
type Col = { id: string; title: string; smart: boolean };

export default function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [c, setC] = useState<Detail | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [descPreview, setDescPreview] = useState(false);

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  // filtering (client-side over loaded products)
  const [fSearch, setFSearch] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fStock, setFStock] = useState("");

  // multi-select + bulk
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [channelDraft, setChannelDraft] = useState<string[]>([]);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [locationId, setLocationId] = useState("");
  const [manualCols, setManualCols] = useState<Col[]>([]);

  function load(after?: string | null, append = false) {
    setLoading(true);
    fetch(`/api/collections/${id}${after ? `?after=${encodeURIComponent(after)}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        const col: Detail = d.collection;
        setC(col);
        setTitle(col.title);
        setDesc(col.descriptionHtml);
        setProducts((prev) => append ? [...prev, ...col.products] : col.products);
        setCursor(col.endCursor);
        setHasNext(col.hasNextPage);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => {
    fetch("/api/locations").then((r) => r.json()).then((d) => { const l = d.locations ?? []; setLocations(l); if (l[0]) setLocationId(l[0].id); }).catch(() => {});
    fetch("/api/collections").then((r) => r.json()).then((d) => setManualCols((d.collections ?? []).filter((x: Col) => !x.smart && x.id !== (id.startsWith("gid") ? id : `gid://shopify/Collection/${id}`)))).catch(() => {});
  }, [id]);

  const shown = useMemo(() => products.filter((p) => {
    if (fStatus && p.status !== fStatus) return false;
    if (fStock === "out" && p.available > 0) return false;
    if (fStock === "in" && p.available <= 0) return false;
    if (fSearch) { const s = fSearch.toLowerCase(); if (!p.title.toLowerCase().includes(s) && !p.sku.toLowerCase().includes(s)) return false; }
    return true;
  }), [products, fStatus, fStock, fSearch]);

  const allSelected = shown.length > 0 && shown.every((p) => selected.has(p.id));
  function toggleRow(pid: string) { setSelected((prev) => { const n = new Set(prev); n.has(pid) ? n.delete(pid) : n.add(pid); return n; }); }
  function toggleAll() { setSelected(allSelected ? new Set() : new Set(shown.map((p) => p.id))); }
  function clearSel() { setSelected(new Set()); setEditMode(false); setChannelDraft([]); }
  const selProducts = useMemo(() => products.filter((p) => selected.has(p.id)), [products, selected]);

  async function saveDetails() {
    setBusy(true); setFlash(""); setError("");
    try {
      const res = await fetch(`/api/collections/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", title, descriptionHtml: desc ?? "" }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setFlash("Saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  async function addProduct(h: Hit) {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/collections/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "addProducts", productIds: [h.id] }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setQ(""); setHits([]);
      setFlash(`Added “${h.title}”.`);
      setTimeout(() => load(), 800);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }
  function onSearch(v: string) {
    setQ(v);
    if (!v.trim()) { setHits([]); return; }
    fetch(`/api/products/search?q=${encodeURIComponent(v)}`).then((r) => r.json()).then((d) => setHits(d.products ?? [])).catch(() => {});
  }

  async function del() {
    if (!confirm("Delete this collection? Products are not deleted, only the collection.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      router.push("/collections");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); setBusy(false); }
  }

  // ---- bulk on selected products ----
  async function runBulk(action: string, extra: Record<string, unknown> = {}) {
    const productIds = selProducts.map((p) => p.id);
    if (!productIds.length) return;
    if (action === "delete" && !confirm(`Delete ${productIds.length} product(s)? This cannot be undone.`)) return;
    setBusy(true); setFlash(""); setError("");
    try {
      const res = await fetch("/api/products/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action, productIds,
          variants: selProducts.filter((p) => p.variantId).map((p) => ({ id: p.variantId, productId: p.id })),
          inventoryItemIds: selProducts.map((p) => p.inventoryItemId).filter(Boolean),
          locationId, ...extra,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Bulk action failed");
      setFlash(`Done: ${d.ok} updated${d.failed ? `, ${d.failed} failed` : ""}.`);
      clearSel(); load();
    } catch (e) { setError(e instanceof Error ? e.message : "Bulk action failed"); } finally { setBusy(false); }
  }

  async function removeFromCollection() {
    const productIds = selProducts.map((p) => p.id);
    if (!productIds.length) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/collections/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "removeProducts", productIds }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setProducts((prev) => prev.filter((p) => !selected.has(p.id)));
      setFlash(`Removed ${productIds.length} from this collection.`);
      clearSel();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  if (loading && !c) return <div className="px-8 py-7 text-sm text-muted">Loading…</div>;
  if (!c) return <div className="px-8 py-7"><p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{error || "Not found"}</p></div>;

  const inputCls = "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent";

  return (
    <div className="px-8 py-7 pb-28">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 -mx-8 mb-5 border-b border-line bg-bg/95 px-8 py-3 backdrop-blur">
        <Link href="/collections" className="text-xs text-muted hover:text-ink">← Collections</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-ink">{c.title}</h1>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${c.smart ? "bg-accent/15 text-accent" : "bg-subtle text-muted"}`}>{c.smart ? "Smart (auto)" : "Manual"} · {c.productsCount} products</span>
            <button onClick={del} disabled={busy} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-500/10 disabled:opacity-60">Delete</button>
          </div>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}
      {flash && <p className="mb-4 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">{flash}</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Details — sticky, internal scroll if long */}
        <div className="space-y-4 lg:col-span-1 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pr-1">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Details</h2>
            <label className="mt-3 block text-sm">
              <span className="text-muted">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
            </label>
            <div className="mt-3 block text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-muted">Description (HTML supported)</span>
                <div className="flex overflow-hidden rounded-lg border border-line text-xs">
                  <button type="button" onClick={() => setDescPreview(false)} className={`px-2.5 py-1 ${!descPreview ? "bg-ink text-bg" : "text-muted"}`}>HTML</button>
                  <button type="button" onClick={() => setDescPreview(true)} className={`px-2.5 py-1 ${descPreview ? "bg-ink text-bg" : "text-muted"}`}>Preview</button>
                </div>
              </div>
              {descPreview ? (
                <div className="min-h-32 rounded-lg border border-line bg-surface p-3 text-sm text-ink [&_a]:text-accent [&_a]:underline [&_img]:max-w-full [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: desc || "<p class='text-muted'>Nothing yet…</p>" }} />
              ) : (
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={6} spellCheck={false} className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink outline-none focus:border-accent" placeholder="<p>HTML here…</p>" />
              )}
            </div>
            <button onClick={saveDetails} disabled={busy} className="mt-3 w-full rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg transition hover:bg-accent hover:text-accentfg disabled:opacity-60">Save details</button>
          </div>

          {c.smart && (
            <div className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Smart rules (auto)</h2>
              <p className="mt-2 text-xs text-muted">Products matching {c.appliedDisjunctively ? "ANY" : "ALL"} of:</p>
              <ul className="mt-2 space-y-1 text-sm text-ink">
                {c.rules.map((r, i) => <li key={i} className="rounded bg-subtle px-2 py-1 text-xs">{r.column} {r.relation} “{r.condition}”</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* Products */}
        <div className="lg:col-span-2">
          {!c.smart && (
            <div className="relative mb-3">
              <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Search products to add to this collection…" className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent" />
              {hits.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-xl">
                  {hits.map((h) => (
                    <button key={h.id} onClick={() => addProduct(h)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-subtle">
                      {h.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={h.image} alt="" className="h-8 w-8 rounded border border-line object-cover" />
                      ) : <div className="h-8 w-8 rounded bg-subtle" />}
                      <span className="flex-1 truncate text-sm text-ink">{h.title}</span>
                      <span className="text-xs text-accent">+ add</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* filter ribbon */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input value={fSearch} onChange={(e) => setFSearch(e.target.value)} placeholder="Filter loaded products…" className={`${inputCls} w-52`} />
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={inputCls}>
              <option value="">Any status</option>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <select value={fStock} onChange={(e) => setFStock(e.target.value)} className={inputCls}>
              <option value="">Any stock</option>
              <option value="in">In stock</option>
              <option value="out">Out of stock</option>
            </select>
            {(fSearch || fStatus || fStock) && <button onClick={() => { setFSearch(""); setFStatus(""); setFStock(""); }} className="rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-ink">Clear</button>}
            <span className="ml-auto text-xs text-muted">{shown.length} shown{hasNext ? " (of loaded)" : ""}</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-24 z-10 border-b border-line bg-subtle text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3 w-10"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-amber-500" /></th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((p) => (
                  <tr key={p.id} className={selected.has(p.id) ? "bg-accent/10" : "hover:bg-subtle"}>
                    <td className="px-4 py-3"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleRow(p.id)} className="h-4 w-4 accent-amber-500" /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt="" className="h-9 w-9 rounded border border-line object-cover" />
                        ) : <div className="h-9 w-9 rounded bg-subtle" />}
                        <div>
                          <Link href={`/products/${p.id.split("/").pop()}/edit`} className="font-medium text-ink hover:text-accent">{p.title}</Link>
                          <p className="text-xs text-muted">{p.sku || "—"} · <span className={p.status === "ACTIVE" ? "text-emerald-500" : "text-muted"}>{p.status}</span></p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink">£{p.price}</td>
                    <td className="px-4 py-3 text-right text-muted">{p.available}</td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted">No products{products.length ? " match the filter." : " in this collection."}</td></tr>}
              </tbody>
            </table>
          </div>
          {hasNext && (
            <div className="mt-4 flex justify-center">
              <button onClick={() => load(cursor, true)} disabled={loading} className="rounded-lg border border-line px-5 py-2 text-sm text-ink hover:border-accent disabled:opacity-60">{loading ? "Loading…" : "Load more"}</button>
            </div>
          )}
        </div>
      </div>

      {/* Bulk ribbon */}
      {selected.size > 0 && (
        <div className="fixed bottom-14 left-1/2 z-40 -translate-x-1/2">
          {editMode && (
            <div className="mb-2 max-w-[92vw] rounded-2xl border border-line bg-surface p-3 shadow-2xl">
              <div className="flex flex-wrap items-center gap-3">
                <BulkValue label="Set price £" placeholder="9.99" onApply={(v) => runBulk("price", { value: Number(v) })} disabled={busy} />
                <BulkValue label="Set stock" placeholder="25" onApply={(v) => runBulk("stock", { value: Number(v) })} disabled={busy} />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Add to collection</span>
                  <select disabled={busy} onChange={(e) => e.target.value && runBulk("collection", { collectionId: e.target.value })} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink" defaultValue="">
                    <option value="" disabled>Choose…</option>
                    {manualCols.map((col) => <option key={col.id} value={col.id}>{col.title}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <span className="text-xs font-medium text-muted">Channels →</span>
                {CHANNELS.map((ch) => (
                  <label key={ch.key} className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs text-ink">
                    <input type="checkbox" value={ch.key} onChange={(e) => setChannelDraft((prev) => e.target.checked ? [...prev, ch.key] : prev.filter((k) => k !== ch.key))} className="h-3.5 w-3.5 accent-amber-500" />
                    {ch.short}
                  </label>
                ))}
                <button disabled={busy || channelDraft.length === 0} onClick={() => runBulk("channels", { addChannels: channelDraft, removeChannels: [] })} className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-accentfg disabled:opacity-50">Assign</button>
                <button disabled={busy || channelDraft.length === 0} onClick={() => runBulk("channels", { addChannels: [], removeChannels: channelDraft })} className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted disabled:opacity-50">Remove</button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 rounded-full border border-line bg-ink px-4 py-2.5 text-sm text-bg shadow-2xl">
            <span className="font-medium">{selected.size} selected</span>
            <span className="h-4 w-px bg-bg/20" />
            <button disabled={busy} onClick={() => runBulk("activate")} className="rounded-full px-3 py-1 hover:bg-bg/10 disabled:opacity-50">Activate</button>
            <button disabled={busy} onClick={() => runBulk("draft")} className="rounded-full px-3 py-1 hover:bg-bg/10 disabled:opacity-50">Draft</button>
            <button disabled={busy} onClick={() => setEditMode((v) => !v)} className={`rounded-full px-3 py-1 hover:bg-bg/10 ${editMode ? "text-accent" : ""}`}>Edit values</button>
            {!c.smart && <button disabled={busy} onClick={removeFromCollection} className="rounded-full px-3 py-1 hover:bg-bg/10 disabled:opacity-50">Remove from collection</button>}
            <button disabled={busy} onClick={() => runBulk("delete")} className="rounded-full px-3 py-1 text-red-400 hover:bg-red-500/20 disabled:opacity-50">Delete</button>
            <span className="h-4 w-px bg-bg/20" />
            <button onClick={clearSel} className="rounded-full px-2 py-1 text-bg/50 hover:text-bg">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BulkValue({ label, placeholder, onApply, disabled }: { label: string; placeholder: string; onApply: (v: string) => void; disabled: boolean }) {
  const [v, setV] = useState("");
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} type="number" step="0.01" className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink" />
      <button disabled={disabled || !v} onClick={() => { onApply(v); setV(""); }} className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-accentfg disabled:opacity-50">Apply</button>
    </div>
  );
}
