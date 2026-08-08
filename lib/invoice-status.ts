// Single source of truth for how an invoice's payment state is shown.
// In this portal every bill created IS an issued invoice — there is no unsaved
// "draft". So a non-completed bill is simply UNPAID (or PART-PAID if some money
// has been recorded against it), never "Draft".
export type InvoiceStatusTone = "paid" | "part" | "unpaid";

export function invoiceStatus(input: { status: string; amountPaid?: number; balance?: number; total?: number | string }): { label: string; tone: InvoiceStatusTone } {
  if (input.status === "COMPLETED") return { label: "Paid", tone: "paid" };
  const paid = Number(input.amountPaid) || 0;
  const balance = input.balance !== undefined ? Number(input.balance) : undefined;
  if (paid > 0.001 && (balance === undefined || balance > 0.001)) return { label: "Part-paid", tone: "part" };
  return { label: "Unpaid", tone: "unpaid" };
}

// Tailwind badge classes per tone (light + dark).
export const STATUS_BADGE: Record<InvoiceStatusTone, string> = {
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  part: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  unpaid: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
};
