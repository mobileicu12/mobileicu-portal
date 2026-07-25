"use client";

import { useEffect, useRef, useState } from "react";

export type ColumnDef = { key: string; label: string; locked?: boolean };

// Small dropdown to toggle which optional columns show; remembers choice in localStorage.
export function useColumns(storageKey: string, columns: ColumnDef[], defaultHidden: string[] = []) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      // First visit (nothing stored) → apply the caller's default-hidden set.
      setHidden(new Set(raw ? JSON.parse(raw) : defaultHidden));
    } catch { setHidden(new Set(defaultHidden)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  function toggle(key: string) {
    setHidden((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      try { localStorage.setItem(storageKey, JSON.stringify([...n])); } catch { /* ignore */ }
      return n;
    });
  }
  const isVisible = (key: string) => !hidden.has(key);
  return { columns, isVisible, toggle, hidden };
}

export default function ColumnChooser({ columns, isVisible, toggle }: { columns: ColumnDef[]; isVisible: (k: string) => boolean; toggle: (k: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200" title="Choose columns">⋯ Columns</button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-neutral-200 bg-white p-2 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
          {columns.map((c) => (
            <label key={c.key} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${c.locked ? "text-neutral-400" : "cursor-pointer text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"}`}>
              <input type="checkbox" checked={c.locked || isVisible(c.key)} disabled={c.locked} onChange={() => toggle(c.key)} className="h-4 w-4 accent-amber-500" />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Reusable sort state: click a column to sort, click again to flip direction.
export function useSort<K extends string>(initial: K, initialDir: "asc" | "desc" = "desc") {
  const [key, setKey] = useState<K>(initial);
  const [dir, setDir] = useState<"asc" | "desc">(initialDir);
  function onSort(k: K) {
    if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setKey(k); setDir("asc"); }
  }
  function setSort(k: K, d: "asc" | "desc") { setKey(k); setDir(d); }
  const arrow = (k: K) => (k === key ? (dir === "asc" ? " ▲" : " ▼") : "");
  return { key, dir, onSort, setSort, arrow };
}
