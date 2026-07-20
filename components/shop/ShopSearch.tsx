"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Hit = { handle: string; title: string; image: string | null; label: string; available: boolean };

export default function ShopSearch({ variant = "desktop", onNavigate }: { variant?: "desktop" | "mobile"; onNavigate?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const term = q.trim();
    if (term.length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shop/search?q=${encodeURIComponent(term)}`);
        const d = await res.json();
        setHits(d.hits ?? []);
        setActive(-1);
      } catch { setHits([]); } finally { setLoading(false); }
    }, 220);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function go(handle: string) {
    setOpen(false); setQ(""); setHits([]);
    onNavigate?.();
    router.push(`/shop/p/${handle}`);
  }
  function submitAll(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    setOpen(false);
    onNavigate?.();
    router.push(`/shop/search?q=${encodeURIComponent(term)}`);
  }
  function onKey(e: React.KeyboardEvent) {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, -1)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); go(hits[active].handle); }
    else if (e.key === "Escape") setOpen(false);
  }

  const wide = variant === "mobile";
  return (
    <div ref={boxRef} className={`relative ${wide ? "w-full" : ""}`}>
      <form onSubmit={submitAll}>
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Search parts, brands, models…"
          aria-label="Search"
          autoComplete="off"
          className={`rounded-full border border-neutral-300 bg-neutral-50 py-2 pl-9 pr-3 text-sm outline-none transition-[width,box-shadow] duration-300 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-200 ${wide ? "w-full py-2.5" : "w-40 focus:w-64 lg:w-48"}`}
        />
      </form>

      {open && q.trim().length >= 2 && (
        <div className={`absolute z-50 mt-2 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl ${wide ? "left-0 right-0" : "right-0 w-80"}`}>
          {loading && hits.length === 0 && <p className="px-4 py-3 text-sm text-neutral-400">Searching…</p>}
          {!loading && hits.length === 0 && <p className="px-4 py-3 text-sm text-neutral-400">No matches for “{q.trim()}”.</p>}
          {hits.map((h, i) => (
            <button
              key={h.handle}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(h.handle)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${active === i ? "bg-amber-50" : "hover:bg-neutral-50"}`}
            >
              {h.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.image} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-neutral-200 object-cover" />
              ) : <div className="h-10 w-10 shrink-0 rounded-lg bg-neutral-100" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-900">{h.title}</span>
                {h.label && <span className="block truncate text-xs text-amber-600">{h.label}</span>}
              </span>
              {!h.available && <span className="shrink-0 text-[11px] font-medium text-neutral-400">Sold out</span>}
            </button>
          ))}
          {hits.length > 0 && (
            <button onClick={submitAll} className="block w-full border-t border-neutral-100 bg-neutral-50 px-4 py-2.5 text-left text-sm font-semibold text-amber-600 hover:bg-neutral-100">
              See all results for “{q.trim()}” →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
