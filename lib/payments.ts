// Money coming in, and where it is allowed to land.
//
// The portal has two "Record payment" boxes: one on the customer, one on an
// individual invoice. Only the customer one ever knew what to do with more money
// than a single bill owes — it walks the open bills oldest-first, clears what it
// can and holds any true surplus as account credit.
//
// The invoice one just appended whatever number was typed to that invoice's own
// payments metafield. Take £200 against a £10 bill and all £200 stayed on the
// £10 bill: the bill reported "Paid £200.00, balance £0.00", the customer's
// TOTAL PAID counted only £10 of it (it caps each bill at what the bill was
// worth), "Received" counted all £200, and the other 59 unpaid bills — which the
// £190 was handed over to clear — stayed unpaid. The money was recorded and
// applied to nothing.
//
// This module is where the two boxes meet, so a payment behaves the same way
// whichever one it is typed into. It lives outside billing.ts and customers.ts
// because it needs both, and those two already import each other.

import {
  getInvoiceDetail,
  addInvoicePayment,
  completeInvoice,
  setInvoicePayments,
  type InvoicePayment,
} from "./billing";
import { allocatePayment, getCustomer, type PaymentAllocation } from "./customers";
import { splitPayments } from "./account-totals";
import { ShopifyError } from "./shopify";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type InvoicePaymentResult = {
  /** What stayed on the invoice the payment was typed against. */
  onBill: number;
  /** That invoice was covered outright and has been marked paid. */
  completed: boolean;
  /** Surplus that went past this bill onto the customer's other bills. */
  surplus: number;
  /** Other bills the surplus cleared, oldest first. */
  settled: PaymentAllocation["settled"];
  /** The oldest bill the surplus could only part-pay. */
  partial: PaymentAllocation["partial"];
  /** Genuine surplus with no bill left to pay — held as account credit. */
  creditedToAccount: number;
};

/**
 * Record a payment against one invoice, and let anything above that bill's
 * balance flow on to the customer's other open bills, oldest first.
 *
 * Order matters. The invoice is settled first and only then is the surplus
 * allocated, because the allocation reads the customer's open bills back out of
 * Shopify — do it the other way round and this bill would still look open and
 * the surplus would be spent on it twice.
 */
export async function recordInvoicePayment(
  invoiceId: string,
  payment: InvoicePayment,
): Promise<InvoicePaymentResult> {
  const amount = round2(Number(payment.amount) || 0);
  if (amount <= 0) throw new ShopifyError("A positive payment amount is required.");

  const inv = await getInvoiceDetail(invoiceId);
  const balance = round2(inv.balance);
  const onBill = round2(Math.min(amount, balance));
  const surplus = round2(amount - onBill);

  // A walk-in has no account to carry the extra, so there is nowhere honest to
  // put it: not on the bill (it would repeat exactly the bug being fixed) and
  // not on a customer who doesn't exist. Say so before anything is written,
  // rather than after half of it has been.
  if (surplus > 0.001 && !inv.customerId) {
    throw new ShopifyError(
      balance > 0.001
        ? `This bill only owes £${balance.toFixed(2)}. There's no customer account on it to hold the extra £${surplus.toFixed(2)} — record £${balance.toFixed(2)}, or attach a customer to the invoice first.`
        : `This bill is already fully paid, and there's no customer account on it to hold £${surplus.toFixed(2)}.`,
    );
  }

  let completed = false;
  if (onBill > 0.001) {
    await addInvoicePayment(invoiceId, { ...payment, amount: onBill });
    // The bill is covered. Complete it, so it becomes a real sale with stock
    // deducted — the same thing the customer-side allocation does when a payment
    // covers a bill, instead of leaving an OPEN draft that everything downstream
    // has to guess about.
    if (balance - onBill <= 0.001 && inv.status !== "COMPLETED") {
      await completeInvoice(invoiceId, false, payment.method);
      completed = true;
    }
  }

  if (surplus <= 0.001) {
    return { onBill, completed, surplus: 0, settled: [], partial: null, creditedToAccount: 0 };
  }

  const { allocation } = await allocatePayment(inv.customerId as string, surplus, {
    method: payment.method,
    date: payment.date,
    note: payment.note || `Overpayment on ${inv.invoiceNo || inv.name}`,
  });

  return {
    onBill,
    completed,
    surplus,
    settled: allocation.settled,
    partial: allocation.partial,
    creditedToAccount: allocation.creditedToAccount,
  };
}

/** One line of plain English describing where a payment actually went. */
export function describeInvoicePayment(r: InvoicePaymentResult): string {
  const parts: string[] = [`£${r.onBill.toFixed(2)} on this bill${r.completed ? " (now paid in full)" : ""}`];
  if (r.settled.length) {
    parts.push(`£${r.settled.reduce((s, x) => s + x.amount, 0).toFixed(2)} cleared ${r.settled.length} older bill${r.settled.length === 1 ? "" : "s"} (${r.settled.map((s) => s.name).join(", ")})`);
  }
  if (r.partial) parts.push(`£${r.partial.amount.toFixed(2)} part-paid ${r.partial.name}`);
  if (r.creditedToAccount > 0.001) parts.push(`£${r.creditedToAccount.toFixed(2)} left on account`);
  return parts.join(" · ");
}

// ---- Repairing payments recorded before any of the above ------------------

export { splitPayments } from "./account-totals";

export type OverpaidInvoice = { id: string; name: string; total: number; recorded: number; surplus: number };

/** Invoices holding more money than they were ever worth. */
export async function findOverpaidInvoices(customerId: string): Promise<OverpaidInvoice[]> {
  const detail = await getCustomer(customerId);
  const out: OverpaidInvoice[] = [];
  for (const inv of detail.invoices) {
    // A COMPLETED bill's entries include a synthetic "Marked paid" line for the
    // part taken at completion, which is not real stored data — recorded always
    // sums to the total there, so it can never look overpaid. Only OPEN bills,
    // whose entries are exactly what is in the metafield, are candidates.
    if (inv.status === "COMPLETED") continue;
    const total = Number(inv.total) || 0;
    const recorded = round2(inv.paymentEntries.reduce((s, p) => s + (Number(p.amount) || 0), 0));
    if (recorded > total + 0.001) {
      out.push({ id: inv.id, name: inv.name, total, recorded, surplus: round2(recorded - total) });
    }
  }
  return out;
}

export type RedistributeResult = {
  repaired: OverpaidInvoice[];
  recovered: number;
  settled: PaymentAllocation["settled"];
  partial: PaymentAllocation["partial"];
  creditedToAccount: number;
};

/**
 * Put money that was over-applied to single invoices back to work.
 *
 * For every bill holding more than it was worth: trim its stored payments down
 * to what it actually owed, mark it paid, and add the difference to a pot. The
 * pot is then allocated across the customer's open bills exactly as a fresh
 * payment would be.
 *
 * Each invoice is trimmed and completed before the pot is spent, for the same
 * reason as above — the allocation re-reads the open bills, and a bill still
 * showing an old balance would be paid twice.
 */
export async function redistributeOverpayments(
  customerId: string,
  opts: { method?: string; date?: string } = {},
): Promise<RedistributeResult> {
  const overpaid = await findOverpaidInvoices(customerId);
  if (!overpaid.length) {
    return { repaired: [], recovered: 0, settled: [], partial: null, creditedToAccount: 0 };
  }

  const date = opts.date || new Date().toISOString();
  const repaired: OverpaidInvoice[] = [];
  let pot = 0;
  let method = opts.method || "";

  for (const row of overpaid) {
    const inv = await getInvoiceDetail(row.id);
    const { kept, surplus } = splitPayments(inv.payments, Number(inv.total) || 0);
    if (surplus <= 0.001) continue;
    // Keep the method the money actually arrived by, so the re-allocated part
    // stays in the right column of the cash-up.
    if (!method) method = inv.payments[inv.payments.length - 1]?.method || "cash";

    await setInvoicePayments(row.id, kept);
    if (inv.status !== "COMPLETED") await completeInvoice(row.id, false, method);
    pot = round2(pot + surplus);
    repaired.push({ ...row, surplus });
  }

  if (pot <= 0.001) return { repaired, recovered: 0, settled: [], partial: null, creditedToAccount: 0 };

  const { allocation } = await allocatePayment(customerId, pot, {
    method: method || "cash",
    date,
    note: "Re-applied overpayment",
  });

  return {
    repaired,
    recovered: pot,
    settled: allocation.settled,
    partial: allocation.partial,
    creditedToAccount: allocation.creditedToAccount,
  };
}
