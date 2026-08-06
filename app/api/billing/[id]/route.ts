import { NextResponse } from "next/server";
import { getInvoiceDetail, updateInvoice, deleteInvoice, softDeleteInvoice, restoreInvoice, type UpdateInvoiceInput } from "@/lib/billing";
import { audit } from "@/lib/audit";
import { requirePermission, isOwnerRequest } from "@/lib/guard";
import { invoiceSharePath } from "@/lib/invoice-link";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  }
  const { id } = await params;
  try {
    const invoice = await getInvoiceDetail(decodeURIComponent(id));
    // Public, token-protected PDF link (for WhatsApp) — never Shopify's hosted page.
    const numId = invoice.id.split("/").pop() || invoice.id;
    return NextResponse.json({ invoice, shareUrl: invoiceSharePath(numId) });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load invoice.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission("invoices");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as UpdateInvoiceInput | null;
  if (!body || !Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "An invoice needs at least one product." }, { status: 400 });
  }
  try {
    const decoded = decodeURIComponent(id);
    const before = await getInvoiceDetail(decoded).catch(() => null);
    const result = await updateInvoice(decoded, body);
    await audit("invoice.update", {
      ref: decoded,
      name: before?.invoiceNo || result.name,
      detail: before
        ? `Total £${Number(before.total).toFixed(2)} → £${Number(result.total).toFixed(2)}; lines ${before.lines.length} → ${body.lines.length}`
        : `${body.lines.length} line(s)`,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to update invoice.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// Removing an invoice is reversible by default: it's tagged out of every list,
// report and balance, and can be restored. `?permanent=1` does the real Shopify
// delete, which cannot be undone — owner only, and always logged first.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission("invoices");
  if (denied) return denied;
  if (!(await isOwnerRequest())) return NextResponse.json({ error: "Only the owner can delete invoices. You can Void instead." }, { status: 403 });
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const { id } = await params;
  const permanent = new URL(req.url).searchParams.get("permanent") === "1";
  try {
    const decoded = decodeURIComponent(id);
    // Snapshot the money before it goes, so the trail survives the record.
    const snap = await getInvoiceDetail(decoded).catch(() => null);
    const detail = snap
      ? `${snap.customerName} · total £${Number(snap.total).toFixed(2)} · paid £${snap.amountPaid.toFixed(2)} · balance £${snap.balance.toFixed(2)} · ${snap.lines.length} line(s)`
      : "invoice detail unavailable";

    if (permanent) {
      await audit("invoice.delete", { ref: decoded, name: snap?.invoiceNo, detail: `PERMANENT — ${detail}` });
      await deleteInvoice(decoded);
      return NextResponse.json({ ok: true, permanent: true });
    }
    await softDeleteInvoice(decoded);
    await audit("invoice.delete", { ref: decoded, name: snap?.invoiceNo, detail: `Recoverable — ${detail}` });
    return NextResponse.json({ ok: true, permanent: false, restorable: true });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to delete invoice.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// Put a soft-deleted invoice back.
export async function PUT(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission("invoices");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const { id } = await params;
  try {
    const decoded = decodeURIComponent(id);
    await restoreInvoice(decoded);
    const back = await getInvoiceDetail(decoded).catch(() => null);
    await audit("invoice.restore", { ref: decoded, name: back?.invoiceNo, detail: back ? `Restored · total £${Number(back.total).toFixed(2)}` : "Restored" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to restore invoice.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
