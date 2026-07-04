"use client";

import { CHANNELS } from "@/lib/channels";

const STORE = "mobile-icu-cws";

export default function ChannelsPage() {
  return (
    <div className="px-8 py-7">
      <h1 className="text-2xl font-semibold text-ink">Channels</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Assign each product to the marketplaces it should sell on — from the portal. Do it per
        product or in bulk (Inventory → select products → Edit values → Channels). Stock stays
        synced across every channel automatically.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CHANNELS.map((c) => (
          <div key={c.key} className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-ink">{c.label}</p>
              {c.key === "online" ? (
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600">Native</span>
              ) : (
                <span className="rounded-full bg-subtle px-2.5 py-1 text-xs font-medium text-muted">Via connector</span>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">
              Routing tag: <code className="rounded bg-subtle px-1.5 py-0.5 text-accent">{c.tag}</code>
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">How it works</h2>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-subtle p-3 text-xs text-muted">{`Portal: tick channels on a product
   → product gets tags (channel:ebay-1, channel:amazon-1 …)
   → Marketplace Connect lists tagged products to each account
   → one Shopify stock number → synced everywhere`}</pre>
      </div>

      <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-ink">
        <p className="font-semibold">One-time setup for eBay / Amazon</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Install <strong>Marketplace Connect</strong> (free, by Shopify) in your <a className="text-accent underline" href={`https://admin.shopify.com/store/${STORE}/apps`} target="_blank" rel="noreferrer">Shopify Apps</a>.</li>
          <li><strong>Authenticate</strong> each eBay / Amazon account (just log in &amp; approve).</li>
          <li>In the connector, create a listing rule per account: <em>“list products tagged <code>channel:ebay-1</code>”</em>, etc.</li>
          <li>Done — from then on you only tick channels here in the portal; the connector does the listing.</li>
        </ol>
        <p className="mt-2 text-xs text-muted">⚠️ Amazon limits multiple seller accounts without approval — confirm yours are compliant before connecting both.</p>
      </div>
    </div>
  );
}
