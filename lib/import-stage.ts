// Holding area for a sheet that's been uploaded but not yet applied.
//
// A big import is applied in many small requests. Those requests used to carry
// the whole .xlsx every time — a 3,000-row sheet meant uploading and re-parsing
// the same file seventy-odd times, which is slow, wasteful, and the most likely
// source of the dropped connections that stopped imports part-way.
//
// So the file is uploaded ONCE, parsed once, and the parsed rows are staged
// here. Each apply request then names a stage and a row range and carries no
// file at all — a few kilobytes instead of megabytes.
//
// Storage: shop metafields, paged.
//   portal.import_stage_<id>          { total, pageSize, at }
//   portal.import_stage_<id>_<page>   that page's parsed rows
//
// Paged so a slice can be read without pulling the whole sheet back, and so no
// single metafield has to hold thousands of rows.
import { adminGraphQL, ShopifyError } from "./shopify";
import type { ParsedImportRow } from "./import-preview";

const NS = "portal";
/** Rows per stage metafield. Small enough that reading one slice is cheap. */
const PAGE = 250;
/** Stages older than this are swept when the next import is staged. An
 *  abandoned upload shouldn't sit in the shop's metafields forever. */
const STALE_MS = 24 * 60 * 60 * 1000;

type StageIndex = { total: number; pageSize: number; at: string };

const indexKey = (id: string) => `import_stage_${id}`;
const pageKey = (id: string, page: number) => `import_stage_${id}_${page}`;

async function shopGid(): Promise<string> {
  const d = await adminGraphQL<{ shop: { id: string } }>(`query { shop { id } }`);
  return d.shop.id;
}

async function writeJson(ownerId: string, key: string, value: unknown): Promise<void> {
  const res = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
    { mf: [{ ownerId, namespace: NS, key, type: "json", value: JSON.stringify(value) }] },
  );
  if (res.metafieldsSet.userErrors.length) {
    throw new ShopifyError(res.metafieldsSet.userErrors.map((e) => e.message).join("; "));
  }
}

async function readJson<T>(key: string): Promise<T | null> {
  const d = await adminGraphQL<{ shop: { metafield: { value: string } | null } }>(
    `query($ns: String!, $key: String!) { shop { metafield(namespace: $ns, key: $key) { value } } }`,
    { ns: NS, key },
  );
  if (!d.shop.metafield?.value) return null;
  try {
    return JSON.parse(d.shop.metafield.value) as T;
  } catch {
    return null;
  }
}

/** Park a parsed sheet and return the handle the apply requests will use. */
export async function stageRows(rows: ParsedImportRow[]): Promise<{ stageId: string; total: number }> {
  const stageId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const ownerId = await shopGid();

  for (let page = 0; page * PAGE < rows.length; page++) {
    await writeJson(ownerId, pageKey(stageId, page), rows.slice(page * PAGE, (page + 1) * PAGE));
  }
  // Index last: until it exists the stage isn't claimed to be readable.
  await writeJson(ownerId, indexKey(stageId), {
    total: rows.length,
    pageSize: PAGE,
    at: new Date().toISOString(),
  } satisfies StageIndex);

  void sweepStale(ownerId).catch(() => { /* housekeeping, never the caller's problem */ });
  return { stageId, total: rows.length };
}

/** Read just the rows in [from, to) — only the pages that overlap are fetched. */
export async function readStageSlice(
  stageId: string,
  from: number,
  to: number,
): Promise<{ rows: ParsedImportRow[]; total: number }> {
  const index = await readJson<StageIndex>(indexKey(stageId));
  if (!index) throw new ShopifyError("That upload has expired. Choose the file again.");

  const size = index.pageSize || PAGE;
  const start = Math.max(0, from);
  const end = Math.min(to, index.total);
  const rows: ParsedImportRow[] = [];
  for (let page = Math.floor(start / size); page * size < end; page++) {
    const chunk = (await readJson<ParsedImportRow[]>(pageKey(stageId, page))) ?? [];
    for (let i = 0; i < chunk.length; i++) {
      const abs = page * size + i;
      if (abs >= start && abs < end) rows.push(chunk[i]);
    }
  }
  return { rows, total: index.total };
}

export async function stageTotal(stageId: string): Promise<number | null> {
  return (await readJson<StageIndex>(indexKey(stageId)))?.total ?? null;
}

/** Drop a stage once its import has finished. */
export async function clearStage(stageId: string): Promise<void> {
  const index = await readJson<StageIndex>(indexKey(stageId));
  const ownerId = await shopGid();
  const keys = [indexKey(stageId)];
  if (index) {
    const size = index.pageSize || PAGE;
    for (let page = 0; page * size < index.total; page++) keys.push(pageKey(stageId, page));
  }
  await adminGraphQL(
    `mutation Del($mf: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $mf) { userErrors { field message } }
    }`,
    { mf: keys.map((key) => ({ ownerId, namespace: NS, key })) },
  ).catch(() => { /* a leftover stage is harmless; the sweep will get it */ });
}

/** Delete stages left behind by uploads that were never applied. */
async function sweepStale(ownerId: string): Promise<void> {
  const d = await adminGraphQL<{
    shop: { metafields: { edges: { node: { key: string; value: string } }[] } };
  }>(
    `query { shop { metafields(namespace: "${NS}", first: 250) { edges { node { key value } } } } }`,
  );
  const cutoff = Date.now() - STALE_MS;
  const dead: string[] = [];
  for (const { node } of d.shop.metafields.edges) {
    // Index keys only — `import_stage_<id>`, not `import_stage_<id>_<page>`.
    if (!/^import_stage_[a-z0-9]+$/.test(node.key)) continue;
    try {
      const idx = JSON.parse(node.value) as StageIndex;
      if (+new Date(idx.at) < cutoff) {
        const id = node.key.slice("import_stage_".length);
        dead.push(node.key);
        const size = idx.pageSize || PAGE;
        for (let page = 0; page * size < idx.total; page++) dead.push(pageKey(id, page));
      }
    } catch { /* unreadable index: leave it rather than guess */ }
  }
  if (!dead.length) return;
  await adminGraphQL(
    `mutation Del($mf: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $mf) { userErrors { field message } }
    }`,
    { mf: dead.map((key) => ({ ownerId, namespace: NS, key })) },
  );
}
