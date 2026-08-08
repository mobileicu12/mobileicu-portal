"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BUSINESS } from "@/lib/business";
import { useFinanceGate } from "@/lib/use-me";
import { FinanceLockBar, FinanceApprovals } from "@/components/Finance";

type Stats = {
  products: number;
  outOfStock: number;
  lowStock: number;
  collections: number;
  lowStockThreshold?: number;
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState("");
  const finance = useFinanceGate();

  useEffect(() => {
    fetch("/api/stats")
      .then(async (r) => {
        if (r.status === 503) {
          setNotConfigured(true);
          return null;
        }
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed");
        return d;
      })
      .then((d) => d && setStats(d))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="px-8 py-7 pb-16">
      <div className="sticky top-0 z-20 -mx-8 mb-5 border-b border-neutral-200 bg-white/95 px-8 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Dashboard</h1>
        <p className="text-sm text-neutral-500">{BUSINESS.name} — control portal</p>
      </div>

      {notConfigured && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-neutral-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-neutral-200">
          <strong className="font-semibold">Connect Shopify to begin.</strong> Add your{" "}
          <code>SHOPIFY_CLIENT_ID</code> and <code>SHOPIFY_CLIENT_SECRET</code> (or a{" "}
          <code>SHOPIFY_ADMIN_TOKEN</code>) to <code>.env.local</code> and restart the server.
        </div>
      )}
      {error && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Owner: approve/deny staff requests to view financial figures. */}
      <FinanceApprovals />

      {/* Sensitive money figures — hidden for staff until the owner approves a
          temporary reveal. Owners (and granted staff) see the live takings. */}
      {finance.visible ? <TodayTakings /> : <div className="mt-6"><FinanceLockBar label="Today's takings & totals" /></div>}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total products" value={stats?.products} tone="ink" />
        <Stat label={`Low stock (≤${stats?.lowStockThreshold ?? 5})`} value={stats?.lowStock} tone="amber" />
        <Stat label="Out of stock" value={stats?.outOfStock} tone="red" />
        <Stat label="Collections" value={stats?.collections} tone="ink" />
      </div>

      <h2 className="mt-9 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Quick actions
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ActionCard href="/portal/inventory" title="Manage inventory" desc="Search, edit stock, bulk update." />
        <ActionCard href="/portal/products/new" title="Add a product" desc="Create a product with all details." />
        <ActionCard href="/portal/import-export" title="Import / Export" desc="Bulk add via Excel; export catalog." />
        <ActionCard href="/portal/billing" title="New bill / invoice" desc="Wholesale invoice or POS sale." />
        <ActionCard href="/portal/invoices" title="View invoices" desc="Past bills and orders." />
      </div>
    </div>
  );
}

type Takings = {
  count: number; total: number; paid: number; retail: number; wholesale: number; marketplace: number;
  outstanding: number; ledgerToday: number; collectedToday: number;
  byMethod: Record<string, number>;
  latest: { invoiceNo: string; customer: string; total: number; paid: boolean; createdAt: string } | null;
};

function TodayTakings() {
  const [t, setT] = useState<Takings | null>(null);
  const [view, setView] = useState<"all" | "cash" | "card">("all");
  useEffect(() => {
    fetch("/api/reports/today").then((r) => (r.ok ? r.json() : null)).then(setT).catch(() => {});
  }, []);
  if (!t) return null;
  const gbp = (n: number) => `£${(n || 0).toFixed(2)}`;
  const headline = view === "cash" ? (t.byMethod.cash || 0) : view === "card" ? (t.byMethod.card || 0) : t.total;

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-gradient-to-br from-neutral-900 to-neutral-800 p-5 text-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Today&apos;s takings · {t.count} sale{t.count === 1 ? "" : "s"}</p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight">{gbp(headline)}</p>
          <p className="mt-1 text-sm text-neutral-300">
            {view === "all" ? "Retail + wholesale combined" : view === "cash" ? "Cash taken today" : "Card taken today"}
          </p>
        </div>
        <div className="flex rounded-full border border-white/20 p-1 text-xs">
          {(["all", "cash", "card"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 font-semibold capitalize transition ${view === v ? "bg-amber-500 text-neutral-900" : "text-neutral-300 hover:text-white"}`}>{v}</button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniTile label="Retail" value={gbp(t.retail)} />
        <MiniTile label="Wholesale" value={gbp(t.wholesale)} />
        <MiniTile label="Cash" value={gbp(t.byMethod.cash || 0)} />
        <MiniTile label="Card" value={gbp(t.byMethod.card || 0)} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <MiniTile label={t.ledgerToday > 0 ? "Collected today (sales + on-account)" : "Collected today"} value={gbp(t.collectedToday)} />
        <MiniTile label="Total outstanding" value={gbp(t.outstanding)} accent="amber" />
      </div>

      {t.latest && (
        <Link href="/portal/invoices" className="mt-4 flex items-center justify-between rounded-xl bg-white/10 px-4 py-2.5 text-sm transition hover:bg-white/15">
          <span className="text-neutral-300">Latest sale · <strong className="text-white">{t.latest.invoiceNo}</strong> · {t.latest.customer}</span>
          <span className="font-semibold text-amber-400">{gbp(t.latest.total)} {t.latest.paid ? "· paid" : ""}</span>
        </Link>
      )}
    </div>
  );
}

function MiniTile({ label, value, accent }: { label: string; value: string; accent?: "amber" }) {
  return (
    <div className="rounded-xl bg-white/10 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${accent === "amber" ? "text-amber-400" : ""}`}>{value}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | undefined;
  tone: "ink" | "amber" | "red";
}) {
  const color =
    tone === "amber" ? "text-amber-600" : tone === "red" ? "text-red-600" : "text-neutral-900 dark:text-neutral-100";
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${color}`}>
        {value === undefined ? "—" : value.toLocaleString()}
      </p>
    </div>
  );
}

function ActionCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-amber-400 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <p className="font-semibold text-neutral-900 group-hover:text-amber-600 dark:text-neutral-100">{title}</p>
      <p className="mt-1 text-sm text-neutral-500">{desc}</p>
    </Link>
  );
}
