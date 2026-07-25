import { NextResponse } from "next/server";
import { runDailyDigest } from "@/lib/digest";
import { autoTapOutAll } from "@/lib/attendance";
import { isOwnerRequest } from "@/lib/guard";
import { shopifyConfigured } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 300;

// Authorised if it's Vercel Cron or the owner clicking "send now".
async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (secret) {
    // When a secret is configured, Vercel Cron sends it as a Bearer token.
    if (auth === `Bearer ${secret}`) return true;
  } else {
    // No secret set → accept Vercel's cron runner by its user-agent so it works out of the box.
    if ((req.headers.get("user-agent") || "").toLowerCase().includes("vercel-cron")) return true;
  }
  return isOwnerRequest();
}

async function handle(req: Request) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  // Auto tap-out all staff still clocked in (best-effort, never blocks the digest).
  const tappedOut = await autoTapOutAll().catch(() => 0);
  try {
    const result = await runDailyDigest({ force });
    return NextResponse.json({ ...result, tappedOut });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Digest failed.", tappedOut }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
