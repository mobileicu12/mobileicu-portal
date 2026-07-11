// Collection management: detail, create, edit, delete, add/remove products.
import { adminGraphQL, ShopifyError } from "./shopify";

export type CollectionProduct = {
  id: string;
  title: string;
  image: string | null;
  status: string;
  sku: string;
  price: string;
  available: number;
};

export type CollectionDetail = {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  image: string | null;
  smart: boolean;
  productsCount: number;
  rules: { column: string; relation: string; condition: string }[];
  appliedDisjunctively: boolean;
  products: CollectionProduct[];
  hasNextPage: boolean;
  endCursor: string | null;
};

export async function getCollection(id: string, after?: string | null): Promise<CollectionDetail> {
  const data = await adminGraphQL<{
    collection: {
      id: string;
      title: string;
      handle: string;
      descriptionHtml: string;
      image: { url: string } | null;
      productsCount: { count: number } | null;
      ruleSet: { appliedDisjunctively: boolean; rules: { column: string; relation: string; condition: string }[] } | null;
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: { node: { id: string; title: string; status: string; featuredImage: { url: string } | null; totalInventory: number; variants: { edges: { node: { sku: string | null; price: string } }[] } } }[];
      };
    } | null;
  }>(
    `query($id: ID!, $after: String) {
      collection(id: $id) {
        id title handle descriptionHtml
        image { url }
        productsCount { count }
        ruleSet { appliedDisjunctively rules { column relation condition } }
        products(first: 50, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges { node { id title status featuredImage { url } totalInventory variants(first: 1) { edges { node { sku price } } } } }
        }
      }
    }`,
    { id, after: after ?? null },
  );
  const c = data.collection;
  if (!c) throw new ShopifyError("Collection not found.");
  return {
    id: c.id,
    title: c.title,
    handle: c.handle,
    descriptionHtml: c.descriptionHtml ?? "",
    image: c.image?.url ?? null,
    smart: Boolean(c.ruleSet),
    productsCount: c.productsCount?.count ?? 0,
    rules: c.ruleSet?.rules ?? [],
    appliedDisjunctively: c.ruleSet?.appliedDisjunctively ?? false,
    products: c.products.edges.map((e) => ({
      id: e.node.id,
      title: e.node.title,
      image: e.node.featuredImage?.url ?? null,
      status: e.node.status,
      sku: e.node.variants.edges[0]?.node.sku ?? "",
      price: e.node.variants.edges[0]?.node.price ?? "",
      available: e.node.totalInventory ?? 0,
    })),
    hasNextPage: c.products.pageInfo.hasNextPage,
    endCursor: c.products.pageInfo.endCursor,
  };
}

export async function createCollection(input: { title: string; descriptionHtml?: string }): Promise<{ id: string }> {
  if (!input.title?.trim()) throw new ShopifyError("Title is required.");
  const d = await adminGraphQL<{
    collectionCreate: { collection: { id: string } | null; userErrors: { field: string[]; message: string }[] };
  }>(
    `mutation($input: CollectionInput!) { collectionCreate(input: $input) { collection { id } userErrors { field message } } }`,
    { input: { title: input.title.trim(), descriptionHtml: input.descriptionHtml ?? "" } },
  );
  if (d.collectionCreate.userErrors.length) throw new ShopifyError(d.collectionCreate.userErrors.map((e) => e.message).join("; "));
  if (!d.collectionCreate.collection) throw new ShopifyError("Failed to create collection.");
  return { id: d.collectionCreate.collection.id };
}

export async function updateCollection(id: string, fields: { title?: string; descriptionHtml?: string }): Promise<void> {
  const input: Record<string, unknown> = { id };
  if (fields.title !== undefined) input.title = fields.title;
  if (fields.descriptionHtml !== undefined) input.descriptionHtml = fields.descriptionHtml;
  const d = await adminGraphQL<{ collectionUpdate: { userErrors: { message: string }[] } }>(
    `mutation($input: CollectionInput!) { collectionUpdate(input: $input) { userErrors { field message } } }`,
    { input },
  );
  if (d.collectionUpdate.userErrors.length) throw new ShopifyError(d.collectionUpdate.userErrors.map((e) => e.message).join("; "));
}

// Set (or clear) a collection's parent — builds the nested hierarchy.
// parentId = null clears it (makes the collection top-level).
export async function setCollectionParent(id: string, parentId: string | null): Promise<void> {
  if (parentId && parentId === id) throw new ShopifyError("A collection can't be its own parent.");
  const d = await adminGraphQL<{ metafieldsSet: { userErrors: { field: string[]; message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $mf) { userErrors { field message } }
    }`,
    {
      mf: [{
        ownerId: id,
        namespace: "portal",
        key: "parent",
        type: "single_line_text_field",
        value: parentId ?? "",
      }],
    },
  );
  if (d.metafieldsSet.userErrors.length) throw new ShopifyError(d.metafieldsSet.userErrors.map((e) => e.message).join("; "));
}

export async function deleteCollection(id: string): Promise<void> {
  const d = await adminGraphQL<{ collectionDelete: { deletedCollectionId: string | null; userErrors: { message: string }[] } }>(
    `mutation($input: CollectionDeleteInput!) { collectionDelete(input: $input) { deletedCollectionId userErrors { field message } } }`,
    { input: { id } },
  );
  if (d.collectionDelete.userErrors.length) throw new ShopifyError(d.collectionDelete.userErrors.map((e) => e.message).join("; "));
}

export async function removeProductsFromCollection(id: string, productIds: string[]): Promise<void> {
  const d = await adminGraphQL<{ collectionRemoveProducts: { job: { id: string } | null; userErrors: { message: string }[] } }>(
    `mutation($id: ID!, $pids: [ID!]!) { collectionRemoveProducts(id: $id, productIds: $pids) { job { id } userErrors { field message } } }`,
    { id, pids: productIds },
  );
  if (d.collectionRemoveProducts.userErrors.length) throw new ShopifyError(d.collectionRemoveProducts.userErrors.map((e) => e.message).join("; "));
}

export async function searchProducts(q: string): Promise<{ id: string; title: string; image: string | null; status: string }[]> {
  if (!q.trim()) return [];
  const d = await adminGraphQL<{
    products: { edges: { node: { id: string; title: string; featuredImage: { url: string } | null; status: string } }[] };
  }>(
    `query($q: String!) { products(first: 15, query: $q) { edges { node { id title featuredImage { url } status } } } }`,
    { q },
  );
  return d.products.edges.map((e) => ({ id: e.node.id, title: e.node.title, image: e.node.featuredImage?.url ?? null, status: e.node.status }));
}
