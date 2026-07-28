"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { downloadCustomerReportsZip } from "@/lib/customer-zip";
import { useMe } from "@/lib/use-me";
import { loadPortalSettings } from "@/lib/settings-client";

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

  // After 9 PM, surface a one-click "download today's per-customer reports" ZIP.
  // Only for owner / teammates with invoice access (it contains customer money data).
  const me = useMe();
  const canSeeReports = !!me && (me.role === "owner" || me.permissions.includes("invoices"));
  const [tappedIn, setTappedIn] = useState(false);
  useEffect(() => {
    // Only ask about shifts when the time-clock is actually switched on —
    // otherwise this was a wasted Shopify round trip on every page load.
    loadPortalSettings().then((s) => {
      if (!s?.requireTapIn) return;
      fetch("/api/attendance").then((r) => (r.ok ? r.json() : null)).then((d) => setTappedIn(!!d?.me?.tappedIn)).catch(() => {});
    });
  }, []);
  async function tapOut() {
    if (!confirm("Tap out / end your shift now?")) return;
    await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "out" }) }).catch(() => {});
    window.location.href = "/portal/tap-in";
  }
  const [afterNine, setAfterNine] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const hourRef = useRef(21);
  useEffect(() => {
    loadPortalSettings().then((s) => {
      const h = Number(s?.reportButtonHour);
      if (Number.isFinite(h) && h >= 0 && h <= 23) hourRef.current = h;
    });
    const check = () => setAfterNine(new Date().getHours() >= hourRef.current);
    check();
    const t = setInterval(check, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  async function download() {
    setBusy(true); setFlash("");
    try {
      const { customers } = await downloadCustomerReportsZip({ onlyToday: true });
      setFlash(`✓ ${customers} report(s)`);
      setTimeout(() => setFlash(""), 4000);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Failed");
      setTimeout(() => setFlash(""), 5000);
    } finally { setBusy(false); }
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-8">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold text-ink">MOBILE ICU</span>
        <span className="text-muted/50">/</span>
        <span className="text-muted">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        {afterNine && canSeeReports && (
          <div className="flex items-center gap-2">
            {flash && <span className="hidden text-xs text-muted sm:inline">{flash}</span>}
            <button
              onClick={download}
              disabled={busy}
              title="Download one PDF per customer for today's sales (ZIP)"
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-neutral-900 shadow-sm transition hover:bg-amber-400 disabled:opacity-60"
            >
              <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-900/70" />
              {busy ? "Zipping…" : "⬇ Today's reports"}
            </button>
          </div>
        )}
        {tappedIn && (
          <button onClick={tapOut} title="Tap out / end shift" className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-red-400 hover:text-red-600 dark:border-neutral-700 dark:text-neutral-300">Tap out</button>
        )}
        <span className="hidden items-center gap-2 text-xs text-muted sm:flex">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/50"></span>
          Live
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}
