"use client";

import { useEffect, useState } from "react";
import type { PermKey } from "./permissions";

export type Me = { email: string | null; name?: string; role: "owner" | "member" | null; permissions: PermKey[] } | null;

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
      .then((d: Me) => { meCache = d; return d; });
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

// Who may see business totals — total sales / earnings / paid figures.
// Owner always; a teammate must be granted the "reports" permission.
// Everyone else (default staff) sees only outstanding balances + today's collection.
export function useCanSeeFinance(): boolean {
  const me = useMe();
  if (!me) return false;
  return me.role === "owner" || me.permissions.includes("reports");
}
