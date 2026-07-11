"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Collection = {
  id: string;
  title: string;
  handle: string;
  products: number;
  smart: boolean;
  image: string | null;
  parent: string | null;
};

const nid = (g: string) => g.split("/").pop() ?? g;

export default function CollectionsPage() {
  const router = useRouter();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"tree" | "grid">("tree");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingParent, setSavingParent] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function load() {
    setLoading(true);
    fetch("/api/collections")
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); setCollections(d.collections ?? []); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  // ---- tree structure ----
  const ids = useMemo(() => new Set(collections.map((c) => c.id)), [collections]);
  const childrenOf = useMemo(() => {
    const m = new Map<string, Collection[]>();
    for (const c of collections) {
      const p = c.parent && ids.has(c.parent) ? c.parent : "__root__";
      if (!m.has(p)) m.set(p, []);
      m.get(p)!.push(c);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.title.localeCompare(b.title));
    return m;
  }, [collections, ids]);

  // descendants of a node (to prevent cycles when choosing a parent)
  function descendantsOf(id: string): Set<string> {
    const out = new Set<string>();
    const walk = (pid: string) => {
      for (const child of childrenOf.get(pid) ?? []) {
        if (!out.has(child.id)) { out.add(child.id); walk(child.id); }
      }
    };
    walk(id);
    return out;
  }

  async function setParent(id: string, parentId: string | null) {
    setSavingParent(id);
    setError("");
    try {
      const res = await fetch(`/api/collections/${nid(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setParent", parentId: parentId ? nid(parentId) : null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, parent: parentId } : c)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingParent("");
    }
  }

  async function create() {
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newTitle }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      router.push(`/collections/${nid(d.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const gridShown = useMemo(
    () => collections.filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase())),
    [collections, q],
  );

  const topLevel = childrenOf.get("__root__") ?? [];

  function toggle(id: string) {
    setCollapsed((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function renderNode(c: Collection, depth: number): React.ReactNode {
    const kids = childrenOf.get(c.id) ?? [];
    const isOpen = !collapsed.has(c.id);
    const blocked = descendantsOf(c.id);
    return (
      <div key={c.id}>
        <div className="flex items-center gap-2 rounded-lg py-2 pr-2 hover:bg-subtle" style={{ paddingLeft: depth * 22 + 4 }}>
          {kids.length > 0 ? (
            <button onClick={() => toggle(c.id)} className="flex h-5 w-5 items-center justify-center rounded text-muted hover:text-ink">{isOpen ? "▾" : "▸"}</button>
          ) : <span className="inline-block h-5 w-5 text-center text-muted/40">·</span>}

          <Link href={`/collections/${nid(c.id)}`} className="flex min-w-0 flex-1 items-center gap-2">
            {c.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.image} alt="" className="h-7 w-7 shrink-0 rounded border border-line object-cover" />
            ) : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-subtle text-xs font-bold text-muted/50">{c.title.charAt(0)}</span>}
            <span className="truncate font-medium text-ink hover:text-accent">{c.title}</span>
            <span className="shrink-0 text-xs text-muted">{c.products}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${c.smart ? "bg-accent/15 text-accent" : "bg-subtle text-muted"}`}>{c.smart ? "Smart" : "Manual"}</span>
            {kids.length > 0 && <span className="shrink-0 rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-medium text-muted">{kids.length} sub</span>}
          </Link>

          <select
            value={c.parent && ids.has(c.parent) ? c.parent : ""}
            disabled={savingParent === c.id}
            onChange={(e) => setParent(c.id, e.target.value || null)}
            className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent"
            title="Move under a parent collection"
          >
            <option value="">— Top level —</option>
            {collections
              .filter((o) => o.id !== c.id && !blocked.has(o.id))
              .sort((a, b) => a.title.localeCompare(b.title))
              .map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        </div>
        {isOpen && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  }

  return (
    <div className="px-8 py-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Collections</h1>
          <p className="text-sm text-muted">
            {collections.length} total · {topLevel.length} top-level · {collections.filter((c) => c.smart).length} smart
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line p-1">
            {(["tree", "grid"] as const).map((f) => (
              <button key={f} onClick={() => setView(f)} className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${view === f ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}>{f}</button>
            ))}
          </div>
          {view === "grid" && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-48 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />}
          <button onClick={() => setCreating(true)} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg transition hover:bg-accent hover:text-accentfg">+ New</button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}

      {creating && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New collection name…" className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
          <button onClick={create} disabled={busy || !newTitle.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accentfg disabled:opacity-50">{busy ? "Creating…" : "Create"}</button>
          <button onClick={() => { setCreating(false); setNewTitle(""); }} className="rounded-lg border border-line px-4 py-2 text-sm text-muted">Cancel</button>
        </div>
      )}

      {loading ? <p className="text-sm text-muted">Loading…</p> : view === "tree" ? (
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="mb-2 px-2 text-xs text-muted">Use the dropdown on each row to nest it under a parent (e.g. put <em>iPhone Cases</em> under <em>Cases</em>). Nest as deep as you like.</p>
          {topLevel.map((c) => renderNode(c, 0))}
          {topLevel.length === 0 && <p className="px-2 py-4 text-sm text-muted">No collections yet.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {gridShown.map((c) => (
            <Link key={c.id} href={`/collections/${nid(c.id)}`} className="group overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-accent hover:shadow-lg">
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-subtle">
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                ) : <span className="text-3xl font-bold text-muted/40">{c.title.charAt(0)}</span>}
              </div>
              <div className="p-4">
                <p className="truncate font-semibold text-ink group-hover:text-accent">{c.title}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span>{c.products} products</span>
                  <span className={`rounded-full px-2 py-0.5 font-medium ${c.smart ? "bg-accent/15 text-accent" : "bg-subtle text-muted"}`}>{c.smart ? "Smart" : "Manual"}</span>
                </div>
              </div>
            </Link>
          ))}
          {gridShown.length === 0 && <p className="text-sm text-muted">No collections match.</p>}
        </div>
      )}
    </div>
  );
}
