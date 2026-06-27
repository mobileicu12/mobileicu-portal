// Customer management (Shopify customers) + payment ledger via metafield.
import { adminGraphQL, ShopifyError } from "./shopify";

export type CustomerSummary = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  orders: number;
  totalSpent: string;
};

export type Payment = { date: string; amount: number; method: string; note: string };
export type Ledger = { payments: Payment[]; creditLimit?: number };

export type CustomerDetail = CustomerSummary & {
  note: string;
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
}): Promise<{ id: string }> {
  if (!input.email?.trim() && !input.phone?.trim() && !input.firstName?.trim()) {
    throw new ShopifyError("Provide at least a name, email, or phone.");
  }
  const customerInput: Record<string, unknown> = {
    firstName: input.firstName?.trim() || undefined,
    lastName: input.lastName?.trim() || undefined,
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    note: input.note?.trim() || undefined,
    tags: ["portal", "wholesale"],
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

export async function listCustomers(q?: string): Promise<CustomerSummary[]> {
  const data = await adminGraphQL<{
    customers: {
      edges: {
        node: {
          id: string;
          displayName: string;
          email: string | null;
          phone: string | null;
          numberOfOrders: string;
          amountSpent: { amount: string } | null;
          company: { value: string } | null;
        };
      }[];
    };
  }>(
    `query($q: String) {
      customers(first: 50, query: $q, sortKey: UPDATED_AT, reverse: true) {
        edges { node {
          id displayName email phone numberOfOrders
          amountSpent { amount }
          company: metafield(namespace: "${LEDGER_NS}", key: "company") { value }
        } }
      }
    }`,
    { q: q && q.trim() ? q.trim() : null },
  );
  return data.customers.edges.map((e) => ({
    id: e.node.id,
    name: e.node.displayName,
    company: e.node.company?.value ?? "",
    email: e.node.email ?? "",
    phone: e.node.phone ?? "",
    orders: Number(e.node.numberOfOrders ?? 0),
    totalSpent: e.node.amountSpent?.amount ?? "0",
  }));
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
        id displayName email phone note numberOfOrders
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
