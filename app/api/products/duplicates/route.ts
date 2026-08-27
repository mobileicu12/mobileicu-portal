import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/guard";
import { findDuplicateGroups } from "@/lib/merge";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const denied = await requirePermission("inventory");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ groups: [] });
  try {
    return NextResponse.json({ groups: await findDuplicateGroups() });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Could not scan for duplicates.";
    return NextResponse.json({ error: msg, groups: [] }, { status: 502 });
  }
}
