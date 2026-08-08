"use client";

import { useCallback, useEffect, useState } from "react";
import { useFinanceGate } from "@/lib/use-me";

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Shown at the top of any section that contains sensitive figures. For the owner
// it renders nothing (they always see). For staff it shows the current state:
// hidden (with a Request button), waiting for approval, or a live countdown.
export function FinanceLockBar({ label = "Financial figures" }: { label?: string }) {
  const gate = useFinanceGate();
  const [busy, setBusy] = useState(false);
  if (gate.isOwner) return null;
  if (gate.loading) return null;

  if (gate.visible) {
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
        <span>👁 {label} are visible.</span>
        {gate.secondsLeft > 0 && <span className="font-semibold tabular-nums">Auto-hides in {mmss(gate.secondsLeft)}</span>}
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
      <span>🔒 {label} are hidden.</span>
      {gate.pending ? (
        <span className="font-medium">Access requested — waiting for the owner to approve.</span>
      ) : (
        <button
          onClick={async () => { setBusy(true); await gate.request(); setBusy(false); }}
          disabled={busy}
          className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-neutral-900 transition hover:bg-amber-400 disabled:opacity-60"
        >
          {busy ? "Requesting…" : "Request access"}
        </button>
      )}
    </div>
  );
}

type FinReq = { email: string; name: string; at: string };
type FinGrant = { email: string; expiresAt: string };

// Owner-only panel: approve/deny staff requests to view financial figures, and
// revoke active grants immediately. Polls so new requests appear on their own.
export function FinanceApprovals() {
  const gate = useFinanceGate();
  const [data, setData] = useState<{ requests: FinReq[]; grants: FinGrant[]; grantMinutes: number } | null>(null);
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    fetch("/api/finance-access")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData({ requests: d.requests || [], grants: d.grants || [], grantMinutes: d.grantMinutes || 15 }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!gate.isOwner) return;
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [gate.isOwner, load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!gate.isOwner || !data) return null;

  async function act(action: "approve" | "revoke", email: string) {
    setBusy(email + action);
    try {
      await fetch("/api/finance-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, email }) });
      load();
    } finally { setBusy(""); }
  }

  const { requests, grants } = data;
  const hasActivity = requests.length > 0 || grants.length > 0;

  return (
    <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">🔐 Financial access</h2>
        {requests.length > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-neutral-900">{requests.length} waiting</span>}
      </div>

      {!hasActivity && <p className="mt-2 text-xs text-neutral-500">No staff are requesting or currently viewing financial figures.</p>}

      {requests.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Requests</p>
          <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {requests.map((r) => (
              <div key={r.email} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">{r.name}</p>
                  <p className="truncate text-xs text-neutral-500">{r.email} · asked {new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => act("approve", r.email)} disabled={!!busy} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">Approve {data.grantMinutes}m</button>
                  <button onClick={() => act("revoke", r.email)} disabled={!!busy} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:border-neutral-900 dark:border-neutral-700 dark:text-neutral-300">Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {grants.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Currently viewing</p>
          <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {grants.map((g) => {
              const left = Math.max(0, Math.floor((+new Date(g.expiresAt) - now) / 1000));
              return (
                <div key={g.email} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">{g.email}</p>
                    <p className="text-xs text-emerald-600 tabular-nums">visible for {mmss(left)}</p>
                  </div>
                  <button onClick={() => act("revoke", g.email)} disabled={!!busy} className="shrink-0 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60">Revoke now</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
