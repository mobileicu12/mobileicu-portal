"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Stats = {
  products: number;
  outOfStock: number;
  lowStock: number;
  collections: number;
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState("");

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
        <p className="text-sm text-neutral-500">MOBILE ICU — control portal</p>
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

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total products" value={stats?.products} tone="ink" />
        <Stat label="Low stock (≤5)" value={stats?.lowStock} tone="amber" />
        <Stat label="Out of stock" value={stats?.outOfStock} tone="red" />
        <Stat label="Collections" value={stats?.collections} tone="ink" />
      </div>

      <h2 className="mt-9 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Quick actions
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ActionCard href="/inventory" title="Manage inventory" desc="Search, edit stock, bulk update." />
        <ActionCard href="/products/new" title="Add a product" desc="Create a product with all details." />
        <ActionCard href="/import-export" title="Import / Export" desc="Bulk add via Excel; export catalog." />
        <ActionCard href="/billing" title="New bill / invoice" desc="Wholesale invoice or POS sale." />
        <ActionCard href="/invoices" title="View invoices" desc="Past bills and orders." />
      </div>
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
