import { NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/guard";
import { listFinanceAccess, approveFinanceAccess, revokeFinanceAccess, GRANT_MINUTES } from "@/lib/finance-access";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

// Owner-set reveal window (minutes), clamped to a sane 1–120.
async function grantMinutes(): Promise<number> {
  try {
    const m = Math.round((await getSettings()).financeGrantMinutes);
    return Number.isFinite(m) && m >= 1 && m <= 120 ? m : GRANT_MINUTES;
  } catch { return GRANT_MINUTES; }
}

// Owner: see who's waiting for finance access and who currently has it.
export async function GET() {
  if (!(await isOwnerRequest())) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, ...(await listFinanceAccess()), grantMinutes: await grantMinutes() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof ShopifyError ? e.message : "Failed." }, { status: 502 });
  }
}

// Owner: approve (grant 15 min) or revoke a staff member's finance visibility.
export async function POST(req: Request) {
  if (!(await isOwnerRequest())) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { action?: string; email?: string } | null;
  const email = body?.email?.trim();
  if (!body?.action || !email) return NextResponse.json({ error: "action and email required." }, { status: 400 });
  try {
    if (body.action === "approve") {
      const mins = await grantMinutes();
      const grant = await approveFinanceAccess(email, mins);
      await audit("finance.access.approve", { detail: `Granted ${email} finance access for ${mins} min` });
      return NextResponse.json({ ok: true, grant });
    }
    if (body.action === "revoke") {
      await revokeFinanceAccess(email);
      await audit("finance.access.revoke", { detail: `Revoked finance access for ${email}` });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof ShopifyError ? e.message : "Failed." }, { status: 502 });
  }
}
