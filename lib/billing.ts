// Billing: product search, draft orders (invoices), POS completion.
import { adminGraphQL, ShopifyError } from "./shopify";
import { segmentsFromTags, type SegmentKey } from "./segments";
import type { TierPrices } from "./pricing";
import { nextInvoiceNumber } from "./settings";

export type VariantHit = {
  variantId: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  price: string;
  image: string | null;
  available: number;
  tiers: TierPrices; // channel prices (wholesale/shop/ebay/amazon) — blank = use base price
};

export async function searchVariants(q: string, opts: { tag?: string } = {}): Promise<VariantHit[]> {
  if (!q.trim()) return [];
  // Optionally scope to a tag (e.g. in-shop till items only) to cut POS clutter.
  const query = opts.tag ? `${q.trim()} AND tag:'${opts.tag.replace(/'/g, "")}'` : q;
  const data = await adminGraphQL<{
    products: {
      edges: {
        node: {
          title: string;
          featuredImage: { url: string } | null;
          wholesale: { value: string } | null;
          priceShop: { value: string } | null;
          priceEbay: { value: string } | null;
          priceAmazon: { value: string } | null;
          variants: {
            edges: {
              node: {
                id: string;
                title: string;
                sku: string | null;
                price: string;
                inventoryQuantity: number | null;
              };
            }[];
          };
        };
      }[];
    };
  }>(
    `query($q:String!){
      products(first: 12, query: $q) {
        edges { node {
          title
          featuredImage { url }
          wholesale: metafield(namespace: "custom", key: "wholesale_price") { value }
          priceShop: metafield(namespace: "custom", key: "price_shop") { value }
          priceEbay: metafield(namespace: "custom", key: "price_ebay") { value }
          priceAmazon: metafield(namespace: "custom", key: "price_amazon") { value }
          variants(first: 10) { edges { node { id title sku price inventoryQuantity } } }
        } }
      }
    }`,
    { q: query },
  );

  const hits: VariantHit[] = [];
  for (const p of data.products.edges) {
    const tiers: TierPrices = {
      wholesale: p.node.wholesale?.value ?? null,
      shop: p.node.priceShop?.value ?? null,
      ebay: p.node.priceEbay?.value ?? null,
      amazon: p.node.priceAmazon?.value ?? null,
    };
    for (const v of p.node.variants.edges) {
      hits.push({
        variantId: v.node.id,
        productTitle: p.node.title,
        variantTitle: v.node.title === "Default Title" ? "" : v.node.title,
        sku: v.node.sku ?? "",
        price: v.node.price,
        image: p.node.featuredImage?.url ?? null,
        available: v.node.inventoryQuantity ?? 0,
        tiers,
      });
    }
  }
  return hits;
}

// A line is either a catalog variant (variantId) or a custom/manual item (title + price).
export type BillLine = {
  variantId?: string | null;
  quantity: number;
  unitPrice?: number;
  title?: string; // for custom items
  custom?: boolean;
};

const CURRENCY = process.env.SHOPIFY_CURRENCY || "GBP";

// Build a draft-order line item. Custom items carry a title + explicit price;
// catalog variants keep their variant link (for stock) with an optional price override.
function lineItemInput(l: BillLine) {
  if (l.custom || !l.variantId) {
    return {
      title: (l.title || "Custom item").slice(0, 250),
      quantity: l.quantity,
      originalUnitPriceWithCurrency: { amount: (l.unitPrice ?? 0).toFixed(2), currencyCode: CURRENCY },
      taxable: true,
      requiresShipping: false,
    };
  }
  const li: Record<string, unknown> = { variantId: l.variantId, quantity: l.quantity };
  if (l.unitPrice != null && l.unitPrice >= 0) {
    li.priceOverride = { amount: l.unitPrice.toFixed(2), currencyCode: CURRENCY };
  }
  return li;
}
export type CreateBillInput = {
  lines: BillLine[];
  vat: boolean;
  email?: string;
  customerId?: string;
  customerName?: string; // walk-in / one-off name (when no registered customer)
  customerPhone?: string; // walk-in phone
  note?: string;
  discountPercent?: number; // legacy % discount
  discountType?: "PERCENTAGE" | "FIXED_AMOUNT"; // % of subtotal or a fixed £ amount
  discountValue?: number; // value for the chosen type
  complete?: boolean; // POS: complete immediately (creates order, deducts stock)
  segment?: SegmentKey; // where this sale comes from (online/shop/ebay/amazon)
  staff?: string; // portal user (email) who created the sale
  payMethod?: string; // how it was paid (cash/card/bank transfer/…)
};

// Safe tag value from an email/name.
function staffTag(staff?: string): string[] {
  if (!staff) return [];
  const v = staff.trim().toLowerCase().replace(/[^a-z0-9@._-]/g, "");
  return v ? [`staff:${v}`] : [];
}
export function staffFromTags(tags: string[]): string | null {
  const t = tags.find((x) => x.startsWith("staff:"));
  return t ? t.slice("staff:".length) : null;
}

export type BillResult = {
  id: string;
  name: string;
  invoiceNo?: string;
  invoiceUrl: string | null;
  subtotal: string;
  tax: string;
  total: string;
  completed: boolean;
};

export async function createBill(input: CreateBillInput): Promise<BillResult> {
  if (!input.lines.length) throw new ShopifyError("Add at least one product.");

  const invoiceNo = await nextInvoiceNumber();
  const mfs: { namespace: string; key: string; type: string; value: string }[] = [
    { namespace: "portal", key: "invoice_no", type: "single_line_text_field", value: invoiceNo },
  ];
  const draftInput: Record<string, unknown> = {
    lineItems: input.lines.map(lineItemInput),
    taxExempt: !input.vat,
    note: input.note || undefined,
    tags: ["portal-billing", ...(input.segment ? [`seg:${input.segment}`] : []), ...staffTag(input.staff)],
  };
  if (input.customerId?.trim()) {
    draftInput.purchasingEntity = { customerId: input.customerId.trim() };
  } else {
    // Walk-in / one-off: no registered account, just capture their details on the bill.
    if (input.email?.trim()) draftInput.email = input.email.trim();
    if (input.customerName?.trim()) mfs.push({ namespace: "portal", key: "cust_name", type: "single_line_text_field", value: input.customerName.trim().slice(0, 200) });
    if (input.customerPhone?.trim()) mfs.push({ namespace: "portal", key: "cust_phone", type: "single_line_text_field", value: input.customerPhone.trim().slice(0, 60) });
  }
  if (input.payMethod?.trim()) mfs.push({ namespace: "portal", key: "pay_method", type: "single_line_text_field", value: input.payMethod.trim().slice(0, 40) });
  draftInput.metafields = mfs;
  const dType = input.discountType ?? "PERCENTAGE";
  const dValue = input.discountValue ?? input.discountPercent ?? 0;
  if (dValue > 0) {
    draftInput.appliedDiscount = { valueType: dType, value: dValue, title: "Discount" };
  }

  const created = await adminGraphQL<{
    draftOrderCreate: {
      draftOrder: {
        id: string;
        name: string;
        invoiceUrl: string | null;
        subtotalPrice: string;
        totalTax: string;
        totalPrice: string;
      } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(
    `mutation($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id name invoiceUrl subtotalPrice totalTax totalPrice }
        userErrors { field message }
      }
    }`,
    { input: draftInput },
  );

  const errs = created.draftOrderCreate.userErrors;
  if (errs.length) throw new ShopifyError(errs.map((e) => e.message).join("; "));
  const draft = created.draftOrderCreate.draftOrder;
  if (!draft) throw new ShopifyError("Failed to create bill.");

  let completed = false;
  if (input.complete) {
    const done = await adminGraphQL<{
      draftOrderComplete: {
        draftOrder: { id: string; order: { id: string } | null } | null;
        userErrors: { field: string[]; message: string }[];
      };
    }>(
      `mutation($id: ID!) {
        draftOrderComplete(id: $id, paymentPending: false) {
          draftOrder { id order { id } }
          userErrors { field message }
        }
      }`,
      { id: draft.id },
    );
    const cErrs = done.draftOrderComplete.userErrors;
    if (cErrs.length) throw new ShopifyError(cErrs.map((e) => e.message).join("; "));
    completed = true;
    await fulfillOrder(done.draftOrderComplete.draftOrder?.order?.id ?? null);
  }

  return {
    id: draft.id,
    name: draft.name,
    invoiceNo,
    invoiceUrl: draft.invoiceUrl,
    subtotal: draft.subtotalPrice,
    tax: draft.totalTax,
    total: draft.totalPrice,
    completed,
  };
}

// Storefront trade checkout: create an on-site order (draft invoice) at wholesale
// prices for the logged-in trade customer. Stays entirely on our site — no Shopify
// hosted page. The order is unpaid until settled (cash on collection / bank transfer);
// the shop sees it in Invoices with the chosen payment method.
export async function createTradeCheckout(
  customerId: string,
  lines: { variantId: string; quantity: number; unitPrice: number }[],
  opts: { payMethod?: string; note?: string } = {},
): Promise<{ name: string; invoiceNo: string; total: string }> {
  if (!lines.length) throw new ShopifyError("Cart is empty.");
  const invoiceNo = await nextInvoiceNumber();
  const mfs: { namespace: string; key: string; type: string; value: string }[] = [
    { namespace: "portal", key: "invoice_no", type: "single_line_text_field", value: invoiceNo },
  ];
  if (opts.payMethod?.trim()) mfs.push({ namespace: "portal", key: "pay_method", type: "single_line_text_field", value: opts.payMethod.trim().slice(0, 40) });
  const input = {
    purchasingEntity: { customerId },
    lineItems: lines.map((l) => ({
      variantId: l.variantId,
      quantity: l.quantity,
      priceOverride: { amount: l.unitPrice.toFixed(2), currencyCode: CURRENCY },
    })),
    note: opts.note || undefined,
    tags: ["portal-billing", "storefront-trade", "seg:online"],
    metafields: mfs,
  };
  const res = await adminGraphQL<{
    draftOrderCreate: { draftOrder: { id: string; name: string; totalPrice: string } | null; userErrors: { field: string[]; message: string }[] };
  }>(
    `mutation($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) { draftOrder { id name totalPrice } userErrors { field message } }
    }`,
    { input },
  );
  const errs = res.draftOrderCreate.userErrors;
  if (errs.length) throw new ShopifyError(errs.map((e) => e.message).join("; "));
  const d = res.draftOrderCreate.draftOrder;
  if (!d) throw new ShopifyError("Order failed.");
  return { name: d.name, invoiceNo, total: d.totalPrice };
}

export type InvoiceRow = {
  id: string;
  name: string;
  invoiceNo: string;
  customer: string;
  customerId: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  status: string;
  total: string;
  createdAt: string;
  invoiceUrl: string | null;
  segment: SegmentKey | null;
  staff: string | null;
  payMethod: string | null;
  amountPaid: number; // COMPLETED → full total; else sum of recorded part-payments
  balance: number;    // total − amountPaid (0 when fully paid)
  completedAt: string | null; // when it was settled — NOT when it was raised
  paymentEntries: InvoicePayment[]; // dated part-payments recorded against the bill
};

export async function listInvoices(): Promise<InvoiceRow[]> {
  return listInvoicesRaw("tag:portal-billing AND -tag:voided AND -tag:deleted");
}

// Shared fetch so the live list and the deleted-invoice bin can't drift apart.
//
// Pages through Shopify rather than taking the first 100. The old single-page
// fetch meant that past 100 invoices the oldest silently vanished from the list,
// from every report, and from the end-of-day digest — while still counting
// towards balances, so the totals stopped matching the rows.
async function listInvoicesRaw(searchQuery: string, cap = 1000): Promise<InvoiceRow[]> {
  const rows: InvoiceRow[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20 && rows.length < cap; page++) {
    const { batch, hasNext, endCursor } = await listInvoicePage(searchQuery, after);
    rows.push(...batch);
    if (!hasNext) break;
    after = endCursor;
  }
  return rows.slice(0, cap);
}

async function listInvoicePage(
  searchQuery: string,
  after: string | null,
): Promise<{ batch: InvoiceRow[]; hasNext: boolean; endCursor: string | null }> {
  const data = await adminGraphQL<{
    draftOrders: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      edges: {
        node: {
          id: string;
          name: string;
          status: string;
          totalPrice: string;
          createdAt: string;
          completedAt: string | null;
          invoiceUrl: string | null;
          tags: string[];
          invoiceNo: { value: string } | null;
          custName: { value: string } | null;
          payMethod: { value: string } | null;
          paidMethod: { value: string } | null;
          custPhone: { value: string } | null;
          customer: { id: string; displayName: string | null; email: string | null; phone: string | null } | null;
          email: string | null;
          payments: { value: string } | null;
        };
      }[];
    };
  }>(
    `query($q: String!, $after: String) {
      draftOrders(first: 100, reverse: true, query: $q, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          id name status totalPrice createdAt completedAt invoiceUrl tags
          invoiceNo: metafield(namespace: "portal", key: "invoice_no") { value }
          custName: metafield(namespace: "portal", key: "cust_name") { value }
          payMethod: metafield(namespace: "portal", key: "pay_method") { value }
          paidMethod: metafield(namespace: "portal", key: "paid_method") { value }
          custPhone: metafield(namespace: "portal", key: "cust_phone") { value }
          payments: metafield(namespace: "portal", key: "payments") { value }
          customer { id displayName email phone }
          email
        } }
      }
    }`,
    { q: searchQuery, after },
  );
  const batch = data.draftOrders.edges.map((e) => {
    const total = parseFloat(e.node.totalPrice) || 0;
    // Money settled on this bill: a COMPLETED sale is paid in full; otherwise sum
    // the part-payments recorded against it. This is what lets a partly-paid
    // invoice reduce the outstanding total instead of counting its whole value.
    let paymentEntries: InvoicePayment[] = [];
    if (e.node.payments?.value) {
      try {
        const arr = JSON.parse(e.node.payments.value);
        if (Array.isArray(arr)) {
          paymentEntries = arr.map((p: { date?: string; amount?: number; method?: string; note?: string }) => ({
            date: p.date || e.node.createdAt,
            amount: Number(p.amount) || 0,
            method: p.method || "cash",
            note: p.note || "",
          }));
        }
      } catch { /* ignore */ }
    }
    const recorded = paymentEntries.reduce((s2, p) => s2 + p.amount, 0);
    let amountPaid = 0;
    if (e.node.status === "COMPLETED") {
      amountPaid = total;
      // The rest was taken at completion — date it by completedAt, not the day
      // the bill was raised, so day takings land in the right day.
      if (recorded < total - 0.001) {
        paymentEntries = [...paymentEntries, {
          date: e.node.completedAt || e.node.createdAt,
          amount: Math.round((total - recorded) * 100) / 100,
          // How it was ACTUALLY settled beats how it was expected to be paid.
          method: e.node.paidMethod?.value || e.node.payMethod?.value || "cash",
          note: "Settled",
        }];
      }
    } else {
      amountPaid = recorded;
    }
    const balance = Math.max(0, Math.round((total - amountPaid) * 100) / 100);
    return {
      id: e.node.id,
      name: e.node.name,
      invoiceNo: e.node.invoiceNo?.value || e.node.name,
      customer: e.node.customer?.displayName || e.node.custName?.value || e.node.email || "—",
      customerId: e.node.customer?.id ?? null,
      customerEmail: e.node.customer?.email ?? e.node.email ?? null,
      customerPhone: e.node.customer?.phone ?? e.node.custPhone?.value ?? null,
      status: e.node.status,
      total: e.node.totalPrice,
      createdAt: e.node.createdAt,
      invoiceUrl: e.node.invoiceUrl,
      segment: segmentsFromTags(e.node.tags ?? [])[0] ?? null,
      staff: staffFromTags(e.node.tags ?? []),
      payMethod: e.node.payMethod?.value ?? null,
      completedAt: e.node.completedAt ?? null,
      paymentEntries,
      amountPaid,
      balance,
    };
  });
  return { batch, hasNext: data.draftOrders.pageInfo.hasNextPage, endCursor: data.draftOrders.pageInfo.endCursor };
}

export type StaffSales = { staff: string; count: number; total: number; paid: number; open: number };

export function summarizeByStaff(rows: InvoiceRow[]): StaffSales[] {
  const m = new Map<string, StaffSales>();
  for (const r of rows) {
    const key = r.staff || "unattributed";
    if (!m.has(key)) m.set(key, { staff: key, count: 0, total: 0, paid: 0, open: 0 });
    const s = m.get(key)!;
    const t = parseFloat(r.total) || 0;
    s.count++; s.total += t;
    // Split by money settled vs still due (part-payments included), not by status.
    s.paid += Number(r.amountPaid) || 0;
    s.open += Number(r.balance) || 0;
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

export type InvoiceLine = {
  variantId: string | null;
  title: string;
  sku: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  image: string | null;
};

export type InvoicePayment = { date: string; amount: number; method: string; note: string };

export type InvoiceDetail = {
  id: string;
  name: string;
  invoiceNo: string;
  status: string;
  createdAt: string;
  note: string;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  billingAddress: string[];
  lines: InvoiceLine[];
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  taxExempt: boolean;
  payments: InvoicePayment[];
  amountPaid: number;
  balance: number;
  voided: boolean;
  invoiceUrl: string | null;
};

function addrLines(a: {
  address1?: string | null; address2?: string | null; city?: string | null;
  zip?: string | null; province?: string | null; country?: string | null;
  company?: string | null;
} | null): string[] {
  if (!a) return [];
  return [a.company, a.address1, a.address2, [a.city, a.province].filter(Boolean).join(", "), a.zip, a.country]
    .map((s) => (s || "").trim())
    .filter(Boolean);
}

export async function getInvoiceDetail(id: string): Promise<InvoiceDetail> {
  const gid = id.startsWith("gid://") ? id : `gid://shopify/DraftOrder/${id}`;
  const data = await adminGraphQL<{
    draftOrder: {
      id: string; name: string; status: string; createdAt: string; note2: string | null;
      tags: string[]; invoiceUrl: string | null;
      taxExempt: boolean;
      subtotalPrice: string; totalTax: string; totalPrice: string;
      totalDiscountsSet: { presentmentMoney: { amount: string; currencyCode: string } } | null;
      customer: { displayName: string | null; email: string | null; phone: string | null } | null;
      email: string | null;
      payments: { value: string } | null;
      invoiceNo: { value: string } | null;
      custName: { value: string } | null;
      custPhone: { value: string } | null;
      billingAddress: {
        company: string | null; address1: string | null; address2: string | null;
        city: string | null; zip: string | null; province: string | null; country: string | null;
        phone: string | null;
      } | null;
      lineItems: {
        edges: {
          node: {
            title: string; sku: string | null; quantity: number;
            variant: { id: string; image: { url: string } | null; product: { featuredImage: { url: string } | null } | null } | null;
            image: { url: string } | null;
            originalUnitPriceSet: { presentmentMoney: { amount: string; currencyCode: string } };
            discountedTotalSet: { presentmentMoney: { amount: string } };
          };
        }[];
      };
    } | null;
  }>(
    `query($id: ID!) {
      draftOrder(id: $id) {
        id name status createdAt note2 tags invoiceUrl taxExempt
        subtotalPrice totalTax totalPrice
        totalDiscountsSet { presentmentMoney { amount currencyCode } }
        customer { displayName email phone }
        email
        payments: metafield(namespace: "portal", key: "payments") { value }
        invoiceNo: metafield(namespace: "portal", key: "invoice_no") { value }
        custName: metafield(namespace: "portal", key: "cust_name") { value }
        custPhone: metafield(namespace: "portal", key: "cust_phone") { value }
        billingAddress { company address1 address2 city zip province country phone }
        lineItems(first: 100) {
          edges { node {
            title sku quantity
            variant { id image { url } product { featuredImage { url } } }
            image { url }
            originalUnitPriceSet { presentmentMoney { amount currencyCode } }
            discountedTotalSet { presentmentMoney { amount } }
          } }
        }
      }
    }`,
    { id: gid },
  );

  const d = data.draftOrder;
  if (!d) throw new ShopifyError("Invoice not found.");
  const currency = d.lineItems.edges[0]?.node.originalUnitPriceSet.presentmentMoney.currencyCode || "GBP";

  let payments: InvoicePayment[] = [];
  if (d.payments?.value) {
    try {
      const parsed = JSON.parse(d.payments.value);
      if (Array.isArray(parsed)) payments = parsed;
    } catch { /* ignore */ }
  }
  const total = parseFloat(d.totalPrice) || 0;
  // A COMPLETED draft order is a finished, fully-paid sale regardless of whether
  // partial payments were also logged against it.
  const amountPaid = d.status === "COMPLETED" ? total : payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balance = Math.max(0, total - amountPaid);

  return {
    id: d.id,
    name: d.name,
    invoiceNo: d.invoiceNo?.value || d.name,
    status: d.status,
    createdAt: d.createdAt,
    note: d.note2 || "",
    currency,
    customerName: d.customer?.displayName || d.custName?.value || (d.email ? d.email : "Walk-in customer"),
    customerEmail: d.customer?.email || d.email || "",
    customerPhone: d.customer?.phone || d.custPhone?.value || d.billingAddress?.phone || "",
    billingAddress: addrLines(d.billingAddress),
    lines: d.lineItems.edges.map((e) => ({
      variantId: e.node.variant?.id ?? null,
      title: e.node.title,
      sku: e.node.sku || "",
      quantity: e.node.quantity,
      unitPrice: e.node.originalUnitPriceSet.presentmentMoney.amount,
      lineTotal: e.node.discountedTotalSet.presentmentMoney.amount,
      image: e.node.variant?.image?.url ?? e.node.variant?.product?.featuredImage?.url ?? e.node.image?.url ?? null,
    })),
    subtotal: d.subtotalPrice,
    discount: d.totalDiscountsSet?.presentmentMoney.amount || "0.00",
    tax: d.totalTax,
    total: d.totalPrice,
    taxExempt: d.taxExempt,
    payments,
    amountPaid,
    balance,
    voided: (d.tags ?? []).includes("voided"),
    invoiceUrl: d.invoiceUrl ?? null,
  };
}

async function writeInvoicePayments(id: string, payments: InvoicePayment[]): Promise<InvoicePayment[]> {
  const res = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
    { mf: [{ ownerId: toGid(id), namespace: "portal", key: "payments", type: "json", value: JSON.stringify(payments) }] },
  );
  if (res.metafieldsSet.userErrors.length) throw new ShopifyError(res.metafieldsSet.userErrors.map((e) => e.message).join("; "));
  return payments;
}

// Record a (partial) payment against a specific invoice (draft order metafield).
export async function addInvoicePayment(id: string, payment: InvoicePayment): Promise<InvoicePayment[]> {
  const detail = await getInvoiceDetail(id);
  return writeInvoicePayments(id, [...detail.payments, payment]);
}

// Revoke (delete) a recorded invoice payment by index. Reads the raw stored list
// (not the status-adjusted amountPaid) so a COMPLETED invoice's manual payments
// can still be corrected.
export async function removeInvoicePayment(id: string, index: number): Promise<InvoicePayment[]> {
  const detail = await getInvoiceDetail(id);
  const payments = [...detail.payments];
  if (index < 0 || index >= payments.length) throw new ShopifyError("Payment not found.");
  payments.splice(index, 1);
  return writeInvoicePayments(id, payments);
}

function toGid(id: string) {
  return id.startsWith("gid://") ? id : `gid://shopify/DraftOrder/${id}`;
}

// ---- Edit an existing draft invoice (replaces line items + settings) ----
export type UpdateInvoiceInput = {
  lines: BillLine[];
  vat: boolean;
  customerId?: string;
  email?: string;
  note?: string;
  discountPercent?: number;
  discountType?: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue?: number;
};

export async function updateInvoice(id: string, input: UpdateInvoiceInput): Promise<BillResult> {
  if (!input.lines.length) throw new ShopifyError("An invoice needs at least one product.");
  const patch: Record<string, unknown> = {
    lineItems: input.lines.map(lineItemInput),
    taxExempt: !input.vat,
    note: input.note ?? "",
  };
  if (input.customerId?.trim()) patch.purchasingEntity = { customerId: input.customerId.trim() };
  else if (input.email?.trim()) patch.email = input.email.trim();
  const uType = input.discountType ?? "PERCENTAGE";
  const uValue = input.discountValue ?? input.discountPercent ?? 0;
  patch.appliedDiscount = uValue > 0 ? { valueType: uType, value: uValue, title: "Discount" } : null;

  const res = await adminGraphQL<{
    draftOrderUpdate: {
      draftOrder: {
        id: string; name: string; invoiceUrl: string | null;
        subtotalPrice: string; totalTax: string; totalPrice: string;
      } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(
    `mutation($id: ID!, $input: DraftOrderInput!) {
      draftOrderUpdate(id: $id, input: $input) {
        draftOrder { id name invoiceUrl subtotalPrice totalTax totalPrice }
        userErrors { field message }
      }
    }`,
    { id: toGid(id), input: patch },
  );
  const errs = res.draftOrderUpdate.userErrors;
  if (errs.length) throw new ShopifyError(errs.map((e) => e.message).join("; "));
  const d = res.draftOrderUpdate.draftOrder;
  if (!d) throw new ShopifyError("Failed to update invoice.");
  return { id: d.id, name: d.name, invoiceUrl: d.invoiceUrl, subtotal: d.subtotalPrice, tax: d.totalTax, total: d.totalPrice, completed: false };
}

// Best-effort: mark a freshly-created order as fully fulfilled. Instant/POS sales
// and completed wholesale bills mean the goods have left the building, so they
// shouldn't linger as "Unfulfilled". Never throws — fulfillment must not block a sale.
export async function fulfillOrder(orderId: string | null): Promise<void> {
  if (!orderId) return;
  try {
    const q = await adminGraphQL<{
      order: { fulfillmentOrders: { edges: { node: { id: string; status: string } }[] } } | null;
    }>(
      `query($id: ID!) { order(id: $id) { fulfillmentOrders(first: 20) { edges { node { id status } } } } }`,
      { id: orderId },
    );
    const open = (q.order?.fulfillmentOrders.edges ?? [])
      .map((e) => e.node)
      .filter((n) => n.status === "OPEN" || n.status === "IN_PROGRESS" || n.status === "SCHEDULED");
    if (!open.length) return;
    await adminGraphQL(
      `mutation($f: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $f) { fulfillment { id status } userErrors { field message } }
      }`,
      { f: { lineItemsByFulfillmentOrder: open.map((n) => ({ fulfillmentOrderId: n.id })), notifyCustomer: false } },
    );
  } catch {
    /* best-effort */
  }
}

// ---- Complete a draft = mark paid, create the order, deduct stock ----
// `method` is HOW this settlement was paid — cash, card, bank transfer.
//
// It is deliberately stored separately from the invoice's `pay_method`, which
// records how the bill was EXPECTED to be paid when it was raised. A bill raised
// weeks ago as "cash" can be settled today by card, and the day's takings must
// follow the card. Without this, FIFO clearing an old bill reported the money
// under the wrong method and the cash-up would never reconcile.
export async function completeInvoice(
  id: string,
  paymentPending = false,
  method?: string,
): Promise<{ orderId: string | null }> {
  if (method?.trim()) {
    await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
      `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
      { mf: [{ ownerId: toGid(id), namespace: "portal", key: "paid_method", type: "single_line_text_field", value: method.trim().slice(0, 40) }] },
    ).catch(() => { /* never block the sale on a label */ });
  }
  const res = await adminGraphQL<{
    draftOrderComplete: {
      draftOrder: { id: string; order: { id: string } | null } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(
    `mutation($id: ID!, $pending: Boolean!) {
      draftOrderComplete(id: $id, paymentPending: $pending) {
        draftOrder { id order { id } }
        userErrors { field message }
      }
    }`,
    { id: toGid(id), pending: paymentPending },
  );
  const errs = res.draftOrderComplete.userErrors;
  if (errs.length) throw new ShopifyError(errs.map((e) => e.message).join("; "));
  const orderId = res.draftOrderComplete.draftOrder?.order?.id ?? null;
  await fulfillOrder(orderId);
  return { orderId };
}

// ---- Void a completed invoice ----
// A COMPLETED draft can't be un-completed or deleted in Shopify. Instead we cancel
// the order it created (restocking the items) and tag the draft "voided" so it drops
// out of the invoices list, stats and customer balances — effectively revoked.
export async function voidInvoice(id: string): Promise<void> {
  const gid = toGid(id);
  const d = await adminGraphQL<{ draftOrder: { id: string; order: { id: string } | null } | null }>(
    `query($id: ID!) { draftOrder(id: $id) { id order { id } } }`,
    { id: gid },
  );
  if (!d.draftOrder) throw new ShopifyError("Invoice not found.");

  const orderId = d.draftOrder.order?.id;
  if (orderId) {
    // Cancel the sale and restock; best-effort (some orders can't be cancelled).
    await adminGraphQL(
      `mutation($orderId: ID!) {
        orderCancel(orderId: $orderId, reason: STAFF, refund: false, restock: true, notifyCustomer: false, staffNote: "Voided in portal") {
          orderCancelUserErrors { field message }
        }
      }`,
      { orderId },
    ).catch(() => { /* best-effort */ });
  }

  const r = await adminGraphQL<{ tagsAdd: { userErrors: { message: string }[] } }>(
    `mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }`,
    { id: gid, tags: ["voided"] },
  );
  if (r.tagsAdd.userErrors.length) throw new ShopifyError(r.tagsAdd.userErrors.map((e) => e.message).join("; "));
}

// ---- Soft delete / restore ----
// Shopify's draftOrderDelete is irreversible, so the portal's "delete" tags the
// invoice instead: it drops out of every list, report and balance exactly like a
// void, but the record survives and can be put back. Hard deletion still exists
// (deleteInvoice) for the owner who really means it.
export async function softDeleteInvoice(id: string): Promise<void> {
  const r = await adminGraphQL<{ tagsAdd: { userErrors: { message: string }[] } }>(
    `mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }`,
    { id: toGid(id), tags: ["deleted"] },
  );
  if (r.tagsAdd.userErrors.length) throw new ShopifyError(r.tagsAdd.userErrors.map((e) => e.message).join("; "));
}

export async function restoreInvoice(id: string): Promise<void> {
  const r = await adminGraphQL<{ tagsRemove: { userErrors: { message: string }[] } }>(
    `mutation($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { field message } } }`,
    { id: toGid(id), tags: ["deleted"] },
  );
  if (r.tagsRemove.userErrors.length) throw new ShopifyError(r.tagsRemove.userErrors.map((e) => e.message).join("; "));
}

// List invoices that were soft-deleted, so they can be reviewed and restored.
export async function listDeletedInvoices(): Promise<InvoiceRow[]> {
  const all = await listInvoicesRaw("tag:portal-billing AND tag:deleted");
  return all;
}

// ---- Permanently delete a draft invoice (irreversible) ----
export async function deleteInvoice(id: string): Promise<void> {
  const res = await adminGraphQL<{
    draftOrderDelete: { deletedId: string | null; userErrors: { field: string[]; message: string }[] };
  }>(
    `mutation($id: ID!) {
      draftOrderDelete(input: { id: $id }) { deletedId userErrors { field message } }
    }`,
    { id: toGid(id) },
  );
  const errs = res.draftOrderDelete.userErrors;
  if (errs.length) throw new ShopifyError(errs.map((e) => e.message).join("; "));
}

// ---- Duplicate: clone an invoice into a fresh draft ----
export async function duplicateInvoice(id: string): Promise<BillResult> {
  const res = await adminGraphQL<{
    draftOrderDuplicate: {
      draftOrder: {
        id: string; name: string; invoiceUrl: string | null;
        subtotalPrice: string; totalTax: string; totalPrice: string;
      } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(
    `mutation($id: ID!) {
      draftOrderDuplicate(id: $id) {
        draftOrder { id name invoiceUrl subtotalPrice totalTax totalPrice }
        userErrors { field message }
      }
    }`,
    { id: toGid(id) },
  );
  const errs = res.draftOrderDuplicate.userErrors;
  if (errs.length) throw new ShopifyError(errs.map((e) => e.message).join("; "));
  const d = res.draftOrderDuplicate.draftOrder;
  if (!d) throw new ShopifyError("Failed to duplicate invoice.");
  return { id: d.id, name: d.name, invoiceUrl: d.invoiceUrl, subtotal: d.subtotalPrice, tax: d.totalTax, total: d.totalPrice, completed: false };
}

// ---- Email the invoice to the customer (Shopify invoice w/ payment link) ----
export async function sendInvoiceEmail(
  id: string,
  opts: { to?: string; subject?: string; message?: string } = {},
): Promise<void> {
  const email: Record<string, unknown> = {};
  if (opts.to?.trim()) email.to = opts.to.trim();
  if (opts.subject?.trim()) email.subject = opts.subject.trim();
  if (opts.message?.trim()) email.customMessage = opts.message.trim();
  const res = await adminGraphQL<{
    draftOrderInvoiceSend: {
      draftOrder: { id: string } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(
    `mutation($id: ID!, $email: EmailInput) {
      draftOrderInvoiceSend(id: $id, email: $email) {
        draftOrder { id }
        userErrors { field message }
      }
    }`,
    { id: toGid(id), email: Object.keys(email).length ? email : null },
  );
  const errs = res.draftOrderInvoiceSend.userErrors;
  if (errs.length) throw new ShopifyError(errs.map((e) => e.message).join("; "));
}

// ---- Summary stats for the invoices dashboard ----
export type InvoiceStats = {
  count: number;
  outstanding: number; // £ open (draft) totals
  paid: number; // £ completed totals
  openCount: number;
  paidCount: number;
};

export function summarizeInvoices(rows: InvoiceRow[]): InvoiceStats {
  let outstanding = 0, paid = 0, openCount = 0, paidCount = 0;
  for (const r of rows) {
    // Count money actually settled vs still due — so a part-paid invoice adds its
    // paid portion to "paid" and only its remaining balance to "outstanding".
    paid += Number(r.amountPaid) || 0;
    outstanding += Number(r.balance) || 0;
    if (r.status === "COMPLETED") paidCount++;
    if ((Number(r.balance) || 0) > 0.001) openCount++;
  }
  return { count: rows.length, outstanding: Math.round(outstanding * 100) / 100, paid: Math.round(paid * 100) / 100, openCount, paidCount };
}
