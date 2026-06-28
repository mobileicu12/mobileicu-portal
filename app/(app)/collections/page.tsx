"use client";

import { useEffect, useMemo, useState } from "react";

type Collection = {
  id: string;
  title: string;
  handle: string;
  products: number;
  smart: boolean;
  image: string | null;
};

const STORE = "mobile-icu-cws";

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "smart" | "manual">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/collections")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        setCollections(d.collections ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => {
    return collections.filter((c) => {
      if (filter === "smart" && !c.smart) return false;
      if (filter === "manual" && c.smart) return false;
      if (q && !c.title.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [collections, filter, q]);

  return (
    <div className="px-8 py-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Collections</h1>
          <p className="text-sm text-muted">
            {collections.length} collections ·{" "}
            {collections.filter((c) => c.smart).length} smart ·{" "}
            {collections.filter((c) => !c.smart).length} manual
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line p-1">
            {(["all", "smart", "manual"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${filter === f ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search collections…"
            className="w-56 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((c) => (
            <a
              key={c.id}
              href={`https://admin.shopify.com/store/${STORE}/collections/${c.id.split("/").pop()}`}
              target="_blank"
              rel="noreferrer"
              className="group overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-accent hover:shadow-lg"
            >
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-subtle">
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                ) : (
                  <span className="text-3xl font-bold text-muted/40">{c.title.charAt(0)}</span>
                )}
              </div>
              <div className="p-4">
                <p className="truncate font-semibold text-ink group-hover:text-accent">{c.title}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span>{c.products} products</span>
                  <span className={`rounded-full px-2 py-0.5 font-medium ${c.smart ? "bg-accent/15 text-accent" : "bg-subtle text-muted"}`}>
                    {c.smart ? "Smart" : "Manual"}
                  </span>
                </div>
              </div>
            </a>
          ))}
          {shown.length === 0 && <p className="text-sm text-muted">No collections match.</p>}
        </div>
      )}
    </div>
  );
}
