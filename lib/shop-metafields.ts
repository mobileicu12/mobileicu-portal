// Generic read/write of the shop-level `portal` metafields.
//
// Everything the portal stores that Shopify has no native home for — settings,
// staff accounts, cash-ups, expenses, settlements, till counts, attendance, the
// audit log, the invoice counter, import history — is a JSON blob in a metafield
// on the shop, under the `portal` namespace, usually split into monthly buckets.
//
// The backup used to name the handful of things it knew about, which meant every
// feature added since (cash-ups, expenses, settlements, attendance, staff logins,
// audit history) was silently missing from it. Reading the namespace as a whole
// fixes that permanently: anything a future feature stores here is backed up the
// day it is written, without anyone remembering to add it.

import { adminGraphQL, ShopifyError } from "./shopify";

export const PORTAL_NS = "portal";

export type ShopMetafield = { key: string; type: string; value: string };

/**
 * Keys deliberately left out of a backup.
 *
 * `import_stage_*` is a parked spreadsheet mid-import — scratch that is swept
 * after 24h. `import_run_<id>_<from>` holds the before-images an import needs to
 * be undone; useful for days, megabytes in size, and not a business record. The
 * `import_runs` index itself IS kept, so the history of what was imported and
 * when survives.
 */
const SKIP = [/^import_stage_/, /^import_run_[^]*_\d+$/];

function skipped(key: string): boolean {
  return SKIP.some((re) => re.test(key));
}

// The shop's own id never changes, and restore writes fields one at a time —
// without this, every single write would pay for a lookup query first.
let cachedShopGid: string | null = null;
async function shopGid(): Promise<string> {
  if (cachedShopGid) return cachedShopGid;
  const d = await adminGraphQL<{ shop: { id: string } }>(`query { shop { id } }`);
  cachedShopGid = d.shop.id;
  return cachedShopGid;
}

/** Every portal metafield key on the shop, without transferring the values. */
export async function listPortalKeys(): Promise<{ key: string; type: string }[]> {
  const keys: { key: string; type: string }[] = [];
  let after: string | null = null;
  // 40 pages of 250 is far beyond anything real; the bound just stops a broken
  // cursor from looping forever.
  for (let page = 0; page < 40; page++) {
    const d: {
      shop: {
        metafields: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: { key: string; type: string }[];
        };
      };
    } = await adminGraphQL(
      `query($after: String) {
        shop {
          metafields(namespace: "${PORTAL_NS}", first: 250, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes { key type }
          }
        }
      }`,
      { after },
    );
    keys.push(...d.shop.metafields.nodes);
    if (!d.shop.metafields.pageInfo.hasNextPage) break;
    after = d.shop.metafields.pageInfo.endCursor;
  }
  return keys;
}

/**
 * Read the values for named keys.
 *
 * Aliased into batches rather than paging the connection with `value` selected:
 * a single page of 250 blobs would be tens of megabytes in one response, and the
 * keys we don't want would be paid for before we could drop them.
 */
export async function readPortalValues(keys: string[]): Promise<ShopMetafield[]> {
  const out: ShopMetafield[] = [];
  const BATCH = 12;
  for (let i = 0; i < keys.length; i += BATCH) {
    const slice = keys.slice(i, i + BATCH);
    const fields = slice
      .map((k, n) => `m${n}: metafield(namespace: "${PORTAL_NS}", key: "${k}") { type value }`)
      .join("\n");
    const d = await adminGraphQL<{ shop: Record<string, { type: string; value: string } | null> }>(
      `query { shop { ${fields} } }`,
    );
    slice.forEach((k, n) => {
      const got = d.shop[`m${n}`];
      if (got) out.push({ key: k, type: got.type, value: got.value });
    });
  }
  return out;
}

export type PortalStateDump = {
  fields: ShopMetafield[];
  /** Keys that exist on the shop but were deliberately not copied. */
  skipped: string[];
  bytes: number;
};

/** Everything the portal keeps on the shop, minus the transient scratch keys. */
export async function dumpPortalState(): Promise<PortalStateDump> {
  const all = await listPortalKeys();
  const wanted = all.filter((k) => !skipped(k.key)).map((k) => k.key);
  const fields = await readPortalValues(wanted);
  return {
    fields,
    skipped: all.filter((k) => skipped(k.key)).map((k) => k.key),
    bytes: fields.reduce((n, f) => n + f.value.length, 0),
  };
}

/** Write metafields back onto the shop. Used by restore. */
export async function writePortalValues(fields: ShopMetafield[]): Promise<void> {
  if (!fields.length) return;
  const ownerId = await shopGid();
  const BATCH = 25; // metafieldsSet accepts 25 per call
  for (let i = 0; i < fields.length; i += BATCH) {
    const res = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
      `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
      {
        mf: fields.slice(i, i + BATCH).map((f) => ({
          ownerId,
          namespace: PORTAL_NS,
          key: f.key,
          type: f.type,
          value: f.value,
        })),
      },
    );
    if (res.metafieldsSet.userErrors.length) {
      throw new ShopifyError(res.metafieldsSet.userErrors.map((e) => e.message).join("; "));
    }
  }
}
