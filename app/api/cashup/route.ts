import { NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/guard";
import { takingsFor, getCashUp, saveCashUp, listCashUps, sheetTotals, type CashUp, type CashUpLine } from "@/lib/cashup";
import { currentActor, audit } from "@/lib/audit";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 120;

const today = () => new Date().toISOString().slice(0, 10);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// GET ?date=YYYY-MM-DD — the system's view of that day plus any saved count.
export async function GET(req: Request) {
  const denied = await requireAnyPermission(["billing"]);
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || today();
  if (!isDate(date)) return NextResponse.json({ error: "Bad date." }, { status: 400 });
  try {
    const [takings, saved, history] = await Promise.all([
      takingsFor(date),
      getCashUp(date),
      listCashUps(3).catch(() => []),
    ]);
    return NextResponse.json({ takings, saved, history });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Couldn't load the day's figures.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// POST — record the counted drawer for a day.
export async function POST(req: Request) {
  const denied = await requireAnyPermission(["billing"]);
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Partial<CashUp> | null;
  const date = body?.date || today();
  if (!isDate(date)) return NextResponse.json({ error: "Bad date." }, { status: 400 });

  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
  };
  // Hand-entered lines: trust nothing from the client beyond shape and sign.
  const lines = (v: unknown): CashUpLine[] =>
    (Array.isArray(v) ? v : [])
      .map((l) => ({
        name: String((l as CashUpLine)?.name ?? "").slice(0, 120),
        amount: num((l as CashUpLine)?.amount),
        method: String((l as CashUpLine)?.method ?? "cash").toLowerCase().slice(0, 20),
      }))
      .filter((l) => l.name.trim() !== "" || l.amount > 0)
      .slice(0, 200);

  try {
    const entry: CashUp = {
      date,
      openingFloat: num(body?.openingFloat),
      countedCash: num(body?.countedCash),
      countedCard: num(body?.countedCard),
      note: String(body?.note || "").slice(0, 500),
      closedBy: await currentActor(),
      closedAt: new Date().toISOString(),
      customerLines: lines(body?.customerLines),
      otherCash: num(body?.otherCash),
      otherCard: num(body?.otherCard),
      expenseLines: lines(body?.expenseLines),
    };
    await saveCashUp(entry);
    // Counting the drawer is a money event — it belongs in the trail, especially
    // when the count disagrees with the system.
    const t = await takingsFor(date).catch(() => null);
    const sheet = sheetTotals(entry);
    const expected = entry.openingFloat + sheet.byMethod.cash - sheet.cashExpenses;
    const drift = t ? sheet.receivedTotal - t.receivedTotal : null;
    await audit("cashup.save", {
      name: date,
      detail:
        `Counted £${entry.countedCash.toFixed(2)} vs expected £${expected.toFixed(2)} ` +
        `(variance £${(entry.countedCash - expected).toFixed(2)})` +
        (drift === null ? "" : `; sheet £${sheet.receivedTotal.toFixed(2)} vs system £${t!.receivedTotal.toFixed(2)} (£${drift.toFixed(2)})`),
    });
    return NextResponse.json({ ok: true, saved: entry });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Couldn't save the cash-up.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
