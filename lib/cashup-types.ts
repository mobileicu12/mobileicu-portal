// Client-safe cash-up types and arithmetic. No server imports.
//
// Kept separate from lib/cashup.ts because that one reaches Shopify (and, through
// billing -> settings, `revalidateTag`), which cannot be pulled into a client
// bundle. The closing screen and the PDF builder both need the maths, so the
// maths lives here.

// One hand-entered line on the closing sheet.
export type CashUpLine = { name: string; amount: number; method: string };

export type MethodSplit = { cash: number; card: number; "bank transfer": number; other: number };
export const zeroSplit = (): MethodSplit => ({ cash: 0, card: 0, "bank transfer": 0, other: 0 });
export const bucket = (m: string | null | undefined): keyof MethodSplit => {
  const k = (m || "other").toLowerCase();
  return k === "cash" || k === "card" || k === "bank transfer" ? k : "other";
};
export const round2 = (n: number) => Math.round(n * 100) / 100;

export type CashUp = {
  date: string;          // YYYY-MM-DD
  openingFloat: number;  // counted into the drawer at the start of the day
  countedCash: number;   // counted out of the drawer at close
  countedCard: number;   // card terminal total, if they reconcile it too
  note: string;
  closedBy: string;
  closedAt: string;      // ISO

  // ---- The sheet staff fill in at closing ----
  // Deliberately typed from scratch rather than pre-filled from the system:
  // the whole point is to compare an independent count against what the portal
  // thinks, and pre-filling would just be agreeing with itself.
  customerLines: CashUpLine[]; // "Haji Mahmood paid cash 100"
  otherCash: number;           // counter / mix sales taken in cash
  otherCard: number;           // counter / mix sales taken on card
  // Expenses ARE pre-filled from the Expenses page, then editable — staff are
  // confirming a list that already exists rather than inventing one.
  expenseLines: CashUpLine[];
};

export const emptyCashUp = (date: string): CashUp => ({
  date, openingFloat: 0, countedCash: 0, countedCard: 0, note: "",
  closedBy: "", closedAt: "",
  customerLines: [], otherCash: 0, otherCard: 0, expenseLines: [],
});

// Totals for a hand-entered sheet.
export function sheetTotals(c: Pick<CashUp, "customerLines" | "otherCash" | "otherCard" | "expenseLines">) {
  const byMethod = zeroSplit();
  let fromCustomers = 0;
  for (const l of c.customerLines) {
    const amt = Number(l.amount) || 0;
    byMethod[bucket(l.method)] += amt;
    fromCustomers += amt;
  }
  byMethod.cash += Number(c.otherCash) || 0;
  byMethod.card += Number(c.otherCard) || 0;
  const other = (Number(c.otherCash) || 0) + (Number(c.otherCard) || 0);
  const expenses = c.expenseLines.reduce((s2, l) => s2 + (Number(l.amount) || 0), 0);
  const cashExpenses = c.expenseLines
    .filter((l) => bucket(l.method) === "cash")
    .reduce((s2, l) => s2 + (Number(l.amount) || 0), 0);
  for (const k of Object.keys(byMethod) as (keyof MethodSplit)[]) byMethod[k] = round2(byMethod[k]);
  return {
    fromCustomers: round2(fromCustomers),
    fromOther: round2(other),
    byMethod,
    receivedTotal: round2(fromCustomers + other),
    expensesTotal: round2(expenses),
    cashExpenses: round2(cashExpenses),
  };
}

export type DayTakings = {
  date: string;
  /** Money received against a registered customer's bills. */
  fromAccounts: number;
  /** Money received on walk-in / one-off bills (no customer account). */
  fromCounter: number;
  /** Surplus paid onto an account with no open bill to clear. */
  onAccountCredit: number;
  receivedByMethod: MethodSplit;
  receivedTotal: number;
  expensesByMethod: MethodSplit;
  expensesTotal: number;
  /** Expenses paid in cash — the only ones that come out of the drawer. */
  cashExpenses: number;
  /** Sources are only trustworthy if the two ways of counting agree. */
  sourcesTotal: number;
  balanced: boolean;
  /** Who paid what, per registered customer — the detail the report needs. */
  accountLines: CashUpLine[];
  /** Named customers who paid onto their account with no open bill to clear.
   *  Separate from accountLines so Σ accountLines still equals fromAccounts,
   *  but just as much a customer payment when reconciling the sheet. */
  creditLines: CashUpLine[];
  /** fromCounter, split by method — needed to tell a missing counter card
   *  takings from a missing customer card payment. */
  counterByMethod: MethodSplit;
  /** Expenses recorded for the day, used to pre-fill the closing sheet. */
  expenseLines: CashUpLine[];
};
