// Real (completed) orders from Shopify — segmented for the portal.
import { adminGraphQL, ShopifyError } from "./shopify";
import { segmentsFromTags, type SegmentKey } from "./segments";

export type OrderRow = {
  id: string;
  name: string;
  customer: string;
  createdAt: string;
  total: string;
  currency: string;
  financialStatus: string; // PAID, PENDING, REFUNDED…
  fulfillmentStatus: string; // FULFILLED, UNFULFILLED, PARTIALLY_FULFILLED
  itemCount: number;
  source: string; // web, pos, shopify_draft_order…
  segment: SegmentKey | null;
};

// Derive a segment from tags first, then fall back to the order's source channel.
function deriveSegment(tags: string[], source: string | null): SegmentKey | null {
  const fromTag = segmentsFromTags(tags)[0];
  if (fromTag) return fromTag;
  const s = (source || "").toLowerCase();
  if (s.includes("pos")) return "shop";
  if (s.includes("ebay")) return "ebay";
  if (s.includes("amazon")) return "amazon";
  if (s.includes("web") || s.includes("online") || s.includes("draft")) return "online";
  return null;
}

export async function listOrders(opts: { query?: string; segment?: SegmentKey } = {}): Promise<OrderRow[]> {
  const parts: string[] = [];
  if (opts.query?.trim()) parts.push(opts.query.trim());
  if (opts.segment) parts.push(`tag:'seg:${opts.segment}'`);
  const query = parts.length ? parts.join(" AND ") : null;

  const data = await adminGraphQL<{
    orders: {
      edges: {
        node: {
          id: string;
          name: string;
          createdAt: string;
          displayFinancialStatus: string | null;
          displayFulfillmentStatus: string | null;
          sourceName: string | null;
          tags: string[];
          currentSubtotalLineItemsQuantity: number | null;
          currentTotalPriceSet: { presentmentMoney: { amount: string; currencyCode: string } };
          customer: { displayName: string | null } | null;
          email: string | null;
        };
      }[];
    };
  }>(
    `query($q: String) {
      orders(first: 100, reverse: true, query: $q, sortKey: CREATED_AT) {
        edges { node {
          id name createdAt
          displayFinancialStatus displayFulfillmentStatus sourceName tags
          currentSubtotalLineItemsQuantity
          currentTotalPriceSet { presentmentMoney { amount currencyCode } }
          customer { displayName }
          email
        } }
      }
    }`,
    { q: query },
  );

  return data.orders.edges.map((e) => ({
    id: e.node.id,
    name: e.node.name,
    customer: e.node.customer?.displayName || e.node.email || "—",
    createdAt: e.node.createdAt,
    total: e.node.currentTotalPriceSet.presentmentMoney.amount,
    currency: e.node.currentTotalPriceSet.presentmentMoney.currencyCode,
    financialStatus: e.node.displayFinancialStatus || "—",
    fulfillmentStatus: e.node.displayFulfillmentStatus || "UNFULFILLED",
    itemCount: e.node.currentSubtotalLineItemsQuantity ?? 0,
    source: e.node.sourceName || "—",
    segment: deriveSegment(e.node.tags ?? [], e.node.sourceName),
  }));
}

export type OrderStats = { count: number; sales: number; unfulfilled: number; unpaid: number };

export function summarizeOrders(rows: OrderRow[]): OrderStats {
  let sales = 0, unfulfilled = 0, unpaid = 0;
  for (const r of rows) {
    sales += parseFloat(r.total) || 0;
    if (r.fulfillmentStatus !== "FULFILLED") unfulfilled++;
    if (r.financialStatus !== "PAID" && r.financialStatus !== "REFUNDED") unpaid++;
  }
  return { count: rows.length, sales, unfulfilled, unpaid };
}

export type OrderLine = { title: string; sku: string; quantity: number; unitPrice: string; lineTotal: string; image: string | null };

export type OrderDetail = {
  id: string;
  name: string;
  createdAt: string;
  customer: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string[];
  financialStatus: string;
  fulfillmentStatus: string;
  source: string;
  segment: SegmentKey | null;
  note: string;
  currency: string;
  lines: OrderLine[];
  subtotal: string;
  shipping: string;
  tax: string;
  total: string;
};

function addr(a: {
  address1?: string | null; address2?: string | null; city?: string | null;
  zip?: string | null; province?: string | null; country?: string | null; company?: string | null; name?: string | null;
} | null): string[] {
  if (!a) return [];
  return [a.name, a.company, a.address1, a.address2, [a.city, a.province].filter(Boolean).join(", "), a.zip, a.country]
    .map((s) => (s || "").trim())
    .filter(Boolean);
}

export async function getOrder(id: string): Promise<OrderDetail> {
  const gid = id.startsWith("gid://") ? id : `gid://shopify/Order/${id}`;
  const data = await adminGraphQL<{
    order: {
      id: string; name: string; createdAt: string; note: string | null;
      displayFinancialStatus: string | null; displayFulfillmentStatus: string | null; sourceName: string | null; tags: string[];
      customer: { displayName: string | null; email: string | null; phone: string | null } | null;
      email: string | null;
      shippingAddress: { name: string | null; company: string | null; address1: string | null; address2: string | null; city: string | null; zip: string | null; province: string | null; country: string | null } | null;
      currentSubtotalPriceSet: { presentmentMoney: { amount: string; currencyCode: string } };
      totalShippingPriceSet: { presentmentMoney: { amount: string } };
      currentTotalTaxSet: { presentmentMoney: { amount: string } } | null;
      currentTotalPriceSet: { presentmentMoney: { amount: string } };
      lineItems: { edges: { node: {
        title: string; sku: string | null; quantity: number;
        image: { url: string } | null;
        originalUnitPriceSet: { presentmentMoney: { amount: string } };
        discountedTotalSet: { presentmentMoney: { amount: string } };
      } }[] };
    } | null;
  }>(
    `query($id: ID!) {
      order(id: $id) {
        id name createdAt note
        displayFinancialStatus displayFulfillmentStatus sourceName tags
        customer { displayName email phone }
        email
        shippingAddress { name company address1 address2 city zip province country }
        currentSubtotalPriceSet { presentmentMoney { amount currencyCode } }
        totalShippingPriceSet { presentmentMoney { amount } }
        currentTotalTaxSet { presentmentMoney { amount } }
        currentTotalPriceSet { presentmentMoney { amount } }
        lineItems(first: 100) {
          edges { node {
            title sku quantity
            image { url }
            originalUnitPriceSet { presentmentMoney { amount } }
            discountedTotalSet { presentmentMoney { amount } }
          } }
        }
      }
    }`,
    { id: gid },
  );
  const o = data.order;
  if (!o) throw new ShopifyError("Order not found.");
  return {
    id: o.id,
    name: o.name,
    createdAt: o.createdAt,
    customer: o.customer?.displayName || o.email || "—",
    customerEmail: o.customer?.email || o.email || "",
    customerPhone: o.customer?.phone || "",
    shippingAddress: addr(o.shippingAddress),
    financialStatus: o.displayFinancialStatus || "—",
    fulfillmentStatus: o.displayFulfillmentStatus || "UNFULFILLED",
    source: o.sourceName || "—",
    segment: deriveSegment(o.tags ?? [], o.sourceName),
    note: o.note || "",
    currency: o.currentSubtotalPriceSet.presentmentMoney.currencyCode,
    lines: o.lineItems.edges.map((e) => ({
      title: e.node.title,
      sku: e.node.sku || "",
      quantity: e.node.quantity,
      unitPrice: e.node.originalUnitPriceSet.presentmentMoney.amount,
      lineTotal: e.node.discountedTotalSet.presentmentMoney.amount,
      image: e.node.image?.url ?? null,
    })),
    subtotal: o.currentSubtotalPriceSet.presentmentMoney.amount,
    shipping: o.totalShippingPriceSet.presentmentMoney.amount,
    tax: o.currentTotalTaxSet?.presentmentMoney.amount || "0.00",
    total: o.currentTotalPriceSet.presentmentMoney.amount,
  };
}
