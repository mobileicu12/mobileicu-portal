"use client";

import { useEffect, useState } from "react";
import { CHANNELS } from "@/lib/channels";

const STORE = "mobile-icu-cws";
const LS_KEY = "mi-channels-connected";

export default function ChannelsPage() {
  const [connected, setConnected] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(LS_KEY);
      // Online Store is always connected (native Shopify channel).
      const saved = v ? (JSON.parse(v) as string[]) : [];
      setConnected(Array.from(new Set(["online", ...saved])));
    } catch {
      setConnected(["online"]);
    }
    setLoaded(true);
  }, []);

  function toggle(key: string) {
    if (key === "online") return; // always on
    setConnected((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(next.filter((k) => k !== "online")));
      } catch {}
      return next;
    });
  }

  return (
    <div className="px-8 py-7">
      <h1 className="text-2xl font-semibold text-ink">Channels</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Route products to the marketplaces you sell on. Mark each channel connected once you&apos;ve
        linked it in Marketplace Connect, then assign products (Inventory → select → Edit values →
        Channels). Stock stays synced across every channel automatically.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CHANNELS.map((c) => {
          const isOn = connected.includes(c.key);
          return (
            <div key={c.key} className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-ink">{c.label}</p>
                {isOn ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connected
                  </span>
                ) : (
                  <span className="rounded-full bg-subtle px-2.5 py-1 text-xs font-medium text-muted">Not connected</span>
                )}
              </div>
              <p className="mt-2 text-xs text-muted">
                Routing tag: <code className="rounded bg-subtle px-1.5 py-0.5 text-accent">{c.tag}</code>
              </p>
              {c.key !== "online" && loaded && (
                <button
                  onClick={() => toggle(c.key)}
                  className={`mt-4 w-full rounded-lg px-4 py-2 text-sm font-medium transition ${
                    isOn
                      ? "border border-line text-muted hover:border-red-500/40 hover:text-red-500"
                      : "bg-ink text-bg hover:bg-accent hover:text-accentfg"
                  }`}
                >
                  {isOn ? "Mark as not connected" : "Mark as connected"}
                </button>
              )}
              {c.key === "online" && (
                <p className="mt-4 text-xs text-muted/70">Native Shopify channel — always on.</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">How routing works</h2>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-subtle p-3 text-xs text-muted">{`Portal: tick channels on products (bulk or single)
   → products get tags (channel:ebay-1, channel:amazon-1 …)
   → Marketplace Connect lists tagged products to each account
   → one Shopify stock number → synced everywhere`}</pre>
        <p className="mt-3 text-xs text-muted">
          Note: Shopify doesn&apos;t expose Marketplace Connect&apos;s account connections to other
          apps, so the portal can&apos;t auto-detect them — mark them here once. The product routing
          (tags) works regardless.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-ink">
        <p className="font-semibold">Connect a marketplace (in Marketplace Connect)</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Open <a className="text-accent underline" href={`https://admin.shopify.com/store/${STORE}/apps`} target="_blank" rel="noreferrer">Shopify Apps → Marketplace Connect</a>.</li>
          <li>Authenticate the eBay / Amazon account, then create a listing rule: <em>“list products tagged <code>channel:ebay-1</code>”</em> (match the routing tag above).</li>
          <li>Come back here and <strong>mark that channel connected</strong>.</li>
        </ol>
      </div>
    </div>
  );
}
