"use client";

// ---- Shared portal-settings fetch (browser side) ----
// The header (report-button hour), the favicon manager and loadBusiness() all
// read /api/settings. Each used to fetch it separately on mount, so every page
// load made two or three identical Shopify metafield round trips. They now
// share one request for the lifetime of the page.

export type PortalSettingsView = {
  bizName?: string;
  tagline?: string;
  address?: string;
  email?: string;
  phone?: string;
  website?: string;
  vatNumber?: string;
  bank?: string;
  invoiceFooter?: string;
  invoicePrefix?: string;
  vatRate?: number;
  lowStock?: number;
  faviconUrl?: string;
  reportButtonHour?: number;
  [key: string]: unknown;
};

let cached: PortalSettingsView | null | undefined;
let inflight: Promise<PortalSettingsView | null> | null = null;

export function loadPortalSettings(): Promise<PortalSettingsView | null> {
  if (cached !== undefined) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.settings ?? null) as PortalSettingsView | null)
      .catch(() => null)
      .then((s) => {
        cached = s;
        inflight = null;
        return s;
      });
  }
  return inflight;
}

// Drop the cached settings so the next reader refetches (after saving Settings).
export function clearSettingsCache(): void {
  cached = undefined;
  inflight = null;
}
