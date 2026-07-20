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
  firstName: string;
  lastName: string;
  note: string;
  tags: string[];
  tradeCode: string;
  openingBalance: number;
  address: string[];
  ledger: Ledger;
  invoices: {
    id: string;
    name: string;
    status: string;
    total: string;
    createdAt: string;
    invoiceUrl: string | null;
    amountPaid: number;
    balance: number;
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
  address1?: string;
  city?: string;
  zip?: string;
  country?: string; // ISO code e.g. GB
  openingBalance?: number; // old outstanding brought forward
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
  if (input.address1?.trim() || input.city?.trim() || input.zip?.trim()) {
    customerInput.addresses = [{
      address1: input.address1?.trim() || undefined,
      city: input.city?.trim() || undefined,
      zip: input.zip?.trim() || undefined,
      countryCode: input.country?.trim() || undefined,
      firstName: input.firstName?.trim() || undefined,
      lastName: input.lastName?.trim() || undefined,
      company: input.company?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
    }];
  }
  const mfs: { namespace: string; key: string; type: string; value: string }[] = [];
  if (input.company?.trim()) mfs.push({ namespace: LEDGER_NS, key: "company", type: "single_line_text_field", value: input.company.trim() });
  if (input.openingBalance && input.openingBalance > 0) mfs.push({ namespace: LEDGER_NS, key: "opening_balance", type: "number_decimal", value: String(input.openingBalance) });
  if (mfs.length) customerInput.metafields = mfs;

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

// Edit a customer's core details (name/email/phone/company/note/opening balance).
export async function updateCustomer(id: string, input: {
  firstName?: string; lastName?: string; email?: string; phone?: string;
  company?: string; note?: string; openingBalance?: number;
}): Promise<void> {
  const cInput: Record<string, unknown> = { id };
  if (input.firstName !== undefined) cInput.firstName = input.firstName.trim();
  if (input.lastName !== undefined) cInput.lastName = input.lastName.trim();
  if (input.email !== undefined) cInput.email = input.email.trim() || null;
  if (input.phone !== undefined) cInput.phone = input.phone.trim() || null;
  if (input.note !== undefined) cInput.note = input.note.trim();
  const res = await adminGraphQL<{ customerUpdate: { userErrors: { field: string[]; message: string }[] } }>(
    `mutation($input: CustomerInput!) { customerUpdate(input: $input) { userErrors { field message } } }`,
    { input: cInput },
  );
  if (res.customerUpdate.userErrors.length) throw new ShopifyError(res.customerUpdate.userErrors.map((e) => e.message).join("; "));

  const mfs: { ownerId: string; namespace: string; key: string; type: string; value: string }[] = [];
  if (input.company !== undefined && input.company.trim()) mfs.push({ ownerId: id, namespace: LEDGER_NS, key: "company", type: "single_line_text_field", value: input.company.trim() });
  if (input.openingBalance !== undefined) mfs.push({ ownerId: id, namespace: LEDGER_NS, key: "opening_balance", type: "number_decimal", value: String(Math.max(0, input.openingBalance)) });
  if (mfs.length) {
    const mr = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
      `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message } } }`,
      { m: mfs },
    );
    if (mr.metafieldsSet.userErrors.length) throw new ShopifyError(mr.metafieldsSet.userErrors.map((e) => e.message).join("; "));
  }
}

// Verify a storefront trade login: email + access code, and must be an approved
// (seg:online) customer. Returns the customer id on success.
export async function verifyTradeLogin(email: string, code: string): Promise<string | null> {
  if (!email.trim() || !code.trim()) return null;
  const d = await adminGraphQL<{
    customers: { edges: { node: { id: string; tags: string[]; code: { value: string } | null } }[] };
  }>(
    `query($q: String!) {
      customers(first: 1, query: $q) {
        edges { node { id tags code: metafield(namespace: "portal", key: "trade_code") { value } } }
      }
    }`,
    { q: `email:${email.trim()}` },
  );
  const node = d.customers.edges[0]?.node;
  if (!node) return null;
  if (!(node.tags ?? []).includes("seg:online")) return null; // must be approved
  if (!node.code?.value || node.code.value !== code.trim()) return null;
  return node.id;
}

// Generate & store a trade access code for a customer (portal side).
export async function setTradeCode(customerId: string): Promise<string> {
  const code = Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  const res = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
    { mf: [{ ownerId: customerId, namespace: "portal", key: "trade_code", type: "single_line_text_field", value: code }] },
  );
  if (res.metafieldsSet.userErrors.length) throw new ShopifyError(res.metafieldsSet.userErrors.map((e) => e.message).join("; "));
  return code;
}

// Public storefront trade-account registration. Creates a Shopify customer tagged
// as a pending signup (NO wholesale segment — you approve it in the portal).
export async function registerCustomer(input: {
  firstName?: string; lastName?: string; email?: string; phone?: string; company?: string; note?: string;
}): Promise<{ id: string }> {
  if (!input.email?.trim()) throw new ShopifyError("An email address is required.");
  const customerInput: Record<string, unknown> = {
    firstName: input.firstName?.trim() || undefined,
    lastName: input.lastName?.trim() || undefined,
    email: input.email.trim(),
    phone: input.phone?.trim() || undefined,
    note: input.note?.trim() || undefined,
    tags: ["portal", "storefront-signup", "pending-approval"],
  };
  if (input.company?.trim()) {
    customerInput.metafields = [
      { namespace: LEDGER_NS, key: "company", type: "single_line_text_field", value: input.company.trim() },
    ];
  }
  const data = await adminGraphQL<{
    customerCreate: { customer: { id: string } | null; userErrors: { field: string[]; message: string }[] };
  }>(
    `mutation($input: CustomerInput!) { customerCreate(input: $input) { customer { id } userErrors { field message } } }`,
    { input: customerInput },
  );
  const errs = data.customerCreate.userErrors;
  if (errs.length) throw new ShopifyError(errs.map((e) => e.message).join("; "));
  if (!data.customerCreate.customer) throw new ShopifyError("Could not create the account.");
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
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      phone: string | null;
      note: string | null;
      numberOfOrders: string;
      tags: string[];
      amountSpent: { amount: string } | null;
      company: { value: string } | null;
      tradeCode: { value: string } | null;
      opening: { value: string } | null;
      defaultAddress: { address1: string | null; address2: string | null; city: string | null; zip: string | null; province: string | null; country: string | null } | null;
      ledger: { value: string } | null;
    } | null;
  }>(
    `query($id: ID!) {
      customer(id: $id) {
        id displayName firstName lastName email phone note numberOfOrders tags
        amountSpent { amount }
        company: metafield(namespace: "${LEDGER_NS}", key: "company") { value }
        tradeCode: metafield(namespace: "${LEDGER_NS}", key: "trade_code") { value }
        opening: metafield(namespace: "${LEDGER_NS}", key: "opening_balance") { value }
        defaultAddress { address1 address2 city zip province country }
        ledger: metafield(namespace: "${LEDGER_NS}", key: "${LEDGER_KEY}") { value }
      }
    }`,
    { id },
  );
  const c = data.customer;
  if (!c) throw new ShopifyError("Customer not found.");

  // Draft orders (our invoices) aren't a field on Customer — query them at the
  // root, filtered to THIS customer only.
  const numericId = id.split("/").pop() ?? id;
  const dd = await adminGraphQL<{
    draftOrders: {
      edges: {
        node: { id: string; name: string; status: string; totalPrice: string; createdAt: string; invoiceUrl: string | null; payments: { value: string } | null };
      }[];
    };
  }>(
    `query($q: String!) {
      draftOrders(first: 100, reverse: true, query: $q) {
        edges { node { id name status totalPrice createdAt invoiceUrl payments: metafield(namespace: "portal", key: "payments") { value } } }
      }
    }`,
    { q: `customer_id:${numericId}` },
  );

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
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    company: c.company?.value ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    note: c.note ?? "",
    tags: c.tags ?? [],
    tradeCode: c.tradeCode?.value ?? "",
    openingBalance: c.opening?.value ? parseFloat(c.opening.value) || 0 : 0,
    address: c.defaultAddress
      ? [c.defaultAddress.address1, c.defaultAddress.address2, [c.defaultAddress.city, c.defaultAddress.province].filter(Boolean).join(", "), c.defaultAddress.zip, c.defaultAddress.country].map((s) => (s || "").trim()).filter(Boolean)
      : [],
    segments: segmentsFromTags(c.tags ?? []),
    orders: Number(c.numberOfOrders ?? 0),
    totalSpent: c.amountSpent?.amount ?? "0",
    ledger,
    invoices: dd.draftOrders.edges.map((e) => {
      const total = parseFloat(e.node.totalPrice) || 0;
      // A COMPLETED draft order is a finished sale — paid in full (money taken at
      // the till / via the order). Otherwise use any partial payments recorded
      // against the invoice.
      let amountPaid = 0;
      if (e.node.status === "COMPLETED") {
        amountPaid = total;
      } else if (e.node.payments?.value) {
        try {
          const arr = JSON.parse(e.node.payments.value);
          if (Array.isArray(arr)) amountPaid = arr.reduce((s: number, p: { amount?: number }) => s + (Number(p.amount) || 0), 0);
        } catch { /* ignore */ }
      }
      const balance = Math.max(0, total - amountPaid);
      return {
        id: e.node.id,
        name: e.node.name,
        status: e.node.status,
        total: e.node.totalPrice,
        createdAt: e.node.createdAt,
        invoiceUrl: e.node.invoiceUrl,
        amountPaid,
        balance,
      };
    }),
  };
}

// Bulk: add/remove segment tags across many customers (uses tagsAdd/tagsRemove — no read needed).
export async function bulkCustomerSegments(
  ids: string[],
  segments: SegmentKey[],
  mode: "add" | "remove",
): Promise<{ ok: number; failed: number }> {
  const tags = tagsForSegments(segments);
  if (!tags.length || !ids.length) return { ok: 0, failed: 0 };
  const mutation = mode === "add"
    ? `mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }`
    : `mutation($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { message } } }`;
  let ok = 0, failed = 0;
  for (const id of ids) {
    try {
      const r = await adminGraphQL<{ tagsAdd?: { userErrors: { message: string }[] }; tagsRemove?: { userErrors: { message: string }[] } }>(mutation, { id, tags });
      const errs = (r.tagsAdd ?? r.tagsRemove)?.userErrors ?? [];
      if (errs.length) failed++; else ok++;
    } catch { failed++; }
  }
  return { ok, failed };
}

export async function deleteCustomer(id: string): Promise<void> {
  const d = await adminGraphQL<{ customerDelete: { deletedCustomerId: string | null; userErrors: { message: string }[] } }>(
    `mutation($id: ID!) { customerDelete(input: { id: $id }) { deletedCustomerId userErrors { field message } } }`,
    { id },
  );
  if (d.customerDelete.userErrors.length) throw new ShopifyError(d.customerDelete.userErrors.map((e) => e.message).join("; "));
}

export async function bulkDeleteCustomers(ids: string[]): Promise<{ ok: number; failed: number }> {
  let ok = 0, failed = 0;
  for (const id of ids) {
    try { await deleteCustomer(id); ok++; } catch { failed++; }
  }
  return { ok, failed };
}

// Read just the account ledger (lighter than getCustomer).
async function readLedger(customerId: string): Promise<Ledger> {
  const d = await adminGraphQL<{ customer: { ledger: { value: string } | null } | null }>(
    `query($id: ID!) { customer(id: $id) { ledger: metafield(namespace: "${LEDGER_NS}", key: "${LEDGER_KEY}") { value } } }`,
    { id: customerId },
  );
  let ledger: Ledger = { payments: [] };
  if (d.customer?.ledger?.value) {
    try {
      const parsed = JSON.parse(d.customer.ledger.value);
      ledger = { payments: Array.isArray(parsed.payments) ? parsed.payments : [], creditLimit: parsed.creditLimit };
    } catch { ledger = { payments: [] }; }
  }
  return ledger;
}

async function writeLedger(customerId: string, ledger: Ledger): Promise<void> {
  const res = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
    { mf: [{ ownerId: customerId, namespace: LEDGER_NS, key: LEDGER_KEY, type: "json", value: JSON.stringify(ledger) }] },
  );
  if (res.metafieldsSet.userErrors.length) throw new ShopifyError(res.metafieldsSet.userErrors.map((e) => e.message).join("; "));
}

export async function addPayment(customerId: string, payment: Payment): Promise<Ledger> {
  const ledger = await readLedger(customerId);
  ledger.payments = [...ledger.payments, payment];
  await writeLedger(customerId, ledger);
  return ledger;
}

// Revoke (delete) an account payment by its index in the stored ledger.
export async function removePayment(customerId: string, index: number): Promise<Ledger> {
  const ledger = await readLedger(customerId);
  if (index < 0 || index >= ledger.payments.length) throw new ShopifyError("Payment not found.");
  ledger.payments.splice(index, 1);
  await writeLedger(customerId, ledger);
  return ledger;
}

// Edit an account payment (amount / method / note / date) by index.
export async function updatePaymentAt(
  customerId: string,
  index: number,
  patch: Partial<Payment>,
): Promise<Ledger> {
  const ledger = await readLedger(customerId);
  const p = ledger.payments[index];
  if (!p) throw new ShopifyError("Payment not found.");
  if (patch.amount != null) {
    if (patch.amount <= 0) throw new ShopifyError("Amount must be greater than zero.");
    p.amount = patch.amount;
  }
  if (patch.method) p.method = patch.method;
  if (patch.note != null) p.note = patch.note;
  if (patch.date) p.date = patch.date;
  await writeLedger(customerId, ledger);
  return ledger;
}
