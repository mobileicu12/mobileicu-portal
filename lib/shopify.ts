// Minimal Shopify Admin API (GraphQL) client for the portal.
// Reads credentials from environment variables (see .env.example).

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? "";
const STATIC_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN ?? "";
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET ?? "";
const VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-10";

export class ShopifyError extends Error {}

function hasStaticToken(): boolean {
  return Boolean(STATIC_TOKEN && STATIC_TOKEN.startsWith("shpat_"));
}
function hasClientCreds(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && !CLIENT_SECRET.startsWith("PASTE_"));
}

export function shopifyConfigured(): boolean {
  return Boolean(DOMAIN && (hasStaticToken() || hasClientCreds()));
}

// Cache the client-credentials token in module memory (valid ~24h).
let cachedToken = "";
let cachedExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (hasStaticToken()) return STATIC_TOKEN;
  if (!hasClientCreds()) {
    throw new ShopifyError(
      "Shopify is not configured. Add SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET to .env.local.",
    );
  }
  const now = Date.now();
  if (cachedToken && now < cachedExpiry - 60_000) return cachedToken;

  const res = await fetch(`https://${DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new ShopifyError(`Auth failed (${res.status}): ${t.slice(0, 250)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = json.access_token;
  cachedExpiry = now + (json.expires_in ?? 3600) * 1000;
  return cachedToken;
}

export async function adminGraphQL<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const token = await getAccessToken();

  const res = await fetch(
    `https://${DOMAIN}/admin/api/${VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new ShopifyError(`Shopify HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    data?: T;
    errors?: { message: string }[];
  };

  if (json.errors?.length) {
    throw new ShopifyError(json.errors.map((e) => e.message).join("; "));
  }
  return json.data as T;
}

// ---------------- Types ----------------

export type InventoryLevel = {
  locationId: string;
  locationName: string;
  available: number;
};

export type VariantRow = {
  variantId: string;
  inventoryItemId: string | null;
  tracked: boolean;
  variantTitle: string;
  sku: string;
  price: string;
  available: number; // total across locations
  levels: InventoryLevel[];
};

export type ProductRow = {
  productId: string;
  title: string;
  image: string | null;
  status: string;
  tags: string[];
  variants: VariantRow[];
};

export type Location = { id: string; name: string };

// ---------------- Queries ----------------

export async function getLocations(): Promise<Location[]> {
  const data = await adminGraphQL<{
    locations: { edges: { node: { id: string; name: string } }[] };
  }>(`
    query {
      locations(first: 20, query: "status:active") {
        edges { node { id name } }
      }
    }
  `);
  return data.locations.edges.map((e) => e.node);
}

const INVENTORY_QUERY = `
  query Inventory($first: Int!, $after: String, $query: String, $sortKey: ProductSortKeys, $reverse: Boolean) {
    products(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          status
          tags
          featuredImage { url }
          variants(first: 25) {
            edges {
              node {
                id
                title
                sku
                price
                inventoryItem {
                  id
                  tracked
                  inventoryLevels(first: 20) {
                    edges {
                      node {
                        location { id name }
                        quantities(names: ["available"]) { name quantity }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

type RawProductsResponse = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: {
      node: {
        id: string;
        title: string;
        status: string;
        tags: string[];
        featuredImage: { url: string } | null;
        variants: {
          edges: {
            node: {
              id: string;
              title: string;
              sku: string | null;
              price: string;
              inventoryItem: {
                id: string;
                tracked: boolean;
                inventoryLevels: {
                  edges: {
                    node: {
                      location: { id: string; name: string };
                      quantities: { name: string; quantity: number }[];
                    };
                  }[];
                };
              } | null;
            };
          }[];
        };
      };
    }[];
  };
};

const VALID_SORT_KEYS = new Set(["TITLE", "PRICE", "INVENTORY_TOTAL", "UPDATED_AT", "CREATED_AT", "PRODUCT_TYPE", "VENDOR"]);

export async function getInventory(opts: {
  query?: string;
  after?: string | null;
  first?: number;
  sortKey?: string;
  reverse?: boolean;
}): Promise<{ rows: ProductRow[]; hasNextPage: boolean; endCursor: string | null }> {
  const sortKey = opts.sortKey && VALID_SORT_KEYS.has(opts.sortKey) ? opts.sortKey : "TITLE";
  const data = await adminGraphQL<RawProductsResponse>(INVENTORY_QUERY, {
    first: opts.first ?? 25,
    after: opts.after ?? null,
    query: opts.query || null,
    sortKey,
    reverse: opts.reverse ?? false,
  });

  const rows: ProductRow[] = data.products.edges.map(({ node }) => ({
    productId: node.id,
    title: node.title,
    image: node.featuredImage?.url ?? null,
    status: node.status,
    tags: node.tags ?? [],
    variants: node.variants.edges.map(({ node: v }) => {
      const levels: InventoryLevel[] =
        v.inventoryItem?.inventoryLevels.edges.map((l) => ({
          locationId: l.node.location.id,
          locationName: l.node.location.name,
          available: l.node.quantities[0]?.quantity ?? 0,
        })) ?? [];
      const available = levels.reduce((sum, l) => sum + l.available, 0);
      return {
        variantId: v.id,
        inventoryItemId: v.inventoryItem?.id ?? null,
        tracked: v.inventoryItem?.tracked ?? false,
        variantTitle: v.title,
        sku: v.sku ?? "",
        price: v.price,
        available,
        levels,
      };
    }),
  }));

  return {
    rows,
    hasNextPage: data.products.pageInfo.hasNextPage,
    endCursor: data.products.pageInfo.endCursor,
  };
}

export async function setAvailable(
  inventoryItemId: string,
  locationId: string,
  quantity: number,
): Promise<void> {
  const data = await adminGraphQL<{
    inventorySetQuantities: { userErrors: { field: string[]; message: string }[] };
  }>(
    `
    mutation Set($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        userErrors { field message }
      }
    }
  `,
    {
      input: {
        name: "available",
        reason: "correction",
        ignoreCompareQuantity: true,
        quantities: [{ inventoryItemId, locationId, quantity }],
      },
    },
  );
  const errs = data.inventorySetQuantities.userErrors;
  if (errs.length) throw new ShopifyError(errs.map((e) => e.message).join("; "));
}

// ---------------- Dashboard stats ----------------

export type DashboardStats = {
  products: number;
  outOfStock: number;
  lowStock: number;
  collections: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const data = await adminGraphQL<{
    products: { count: number };
    out: { count: number };
    low: { count: number };
    collections: { count: number };
  }>(`
    query {
      products: productsCount { count }
      out: productsCount(query: "inventory_total:0") { count }
      low: productsCount(query: "inventory_total:>0 inventory_total:<=5") { count }
      collections: collectionsCount { count }
    }
  `);
  return {
    products: data.products.count,
    outOfStock: data.out.count,
    lowStock: data.low.count,
    collections: data.collections.count,
  };
}
