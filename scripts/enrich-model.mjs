// Best-effort: fill custom.product_model (list) from product titles for parts.
//   node scripts/enrich-model.mjs          -> DRY RUN
//   node scripts/enrich-model.mjs --live   -> apply
import fs from "node:fs";
const LIVE = process.argv.includes("--live");

const env = {};
for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
}
const { SHOPIFY_STORE_DOMAIN: DOMAIN, SHOPIFY_CLIENT_ID: CID, SHOPIFY_CLIENT_SECRET: SEC } = env;
const VERSION = env.SHOPIFY_API_VERSION || "2025-10";
let TOKEN = "";
async function token() {
  if (TOKEN) return TOKEN;
  const r = await fetch(`https://${DOMAIN}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: CID, client_secret: SEC }) });
  TOKEN = (await r.json()).access_token; return TOKEN;
}
async function gql(query, variables) {
  const r = await fetch(`https://${DOMAIN}/admin/api/${VERSION}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await token() }, body: JSON.stringify({ query, variables }) });
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors)); return j.data;
}

function deriveModels(title) {
  let t = title.replace(/\\/g, "").replace(/[“”]/g, '"');
  // Only parse genuine parts — model parsing is reliable there, junk elsewhere.
  if (!/lcd|oled|amoled|display|digitizer|batter/i.test(t)) return [];
  const lower = t.toLowerCase();
  const forIdx = lower.search(/\bfor\b/);
  if (/^(battery|original|genuine|new|replacement|smart)\b/i.test(t) && forIdx >= 0) t = t.slice(forIdx + 3);
  let base = t.split(/\b(LCD|OLED|AMOLED|Display|Touch|Screen|Digitizer|Assembly|Replacement|Battery|Batteries|Incell|Original|Genuine|Quality|High|Premium|Best|Full|Complete|mAh|Keyboard|Folio|Case)\b/i)[0];
  base = base.split(/[–\-|(:]/)[0].replace(/\s+/g, " ").trim();
  if (!base) return [];
  let parts = base.split(/\s*[/+]\s*/).map((s) => s.trim()).filter(Boolean);
  // Propagate the brand/series prefix to bare fragments.
  if (parts.length > 1) {
    const brandWord = parts[0].split(" ")[0];
    parts = parts.map((p, i) => {
      if (i === 0) return p;
      if (!/^(tecno|redmi|xiaomi|poco|oppo|samsung|apple|iphone|ipad|note|galaxy|realme|vivo|huawei|honor|infinix|nokia|moto|spark|pop)/i.test(p)) return brandWord + " " + p;
      return p;
    });
  }
  parts = parts.filter((p) => p.length >= 2 && p.length <= 32 && /[a-z0-9]/i.test(p) && !/universal|folio|keyboard|leather|tablet/i.test(p));
  return [...new Set(parts)];
}

async function main() {
  console.log(LIVE ? "=== LIVE ===" : "=== DRY RUN ===");
  let after = null, scanned = 0, planned = 0, skipped = 0;
  const ops = [], samples = [];
  for (let page = 0; page < 60; page++) {
    const data = await gql(`query($after:String){ products(first:100, after:$after, sortKey:CREATED_AT){ pageInfo{hasNextPage endCursor} edges{ node{ id title model: metafield(namespace:"custom",key:"product_model"){value} } } } }`, { after });
    for (const { node } of data.products.edges) {
      scanned++;
      if (node.model?.value && node.model.value !== "[]") continue; // already has model
      const models = deriveModels(node.title);
      if (models.length === 0) { skipped++; continue; }
      planned++;
      if (samples.length < 45) samples.push(`${JSON.stringify(models).slice(0, 46).padEnd(48)} | ${node.title.slice(0, 60)}`);
      ops.push({ id: node.id, models });
    }
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  console.log(`Scanned ${scanned}. Will set model on ${planned}. Skipped(no parse) ${skipped}.`);
  console.log("\nSamples (models | title):");
  samples.forEach((s) => console.log("  " + s));
  if (!LIVE) { console.log("\nDry run. Re-run with --live to apply."); return; }

  const mfs = ops.map((o) => ({ ownerId: o.id, namespace: "custom", key: "product_model", type: "list.single_line_text_field", value: JSON.stringify(o.models) }));
  let ok = 0, fail = 0;
  for (let i = 0; i < mfs.length; i += 25) {
    const d = await gql(`mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ metafields{id} userErrors{message} } }`, { m: mfs.slice(i, i + 25) });
    ok += d.metafieldsSet.metafields.length; fail += d.metafieldsSet.userErrors.length;
    if (d.metafieldsSet.userErrors.length) console.log("err:", JSON.stringify(d.metafieldsSet.userErrors.slice(0, 2)));
    process.stdout.write(`\rApplied ${ok}...`);
  }
  console.log(`\nDone. ${ok} set, ${fail} errors.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
