import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/guard";
import { findDuplicates } from "@/lib/merge";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const denied = await requirePermission("inventory");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ groups: [], nameClashes: [], scanned: 0, truncated: false });
  try {
    return NextResponse.json(await findDuplicates());
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Could not scan for duplicates.";
    return NextResponse.json({ error: msg, groups: [], nameClashes: [], scanned: 0, truncated: false }, { status: 502 });
  }
}
