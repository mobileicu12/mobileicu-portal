import { NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/guard";
import { listFinanceAccess, approveFinanceAccess, revokeFinanceAccess, GRANT_MINUTES } from "@/lib/finance-access";
import { audit } from "@/lib/audit";
import { ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

// Owner: see who's waiting for finance access and who currently has it.
export async function GET() {
  if (!(await isOwnerRequest())) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, ...(await listFinanceAccess()), grantMinutes: GRANT_MINUTES });
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
      const grant = await approveFinanceAccess(email);
      await audit("finance.access.approve", { detail: `Granted ${email} finance access for ${GRANT_MINUTES} min` });
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
