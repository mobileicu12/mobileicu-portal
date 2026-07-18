"use client";

import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const LABELS: { match: (p: string) => boolean; label: string }[] = [
  { match: (p) => p === "/portal", label: "Dashboard" },
  { match: (p) => p.startsWith("/portal/inventory"), label: "Inventory" },
  { match: (p) => p.startsWith("/portal/collections"), label: "Collections" },
  { match: (p) => p.startsWith("/portal/customers"), label: "Customers" },
  { match: (p) => p.startsWith("/portal/products/new"), label: "Add Product" },
  { match: (p) => p.startsWith("/portal/import-export"), label: "Import / Export" },
  { match: (p) => p.startsWith("/portal/billing"), label: "Billing / POS" },
  { match: (p) => p.startsWith("/portal/invoices"), label: "Invoices" },
  { match: (p) => p.startsWith("/portal/orders"), label: "Orders" },
  { match: (p) => p.startsWith("/portal/channels"), label: "Channels" },
  { match: (p) => p.startsWith("/portal/settings"), label: "Settings" },
  { match: (p) => p.startsWith("/portal/users"), label: "Team & access" },
];

export default function AppHeader() {
  const pathname = usePathname();
  const label = LABELS.find((l) => l.match(pathname))?.label ?? "Portal";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-8">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold text-ink">MOBILE ICU</span>
        <span className="text-muted/50">/</span>
        <span className="text-muted">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-2 text-xs text-muted sm:flex">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/50"></span>
          Live
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}
