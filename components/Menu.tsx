"use client";

import { useEffect, useRef, useState } from "react";

// Lightweight animated dropdown menu (scale/fade in). Reusable across the portal.
export function Menu({ label, align = "right", children }: { label: React.ReactNode; align?: "left" | "right"; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
      >
        {label}
        <svg className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
      </button>
      <div
        onClick={() => setOpen(false)}
        className={`absolute ${align === "right" ? "right-0" : "left-0"} z-30 mt-1.5 min-w-[13rem] origin-top rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl transition duration-150 ease-out dark:border-neutral-700 dark:bg-neutral-900 ${open ? "scale-100 opacity-100" : "pointer-events-none -translate-y-1 scale-95 opacity-0"}`}
      >
        {children}
      </div>
    </div>
  );
}

export function MenuItem({ onClick, children, danger }: { onClick?: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${danger ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"}`}
    >
      {children}
    </button>
  );
}
