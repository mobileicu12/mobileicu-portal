import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCustomer } from "@/lib/customers";
import { SEGMENTS } from "@/lib/segments";
import { requirePermission } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 60;

function gid(id: string) {
  return id.startsWith("gid://") ? id : `gid://shopify/Customer/${id}`;
}

// GET /api/customers/<id>/export -> full customer record as xlsx (backup / safekeeping).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission("customers");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const { id } = await ctx.params;

  try {
    const c = await getCustomer(gid(id));
    const money = '"£"#,##0.00';

    const invoiceOutstanding = c.invoices.reduce((s, i) => s + (Number(i.balance) || 0), 0);
    const ledgerPaid = c.ledger.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const invoiceTotal = c.invoices.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const outstanding = c.openingBalance + invoiceOutstanding - ledgerPaid;

    const wb = new ExcelJS.Workbook();

    // Profile
    const p = wb.addWorksheet("Profile");
    p.columns = [{ width: 24 }, { width: 48 }];
    const prow = (k: string, v: string | number) => p.addRow([k, v]);
    p.addRow(["MOBILE ICU — Customer record"]).font = { bold: true, size: 14 };
    p.addRow(["Exported", new Date().toLocaleString("en-GB")]);
    p.addRow([]);
    prow("Name", c.name);
    prow("First name", c.firstName);
    prow("Last name", c.lastName);
    prow("Company", c.company);
    prow("Email", c.email);
    prow("Phone", c.phone);
    prow("Address", c.address.join(", "));
    prow("Segments", c.segments.map((k) => SEGMENTS.find((s) => s.key === k)?.label ?? k).join(", "));
    prow("Trade code", c.tradeCode);
    prow("Note", c.note);
    p.addRow([]);
    prow("Opening balance", c.openingBalance).getCell(2).numFmt = money;
    prow("Invoiced (total)", invoiceTotal).getCell(2).numFmt = money;
    prow("Paid on account", ledgerPaid).getCell(2).numFmt = money;
    const oRow = prow("OUTSTANDING", outstanding);
    oRow.font = { bold: true };
    oRow.getCell(2).numFmt = money;

    // Invoices
    const iv = wb.addWorksheet("Invoices");
    iv.columns = [
      { header: "Invoice", key: "name", width: 16 },
      { header: "Date", key: "date", width: 14 },
      { header: "Status", key: "status", width: 12 },
      { header: "Total (£)", key: "total", width: 14 },
      { header: "Paid (£)", key: "paid", width: 14 },
      { header: "Balance (£)", key: "balance", width: 14 },
    ];
    iv.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    iv.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14110E" } };
    for (const i of c.invoices) {
      const r = iv.addRow({ name: i.name, date: new Date(i.createdAt).toLocaleDateString("en-GB"), status: i.status === "COMPLETED" ? "PAID" : "DRAFT", total: Number(i.total) || 0, paid: i.amountPaid, balance: i.balance });
      ["total", "paid", "balance"].forEach((k) => (r.getCell(k).numFmt = money));
    }

    // Payments (on account)
    const pay = wb.addWorksheet("Payments");
    pay.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Amount (£)", key: "amount", width: 14 },
      { header: "Method", key: "method", width: 16 },
      { header: "Note", key: "note", width: 40 },
    ];
    pay.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    pay.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14110E" } };
    for (const pmt of c.ledger.payments) {
      const r = pay.addRow({ date: new Date(pmt.date).toLocaleDateString("en-GB"), amount: Number(pmt.amount) || 0, method: pmt.method, note: pmt.note || "" });
      r.getCell("amount").numFmt = money;
    }

    const buffer = await wb.xlsx.writeBuffer();
    const safe = (c.name || "customer").replace(/[^\w-]/g, "_");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="mobileicu-customer-${safe}.xlsx"`,
      },
    });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Export failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
