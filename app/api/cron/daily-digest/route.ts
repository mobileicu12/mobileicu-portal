import { NextResponse } from "next/server";
import { runDailyDigest } from "@/lib/digest";
import { isOwnerRequest } from "@/lib/guard";
import { shopifyConfigured } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 300;

// Authorised if it's Vercel Cron (Bearer CRON_SECRET) or the owner clicking "send now".
async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (secret && auth === `Bearer ${secret}`) return true;
  return isOwnerRequest();
}

async function handle(req: Request) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    const result = await runDailyDigest({ force });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Digest failed." }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
