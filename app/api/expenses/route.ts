import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/guard";
import { listExpenses, addExpense, deleteExpense } from "@/lib/expenses";
import { audit } from "@/lib/audit";
import { auth } from "@/auth";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requirePermission("expenses");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ expenses: [] });
  try {
    return NextResponse.json({ expenses: await listExpenses() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof ShopifyError ? e.message : "Failed to load expenses." }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const denied = await requirePermission("expenses");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { date?: string; category?: string; description?: string; amount?: number; method?: string; note?: string } | null;
  if (!body || typeof body.amount !== "number" || body.amount <= 0 || !body.category) {
    return NextResponse.json({ error: "A category and positive amount are required." }, { status: 400 });
  }
  try {
    const session = await auth().catch(() => null);
    const who = session?.user?.name || session?.user?.email || "portal";
    const exp = await addExpense({ ...body, category: body.category, amount: body.amount, createdBy: who });
    await audit("expense.add", { detail: `£${exp.amount.toFixed(2)} · ${exp.category}${exp.description ? ` · ${exp.description}` : ""}` });
    return NextResponse.json({ ok: true, expense: exp });
  } catch (e) {
    return NextResponse.json({ error: e instanceof ShopifyError ? e.message : "Failed to add expense." }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const denied = await requirePermission("expenses");
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  try {
    await deleteExpense(id);
    await audit("expense.delete", { detail: `Deleted expense ${id}` });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof ShopifyError ? e.message : "Failed to delete expense." }, { status: 502 });
  }
}
