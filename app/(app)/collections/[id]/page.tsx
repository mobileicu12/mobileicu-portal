"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Product = { id: string; title: string; image: string | null; status: string; sku: string; price: string; available: number };
type Detail = {
  id: string; title: string; handle: string; descriptionHtml: string; image: string | null;
  smart: boolean; productsCount: number;
  rules: { column: string; relation: string; condition: string }[];
  appliedDisjunctively: boolean;
  products: Product[]; hasNextPage: boolean; endCursor: string | null;
};
type Hit = { id: string; title: string; image: string | null; status: string };

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

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  function load(after?: string | null, append = false) {
    setLoading(true);
    fetch(`/api/collections/${id}${after ? `?after=${encodeURIComponent(after)}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        const col: Detail = d.collection;
        setC(col);
        setTitle(col.title);
        setDesc(col.descriptionHtml.replace(/<[^>]+>/g, "").trim());
        setProducts((prev) => append ? [...prev, ...col.products] : col.products);
        setCursor(col.endCursor);
        setHasNext(col.hasNextPage);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function saveDetails() {
    setBusy(true); setFlash(""); setError("");
    try {
      const res = await fetch(`/api/collections/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", title, descriptionHtml: desc ? `<p>${desc}</p>` : "" }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setFlash("Saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  async function removeProduct(pid: string) {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/collections/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "removeProducts", productIds: [pid] }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setProducts((prev) => prev.filter((p) => p.id !== pid));
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  async function addProduct(h: Hit) {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/collections/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "addProducts", productIds: [h.id] }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setQ(""); setHits([]);
      setFlash(`Added “${h.title}”.`);
      setTimeout(() => load(), 800); // give Shopify a moment
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

  if (loading && !c) return <div className="px-8 py-7 text-sm text-muted">Loading…</div>;
  if (!c) return <div className="px-8 py-7"><p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{error || "Not found"}</p></div>;

  return (
    <div className="px-8 py-7">
      <Link href="/collections" className="text-sm text-muted hover:text-ink">← Collections</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">{c.title}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${c.smart ? "bg-accent/15 text-accent" : "bg-subtle text-muted"}`}>{c.smart ? "Smart (auto)" : "Manual"} · {c.productsCount} products</span>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}
      {flash && <p className="mt-4 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">{flash}</p>}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* Details / edit */}
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Details</h2>
            <label className="mt-3 block text-sm">
              <span className="text-muted">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
            </label>
            <label className="mt-3 block text-sm">
              <span className="text-muted">Description</span>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
            </label>
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

          <button onClick={del} disabled={busy} className="w-full rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-500 transition hover:bg-red-500/10 disabled:opacity-60">Delete collection</button>
        </div>

        {/* Products */}
        <div className="lg:col-span-2">
          {!c.smart && (
            <div className="relative mb-3">
              <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Search products to add…" className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent" />
              {hits.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-xl">
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
          {c.smart && <p className="mb-3 rounded-lg bg-subtle px-4 py-2 text-xs text-muted">This is a smart collection — products are added automatically by the rules. Edit tags/type on products (or the rules in Shopify) to change membership.</p>}

          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-subtle text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Stock</th>
                  {!c.smart && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-subtle">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt="" className="h-9 w-9 rounded border border-line object-cover" />
                        ) : <div className="h-9 w-9 rounded bg-subtle" />}
                        <div>
                          <p className="font-medium text-ink">{p.title}</p>
                          <p className="text-xs text-muted">{p.sku || "—"} · {p.status}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink">£{p.price}</td>
                    <td className="px-4 py-3 text-muted">{p.available}</td>
                    {!c.smart && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => removeProduct(p.id)} disabled={busy} className="text-xs text-red-500 hover:underline">remove</button>
                      </td>
                    )}
                  </tr>
                ))}
                {products.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted">No products in this collection.</td></tr>}
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
    </div>
  );
}
