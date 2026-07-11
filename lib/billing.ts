// Billing: product search, draft orders (invoices), POS completion.
import { adminGraphQL, ShopifyError } from "./shopify";
import { segmentsFromTags, type SegmentKey } from "./segments";
import { nextInvoiceNumber } from "./settings";

export type VariantHit = {
  variantId: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  price: string;
  image: string | null;
  available: number;
};

export async function searchVariants(q: string): Promise<VariantHit[]> {
  if (!q.trim()) return [];
  const data = await adminGraphQL<{
    products: {
      edges: {
        node: {
          title: string;
          featuredImage: { url: string } | null;
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
          variants(first: 10) { edges { node { id title sku price inventoryQuantity } } }
        } }
      }
    }`,
    { q },
  );

  const hits: VariantHit[] = [];
  for (const p of data.products.edges) {
    for (const v of p.node.variants.edges) {
      hits.push({
        variantId: v.node.id,
        productTitle: p.node.title,
        variantTitle: v.node.title === "Default Title" ? "" : v.node.title,
        sku: v.node.sku ?? "",
        price: v.node.price,
        image: p.node.featuredImage?.url ?? null,
        available: v.node.inventoryQuantity ?? 0,
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
  note?: string;
  discountPercent?: number;
  complete?: boolean; // POS: complete immediately (creates order, deducts stock)
  segment?: SegmentKey; // where this sale comes from (online/shop/ebay/amazon)
};

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
  const draftInput: Record<string, unknown> = {
    lineItems: input.lines.map(lineItemInput),
    taxExempt: !input.vat,
    note: input.note || undefined,
    tags: ["portal-billing", ...(input.segment ? [`seg:${input.segment}`] : [])],
    metafields: [{ namespace: "portal", key: "invoice_no", type: "single_line_text_field", value: invoiceNo }],
  };
  if (input.customerId?.trim()) draftInput.purchasingEntity = { customerId: input.customerId.trim() };
  else if (input.email?.trim()) draftInput.email = input.email.trim();
  if (input.discountPercent && input.discountPercent > 0) {
    draftInput.appliedDiscount = {
      valueType: "PERCENTAGE",
      value: input.discountPercent,
      title: "Wholesale discount",
    };
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

export type InvoiceRow = {
  id: string;
  name: string;
  invoiceNo: string;
  customer: string;
  status: string;
  total: string;
  createdAt: string;
  invoiceUrl: string | null;
  segment: SegmentKey | null;
};

export async function listInvoices(): Promise<InvoiceRow[]> {
  const data = await adminGraphQL<{
    draftOrders: {
      edges: {
        node: {
          id: string;
          name: string;
          status: string;
          totalPrice: string;
          createdAt: string;
          invoiceUrl: string | null;
          tags: string[];
          invoiceNo: { value: string } | null;
          customer: { displayName: string | null } | null;
          email: string | null;
        };
      }[];
    };
  }>(
    `query {
      draftOrders(first: 100, reverse: true, query: "tag:portal-billing") {
        edges { node {
          id name status totalPrice createdAt invoiceUrl tags
          invoiceNo: metafield(namespace: "portal", key: "invoice_no") { value }
          customer { displayName }
          email
        } }
      }
    }`,
  );
  return data.draftOrders.edges.map((e) => ({
    id: e.node.id,
    name: e.node.name,
    invoiceNo: e.node.invoiceNo?.value || e.node.name,
    customer: e.node.customer?.displayName || e.node.email || "—",
    status: e.node.status,
    total: e.node.totalPrice,
    createdAt: e.node.createdAt,
    invoiceUrl: e.node.invoiceUrl,
    segment: segmentsFromTags(e.node.tags ?? [])[0] ?? null,
  }));
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
      taxExempt: boolean;
      subtotalPrice: string; totalTax: string; totalPrice: string;
      totalDiscountsSet: { presentmentMoney: { amount: string; currencyCode: string } } | null;
      customer: { displayName: string | null; email: string | null; phone: string | null } | null;
      email: string | null;
      payments: { value: string } | null;
      invoiceNo: { value: string } | null;
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
        id name status createdAt note2 taxExempt
        subtotalPrice totalTax totalPrice
        totalDiscountsSet { presentmentMoney { amount currencyCode } }
        customer { displayName email phone }
        email
        payments: metafield(namespace: "portal", key: "payments") { value }
        invoiceNo: metafield(namespace: "portal", key: "invoice_no") { value }
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
  const amountPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balance = Math.max(0, (parseFloat(d.totalPrice) || 0) - amountPaid);

  return {
    id: d.id,
    name: d.name,
    invoiceNo: d.invoiceNo?.value || d.name,
    status: d.status,
    createdAt: d.createdAt,
    note: d.note2 || "",
    currency,
    customerName: d.customer?.displayName || "—",
    customerEmail: d.customer?.email || d.email || "",
    customerPhone: d.customer?.phone || d.billingAddress?.phone || "",
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
  };
}

// Record a (partial) payment against a specific invoice (draft order metafield).
export async function addInvoicePayment(id: string, payment: InvoicePayment): Promise<InvoicePayment[]> {
  const detail = await getInvoiceDetail(id);
  const payments = [...detail.payments, payment];
  const res = await adminGraphQL<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] };
  }>(
    `mutation($mf: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $mf) { userErrors { field message } }
    }`,
    {
      mf: [{ ownerId: toGid(id), namespace: "portal", key: "payments", type: "json", value: JSON.stringify(payments) }],
    },
  );
  const errs = res.metafieldsSet.userErrors;
  if (errs.length) throw new ShopifyError(errs.map((e) => e.message).join("; "));
  return payments;
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
  patch.appliedDiscount =
    input.discountPercent && input.discountPercent > 0
      ? { valueType: "PERCENTAGE", value: input.discountPercent, title: "Wholesale discount" }
      : null;

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

// ---- Complete a draft = mark paid, create the order, deduct stock ----
export async function completeInvoice(id: string, paymentPending = false): Promise<{ orderId: string | null }> {
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
  return { orderId: res.draftOrderComplete.draftOrder?.order?.id ?? null };
}

// ---- Delete a draft invoice ----
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
    const t = parseFloat(r.total) || 0;
    if (r.status === "COMPLETED") { paid += t; paidCount++; }
    else { outstanding += t; openCount++; }
  }
  return { count: rows.length, outstanding, paid, openCount, paidCount };
}
