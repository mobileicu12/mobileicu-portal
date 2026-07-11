// Customer management (Shopify customers) + payment ledger via metafield.
import { adminGraphQL, ShopifyError } from "./shopify";
import { segmentsFromTags, tagsForSegments, isSegmentTag, type SegmentKey } from "./segments";

export type CustomerSummary = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  orders: number;
  totalSpent: string;
  segments: SegmentKey[];
};

export type Payment = { date: string; amount: number; method: string; note: string };
export type Ledger = { payments: Payment[]; creditLimit?: number };

export type CustomerDetail = CustomerSummary & {
  note: string;
  tags: string[];
  ledger: Ledger;
  invoices: {
    id: string;
    name: string;
    status: string;
    total: string;
    createdAt: string;
    invoiceUrl: string | null;
  }[];
};

const LEDGER_NS = "portal";
const LEDGER_KEY = "ledger";

export async function createCustomer(input: {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  note?: string;
  segments?: SegmentKey[];
}): Promise<{ id: string }> {
  if (!input.email?.trim() && !input.phone?.trim() && !input.firstName?.trim()) {
    throw new ShopifyError("Provide at least a name, email, or phone.");
  }
  const segs = input.segments?.length ? input.segments : (["shop"] as SegmentKey[]);
  const customerInput: Record<string, unknown> = {
    firstName: input.firstName?.trim() || undefined,
    lastName: input.lastName?.trim() || undefined,
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    note: input.note?.trim() || undefined,
    tags: ["portal", ...tagsForSegments(segs)],
  };
  if (input.company?.trim()) {
    customerInput.metafields = [
      { namespace: LEDGER_NS, key: "company", type: "single_line_text_field", value: input.company.trim() },
    ];
  }
  const data = await adminGraphQL<{
    customerCreate: { customer: { id: string } | null; userErrors: { field: string[]; message: string }[] };
  }>(
    `mutation($input: CustomerInput!) {
      customerCreate(input: $input) { customer { id } userErrors { field message } }
    }`,
    { input: customerInput },
  );
  const errs = data.customerCreate.userErrors;
  if (errs.length) throw new ShopifyError(errs.map((e) => e.message).join("; "));
  if (!data.customerCreate.customer) throw new ShopifyError("Failed to create customer.");
  return { id: data.customerCreate.customer.id };
}

export async function listCustomers(q?: string, segment?: SegmentKey): Promise<CustomerSummary[]> {
  // Build a Shopify customer search query combining free text + segment tag.
  const parts: string[] = [];
  if (q && q.trim()) parts.push(q.trim());
  if (segment) parts.push(`tag:'seg:${segment}'`);
  const query = parts.length ? parts.join(" AND ") : null;

  const data = await adminGraphQL<{
    customers: {
      edges: {
        node: {
          id: string;
          displayName: string;
          email: string | null;
          phone: string | null;
          numberOfOrders: string;
          tags: string[];
          amountSpent: { amount: string } | null;
          company: { value: string } | null;
        };
      }[];
    };
  }>(
    `query($q: String) {
      customers(first: 100, query: $q, sortKey: UPDATED_AT, reverse: true) {
        edges { node {
          id displayName email phone numberOfOrders tags
          amountSpent { amount }
          company: metafield(namespace: "${LEDGER_NS}", key: "company") { value }
        } }
      }
    }`,
    { q: query },
  );
  return data.customers.edges.map((e) => ({
    id: e.node.id,
    name: e.node.displayName,
    company: e.node.company?.value ?? "",
    email: e.node.email ?? "",
    phone: e.node.phone ?? "",
    orders: Number(e.node.numberOfOrders ?? 0),
    totalSpent: e.node.amountSpent?.amount ?? "0",
    segments: segmentsFromTags(e.node.tags ?? []),
  }));
}

// Replace a customer's segment tags (keeps all non-segment tags intact).
export async function setCustomerSegments(id: string, segments: SegmentKey[]): Promise<SegmentKey[]> {
  const cur = await adminGraphQL<{ customer: { tags: string[] } | null }>(
    `query($id: ID!) { customer(id: $id) { tags } }`,
    { id },
  );
  if (!cur.customer) throw new ShopifyError("Customer not found.");
  const kept = (cur.customer.tags ?? []).filter((t) => !isSegmentTag(t));
  const tags = [...kept, ...tagsForSegments(segments)];
  const res = await adminGraphQL<{
    customerUpdate: { customer: { id: string } | null; userErrors: { field: string[]; message: string }[] };
  }>(
    `mutation($input: CustomerInput!) {
      customerUpdate(input: $input) { customer { id } userErrors { field message } }
    }`,
    { input: { id, tags } },
  );
  const errs = res.customerUpdate.userErrors;
  if (errs.length) throw new ShopifyError(errs.map((e) => e.message).join("; "));
  return segments;
}

export async function getCustomer(id: string): Promise<CustomerDetail> {
  const data = await adminGraphQL<{
    customer: {
      id: string;
      displayName: string;
      email: string | null;
      phone: string | null;
      note: string | null;
      numberOfOrders: string;
      tags: string[];
      amountSpent: { amount: string } | null;
      company: { value: string } | null;
      ledger: { value: string } | null;
      draftOrders: {
        edges: {
          node: { id: string; name: string; status: string; totalPrice: string; createdAt: string; invoiceUrl: string | null };
        }[];
      };
    } | null;
  }>(
    `query($id: ID!) {
      customer(id: $id) {
        id displayName email phone note numberOfOrders tags
        amountSpent { amount }
        company: metafield(namespace: "${LEDGER_NS}", key: "company") { value }
        ledger: metafield(namespace: "${LEDGER_NS}", key: "${LEDGER_KEY}") { value }
        draftOrders(first: 50, reverse: true) {
          edges { node { id name status totalPrice createdAt invoiceUrl } }
        }
      }
    }`,
    { id },
  );
  const c = data.customer;
  if (!c) throw new ShopifyError("Customer not found.");
  let ledger: Ledger = { payments: [] };
  if (c.ledger?.value) {
    try {
      ledger = JSON.parse(c.ledger.value);
      if (!Array.isArray(ledger.payments)) ledger.payments = [];
    } catch {
      ledger = { payments: [] };
    }
  }
  return {
    id: c.id,
    name: c.displayName,
    company: c.company?.value ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    note: c.note ?? "",
    tags: c.tags ?? [],
    segments: segmentsFromTags(c.tags ?? []),
    orders: Number(c.numberOfOrders ?? 0),
    totalSpent: c.amountSpent?.amount ?? "0",
    ledger,
    invoices: c.draftOrders.edges.map((e) => ({
      id: e.node.id,
      name: e.node.name,
      status: e.node.status,
      total: e.node.totalPrice,
      createdAt: e.node.createdAt,
      invoiceUrl: e.node.invoiceUrl,
    })),
  };
}

export async function addPayment(
  customerId: string,
  payment: Payment,
): Promise<Ledger> {
  const current = await getCustomer(customerId);
  const ledger = current.ledger;
  ledger.payments = [...ledger.payments, payment];
  await adminGraphQL<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] };
  }>(
    `mutation($mf: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $mf) { userErrors { field message } }
    }`,
    {
      mf: [
        {
          ownerId: customerId,
          namespace: LEDGER_NS,
          key: LEDGER_KEY,
          type: "json",
          value: JSON.stringify(ledger),
        },
      ],
    },
  );
  return ledger;
}
