"use client";

import { useEffect, useState } from "react";
import type { PermKey } from "./permissions";

export type Me = { email: string | null; name?: string; role: "owner" | "member" | null; permissions: PermKey[] } | null;

// ---- Shared identity fetch ----
// The sidebar, mobile nav, header and today's-send drawer all need "who am I",
// and each used to fetch /api/me on mount — four identical Shopify-backed round
// trips per page load, all racing each other. They now share one request.
let cached: Me | undefined;
let inflight: Promise<Me> | null = null;

function loadMe(): Promise<Me> {
  if (cached !== undefined) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((m: Me) => {
        cached = m;
        inflight = null;
        return m;
      });
  }
  return inflight;
}

// Drop the cached identity so the next reader refetches (used on sign-out).
export function clearMeCache(): void {
  cached = undefined;
  inflight = null;
}

// Current signed-in identity (role + permissions). null until loaded.
export function useMe(): Me {
  const [me, setMe] = useState<Me>(cached ?? null);
  useEffect(() => {
    let alive = true;
    loadMe().then((m) => {
      if (alive) setMe(m);
    });
    return () => {
      alive = false;
    };
  }, []);
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
