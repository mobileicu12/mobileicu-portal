"use client";

import { useEffect, useState } from "react";
import type { PermKey } from "./permissions";

export type Me = { email: string | null; name?: string; role: "owner" | "member" | null; permissions: PermKey[]; canSeeFinance?: boolean; financeExpiresAt?: string | null; financePending?: boolean } | null;

// Shared, deduped fetch: many components call useMe() on a page — we only hit
// /api/me once and share the result (a big win for staff, where it costs a query).
let meCache: Me = null;
let meInflight: Promise<Me> | null = null;
function loadMe(): Promise<Me> {
  if (meCache) return Promise.resolve(meCache);
  if (!meInflight) {
    meInflight = fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      // Normalised on the way in. Every component treats `permissions` as an
      // array, and a response without one — a proxy error page, a stale cached
      // body, a partial deploy — used to throw inside a component that sits in
      // the shared layout, blanking every page in the portal at once.
      .then((d: Me) => {
        meCache = d ? { ...d, permissions: Array.isArray(d.permissions) ? d.permissions : [] } : null;
        return meCache;
      });
  }
  return meInflight;
}

// Current signed-in identity (role + permissions). null until loaded.
export function useMe(): Me {
  const [me, setMe] = useState<Me>(meCache);
  useEffect(() => { let alive = true; loadMe().then((d) => { if (alive) setMe(d); }); return () => { alive = false; }; }, []);
  return me;
}

// True only once we've confirmed the user is the owner (master-password admin counts).
export function useIsOwner(): boolean {
  const me = useMe();
  return me?.role === "owner";
}

// Live finance-visibility gate. Sensitive totals (sales / earnings / profit) are
// hidden for staff by default — even on pages they can open. A staff member
// requests a reveal; the owner approves it for a short window; it then auto-hides.
// This hook polls so a fresh grant (or an early revoke / expiry) is reflected
// without a page reload, and ticks a live countdown while access is active.
export type FinanceGate = {
  visible: boolean;      // may the figures be shown right now?
  pending: boolean;      // this staff member has a request awaiting the owner
  secondsLeft: number;   // remaining seconds on an active grant (0 if none)
  isOwner: boolean;
  loading: boolean;
  request: () => Promise<boolean>;
};

type FinStatus = { visible: boolean; expiresAt: string | null; pending: boolean; owner?: boolean };

export function useFinanceGate(): FinanceGate {
  const me = useMe();
  const isOwner = me?.role === "owner";
  const [status, setStatus] = useState<FinStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!me) return;
    if (isOwner) { setStatus({ visible: true, expiresAt: null, pending: false, owner: true }); return; }
    let alive = true;
    const poll = () =>
      fetch("/api/finance-access/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: FinStatus | null) => { if (alive && d) setStatus(d); })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [me, isOwner]);

  // Only tick a 1s countdown while a grant is actually active.
  useEffect(() => {
    if (!status?.expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status?.expiresAt]);

  const expMs = status?.expiresAt ? +new Date(status.expiresAt) : 0;
  const visible = isOwner || (!!status?.visible && (!expMs || now < expMs));
  const secondsLeft = expMs ? Math.max(0, Math.floor((expMs - now) / 1000)) : 0;

  async function request(): Promise<boolean> {
    try {
      const r = await fetch("/api/finance-access/status", { method: "POST" });
      if (r.ok) setStatus((s) => (s ? { ...s, pending: true } : { visible: false, expiresAt: null, pending: true }));
      return r.ok;
    } catch { return false; }
  }

  return { visible, pending: !!status?.pending, secondsLeft, isOwner: !!isOwner, loading: !isOwner && status === null, request };
}

// Boolean convenience used by pages that simply show/hide finance tiles.
export function useCanSeeFinance(): boolean {
  return useFinanceGate().visible;
}
