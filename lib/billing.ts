// Billing: product search, draft orders (invoices), POS completion.
import { adminGraphQL, ShopifyError } from "./shopify";

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

export type BillLine = { variantId: string; quantity: number };
export type CreateBillInput = {
  lines: BillLine[];
  vat: boolean;
  email?: string;
  customerId?: string;
  note?: string;
  discountPercent?: number;
  complete?: boolean; // POS: complete immediately (creates order, deducts stock)
};

export type BillResult = {
  id: string;
  name: string;
  invoiceUrl: string | null;
  subtotal: string;
  tax: string;
  total: string;
  completed: boolean;
};

export async function createBill(input: CreateBillInput): Promise<BillResult> {
  if (!input.lines.length) throw new ShopifyError("Add at least one product.");

  const draftInput: Record<string, unknown> = {
    lineItems: input.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    taxExempt: !input.vat,
    note: input.note || undefined,
    tags: ["portal-billing"],
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
  customer: string;
  status: string;
  total: string;
  createdAt: string;
  invoiceUrl: string | null;
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
          customer: { displayName: string | null } | null;
          email: string | null;
        };
      }[];
    };
  }>(
    `query {
      draftOrders(first: 40, reverse: true, query: "tag:portal-billing") {
        edges { node {
          id name status totalPrice createdAt invoiceUrl
          customer { displayName }
          email
        } }
      }
    }`,
  );
  return data.draftOrders.edges.map((e) => ({
    id: e.node.id,
    name: e.node.name,
    customer: e.node.customer?.displayName || e.node.email || "—",
    status: e.node.status,
    total: e.node.totalPrice,
    createdAt: e.node.createdAt,
    invoiceUrl: e.node.invoiceUrl,
  }));
}

export type InvoiceLine = {
  title: string;
  sku: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
};

export type InvoiceDetail = {
  id: string;
  name: string;
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
      billingAddress: {
        company: string | null; address1: string | null; address2: string | null;
        city: string | null; zip: string | null; province: string | null; country: string | null;
        phone: string | null;
      } | null;
      lineItems: {
        edges: {
          node: {
            title: string; sku: string | null; quantity: number;
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
        billingAddress { company address1 address2 city zip province country phone }
        lineItems(first: 100) {
          edges { node {
            title sku quantity
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

  return {
    id: d.id,
    name: d.name,
    status: d.status,
    createdAt: d.createdAt,
    note: d.note2 || "",
    currency,
    customerName: d.customer?.displayName || "—",
    customerEmail: d.customer?.email || d.email || "",
    customerPhone: d.customer?.phone || d.billingAddress?.phone || "",
    billingAddress: addrLines(d.billingAddress),
    lines: d.lineItems.edges.map((e) => ({
      title: e.node.title,
      sku: e.node.sku || "",
      quantity: e.node.quantity,
      unitPrice: e.node.originalUnitPriceSet.presentmentMoney.amount,
      lineTotal: e.node.discountedTotalSet.presentmentMoney.amount,
    })),
    subtotal: d.subtotalPrice,
    discount: d.totalDiscountsSet?.presentmentMoney.amount || "0.00",
    tax: d.totalTax,
    total: d.totalPrice,
    taxExempt: d.taxExempt,
  };
}
