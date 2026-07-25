import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/guard";
import { sendWhatsApp, waConfigured } from "@/lib/whatsapp";

export const runtime = "nodejs";

// Send a WhatsApp text to a number (used by "Send today's invoices"). Requires the
// WhatsApp Cloud API to be configured in Settings.
export async function POST(req: Request) {
  const denied = await requirePermission("customers");
  if (denied) return denied;
  if (!(await waConfigured())) return NextResponse.json({ error: "WhatsApp not configured." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { phone?: string; message?: string } | null;
  if (!body?.phone || !body.message) return NextResponse.json({ error: "phone and message required." }, { status: 400 });
  try {
    await sendWhatsApp(body.phone, body.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Send failed." }, { status: 502 });
  }
}
