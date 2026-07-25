import { NextResponse } from "next/server";
import { getIntegrations, saveIntegrations } from "@/lib/settings";
import { requirePermission } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

// GET returns a REDACTED view — never the token itself, only whether one is stored.
export async function GET() {
  const denied = await requirePermission("settings");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ configured: false, phoneId: "", template: "" });
  try {
    const i = await getIntegrations();
    return NextResponse.json({ configured: !!i.whatsappToken, phoneId: i.whatsappPhoneId, template: i.whatsappTemplate });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const denied = await requirePermission("settings");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { whatsappToken?: string; whatsappPhoneId?: string; whatsappTemplate?: string } | null;
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  try {
    const i = await saveIntegrations(body);
    return NextResponse.json({ ok: true, configured: !!i.whatsappToken, phoneId: i.whatsappPhoneId, template: i.whatsappTemplate });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to save.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
