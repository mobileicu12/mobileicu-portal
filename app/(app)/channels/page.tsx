"use client";

const STORE = "mobile-icu-cws";

const CHANNELS = [
  { name: "Shopify Storefront", desc: "Your online store — the master catalog.", status: "connected", color: "emerald" },
  { name: "eBay — Account 1", desc: "List & sync via Shopify Marketplace Connect.", status: "setup", color: "muted" },
  { name: "eBay — Account 2", desc: "Second eBay account (region/brand).", status: "setup", color: "muted" },
  { name: "Amazon — Account 1", desc: "List & sync via Marketplace Connect.", status: "setup", color: "muted" },
  { name: "Amazon — Account 2", desc: "Second Amazon account (check policy).", status: "setup", color: "muted" },
];

export default function ChannelsPage() {
  return (
    <div className="px-8 py-7">
      <h1 className="text-2xl font-semibold text-ink">Channels</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Manage everything from the portal — items you add here live in Shopify (the master), then
        publish to your marketplaces with synced inventory. Connect each account once below.
      </p>

      <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">How it works</h2>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-subtle p-3 text-xs text-muted">{`Portal (add/edit items)
   → Shopify (master catalog + stock)
        → eBay #1   → eBay #2
        → Amazon #1 → Amazon #2
  sell anywhere → stock drops everywhere`}</pre>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CHANNELS.map((c) => (
          <div key={c.name} className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-ink">{c.name}</p>
              {c.status === "connected" ? (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connected
                </span>
              ) : (
                <span className="rounded-full bg-subtle px-2.5 py-1 text-xs font-medium text-muted">Not set up</span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted">{c.desc}</p>
            {c.status !== "connected" && (
              <a
                href={`https://admin.shopify.com/store/${STORE}/apps`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg transition hover:bg-accent hover:text-accentfg"
              >
                Connect →
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-ink">
        <p className="font-semibold">Setup (one-time, via Shopify Marketplace Connect)</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Click <strong>Connect</strong> → opens your Shopify Apps. Install <strong>“Marketplace Connect”</strong> (free, by Shopify).</li>
          <li>In the app, choose <strong>eBay</strong> or <strong>Amazon</strong> → <strong>Authenticate</strong> your account (just log in &amp; approve).</li>
          <li>Map your products → publish. Repeat for each account.</li>
          <li>Done — from then on you only add items here in the portal; they flow to every connected account with stock synced.</li>
        </ol>
        <p className="mt-2 text-xs text-muted">⚠️ Amazon limits multiple seller accounts without approval — confirm yours are compliant before connecting both.</p>
      </div>
    </div>
  );
}
