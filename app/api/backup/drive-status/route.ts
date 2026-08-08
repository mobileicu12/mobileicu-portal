import { NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/guard";
import { driveConfigured } from "@/lib/google-drive";

export const runtime = "nodejs";

// Owner-only, side-effect-free check: is the Google Drive backup wired up?
// (Are the OAuth client + refresh token present?) Used by Settings to show a
// connection status without triggering an actual backup upload.
export async function GET() {
  if (!(await isOwnerRequest())) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  return NextResponse.json({ configured: driveConfigured() });
}
