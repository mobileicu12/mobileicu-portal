// What a customer has been charged, what they have paid, and what is left.
//
// This existed eight times, copy-pasted, and every copy was wrong the same way:
//
//   invoiceDue  = Σ invoice.balance
//   outstanding = openingBalance + invoiceDue − ledgerPayments
//
// An invoice's `balance` is floored at zero (`Math.max(0, total - amountPaid)`),
// so money recorded on a bill above what that bill was worth vanished from the
// sum. Take £200 against a £10 bill and the account counted £10 received and
// still asked for the other £190 — on the customer screen, in the daily digest,
// in the Excel export, on the storefront account page and in the WhatsApp
// summary. The PDF statement was the only thing that got it right, because it
// was the only one that totalled the money instead of the leftovers.
//
// So: charges minus payments, the way a statement does it, in one place that
// every screen calls.

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? 0))) || 0;

export type AccountInvoice = {
  /** The full value of the bill. */
  total: string | number;
  /** Everything recorded against it — NOT capped at the bill's own value. */
  amountPaid?: number;
};

export type AccountInput = {
  openingBalance?: number;
  invoices: AccountInvoice[];
  ledger?: { payments?: { amount: string | number }[] };
};

export type AccountTotals = {
  /** Opening balance + every invoice raised. */
  billed: number;
  /** Every pound received: on bills and on account. */
  received: number;
  /** billed − received. Negative means the customer is in credit. */
  outstanding: number;
  /** The debt, never below zero — for screens that can't show a negative. */
  owed: number;
  /** Money held beyond the debt, never below zero. */
  credit: number;
};

export function accountTotals(c: AccountInput): AccountTotals {
  const billed = round2(num(c.openingBalance) + c.invoices.reduce((s, i) => s + num(i.total), 0));
  const onBills = c.invoices.reduce((s, i) => s + num(i.amountPaid), 0);
  const onAccount = (c.ledger?.payments ?? []).reduce((s, p) => s + num(p.amount), 0);
  const received = round2(onBills + onAccount);
  const outstanding = round2(billed - received);
  return {
    billed,
    received,
    outstanding,
    owed: Math.max(0, outstanding),
    credit: Math.max(0, round2(-outstanding)),
  };
}

/**
 * Split a stored payment list at `keep`, returning the entries that fit and the
 * surplus. The entry that straddles the line is cut in two so neither its date
 * nor its method is lost — that entry is usually the one big cash payment the
 * whole repair is about, and it still has to show up in the day's cash-up under
 * the method it was taken by.
 */
export function splitPayments<T extends { amount: number | string }>(
  payments: T[],
  keep: number,
): { kept: T[]; surplus: number } {
  let room = keep;
  const kept: T[] = [];
  let surplus = 0;
  for (const p of payments) {
    const amt = round2(Number(p.amount) || 0);
    if (room <= 0.001) { surplus = round2(surplus + amt); continue; }
    if (amt <= room + 0.001) { kept.push({ ...p, amount: amt }); room = round2(room - amt); continue; }
    kept.push({ ...p, amount: room });
    surplus = round2(surplus + round2(amt - room));
    room = 0;
  }
  return { kept, surplus };
}

