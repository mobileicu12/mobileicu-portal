import { NextResponse } from "next/server";
import { sendEmail, emailConfigured } from "@/lib/email";
import { requirePermission } from "@/lib/guard";
import { BUSINESS } from "@/lib/business";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST { to, subject, message, pdfBase64, filename } — emails the branded invoice PDF.
export async function POST(req: Request) {
  const denied = await requirePermission("invoices");
  if (denied) return denied;
  if (!emailConfigured()) {
    return NextResponse.json({ error: "Email isn't set up yet. Add RESEND_API_KEY (from resend.com) to the environment." }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as {
    to?: string; subject?: string; message?: string; pdfBase64?: string; filename?: string;
  } | null;
  if (!body?.to || !body.to.includes("@")) return NextResponse.json({ error: "A valid recipient email is required." }, { status: 400 });

  const subject = body.subject?.trim() || `Your invoice from ${BUSINESS.name}`;
  const text = (body.message?.trim() || "Please find your invoice attached.").replace(/\n/g, "<br>");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#14110e;font-size:14px;line-height:1.6">
    <p>${text}</p>
    <p style="color:#6b655c;font-size:12px;margin-top:24px">${BUSINESS.name} · ${BUSINESS.tagline}</p>
  </div>`;

  try {
    await sendEmail({
      to: body.to.trim(),
      subject,
      html,
      attachments: body.pdfBase64 ? [{ filename: body.filename || "invoice.pdf", content: body.pdfBase64 }] : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Email failed." }, { status: 502 });
  }
}
