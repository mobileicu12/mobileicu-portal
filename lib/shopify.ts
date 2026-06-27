// Minimal Shopify Admin API (GraphQL) client for the portal.
// Reads credentials from environment variables (see .env.example).

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? "";
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN ?? "";
const VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-10";

export function shopifyConfigured(): boolean {
  return Boolean(DOMAIN && TOKEN && !TOKEN.startsWith("PASTE_"));
}

export class ShopifyError extends Error {}

export async function adminGraphQL<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  if (!shopifyConfigured()) {
    throw new ShopifyError(
      "Shopify is not configured. Add SHOPIFY_ADMIN_TOKEN to .env.local.",
    );
  }

  const res = await fetch(
    `https://${DOMAIN}/admin/api/${VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": TOKEN,
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
  query Inventory($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          status
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

export async function getInventory(opts: {
  query?: string;
  after?: string | null;
  first?: number;
}): Promise<{ rows: ProductRow[]; hasNextPage: boolean; endCursor: string | null }> {
  const data = await adminGraphQL<RawProductsResponse>(INVENTORY_QUERY, {
    first: opts.first ?? 25,
    after: opts.after ?? null,
    query: opts.query || null,
  });

  const rows: ProductRow[] = data.products.edges.map(({ node }) => ({
    productId: node.id,
    title: node.title,
    image: node.featuredImage?.url ?? null,
    status: node.status,
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
