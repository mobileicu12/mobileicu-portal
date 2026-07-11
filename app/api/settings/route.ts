import { NextResponse } from "next/server";
import { getSettings, saveSettings, DEFAULT_SETTINGS, type PortalSettings } from "@/lib/settings";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET() {
  if (!shopifyConfigured()) return NextResponse.json({ settings: DEFAULT_SETTINGS });
  try {
    return NextResponse.json({ settings: await getSettings() });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load settings.";
    return NextResponse.json({ error: msg, settings: DEFAULT_SETTINGS }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Partial<PortalSettings> | null;
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  try {
    const settings = await saveSettings(body);
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to save settings.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
