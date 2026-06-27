"use client";

import { usePathname } from "next/navigation";

const LABELS: { match: (p: string) => boolean; label: string }[] = [
  { match: (p) => p === "/", label: "Dashboard" },
  { match: (p) => p.startsWith("/inventory"), label: "Inventory" },
  { match: (p) => p.startsWith("/customers"), label: "Customers" },
  { match: (p) => p.startsWith("/products/new"), label: "Add Product" },
  { match: (p) => p.startsWith("/import-export"), label: "Import / Export" },
  { match: (p) => p.startsWith("/billing"), label: "Billing / POS" },
  { match: (p) => p.startsWith("/invoices"), label: "Invoices" },
];

export default function AppHeader() {
  const pathname = usePathname();
  const label = LABELS.find((l) => l.match(pathname))?.label ?? "Portal";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-neutral-200 bg-white/85 px-8 backdrop-blur">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold text-neutral-900">MOBILE ICU</span>
        <span className="text-neutral-300">/</span>
        <span className="text-neutral-600">{label}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
        Live · Shopify connected
      </div>
    </header>
  );
}
