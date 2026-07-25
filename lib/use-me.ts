"use client";

import { useEffect, useState } from "react";
import type { PermKey } from "./permissions";

export type Me = { email: string | null; name?: string; role: "owner" | "member" | null; permissions: PermKey[] } | null;

// Current signed-in identity (role + permissions). null until loaded.
export function useMe(): Me {
  const [me, setMe] = useState<Me>(null);
  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {});
  }, []);
  return me;
}

// True only once we've confirmed the user is the owner (master-password admin counts).
export function useIsOwner(): boolean {
  const me = useMe();
  return me?.role === "owner";
}
