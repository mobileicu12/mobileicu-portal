// Bulk-enrich product metafields (brand + product_type) from titles.
// Usage:
//   node scripts/enrich.mjs           -> DRY RUN (no writes; prints plan)
//   node scripts/enrich.mjs --live    -> applies metafields to Shopify
import fs from "node:fs";

const LIVE = process.argv.includes("--live");

// ---- load .env.local ----
const env = {};
for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const DOMAIN = env.SHOPIFY_STORE_DOMAIN;
const VERSION = env.SHOPIFY_API_VERSION || "2025-10";
const CLIENT_ID = env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = env.SHOPIFY_CLIENT_SECRET;

let TOKEN = "";
async function token() {
  if (TOKEN) return TOKEN;
  const r = await fetch(`https://${DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  if (!r.ok) throw new Error("auth failed: " + r.status + " " + (await r.text()));
  TOKEN = (await r.json()).access_token;
  return TOKEN;
}
async function gql(query, variables) {
  const r = await fetch(`https://${DOMAIN}/admin/api/${VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await token() },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// ---- derivation ----
function deriveBrand(t) {
  const s = t.toLowerCase();
  if (/\btecno\b/.test(s)) return "Tecno";
  if (/\bsamsung|galaxy\b/.test(s)) return "Samsung";
  if (/\bredmi|xiaomi|poco|\bmi \b/.test(s)) return "Xiaomi";
  if (/\boppo\b/.test(s)) return "OPPO";
  if (/\brealme\b/.test(s)) return "Realme";
  if (/\bhuawei\b/.test(s)) return "Huawei";
  if (/\bvivo\b/.test(s)) return "Vivo";
  if (/\bnokia\b/.test(s)) return "Nokia";
  if (/\bmotorola|moto \b/.test(s)) return "Motorola";
  if (/\boneplus\b/.test(s)) return "OnePlus";
  if (/\bhonor\b/.test(s)) return "Honor";
  if (/\bgoogle|pixel\b/.test(s)) return "Google";
  if (/\biphone|ipad|apple watch|airpods|\bapple\b/.test(s)) return "Apple";
  if (/\binfinix\b/.test(s)) return "Infinix";
  return null;
}
function deriveType(t) {
  const s = t.toLowerCase();
  if (/screen protector|tempered|glass protector/.test(s)) return "Screen Protectors";
  if (/lcd|oled|amoled|display|digitizer|\bscreen\b/.test(s)) return "LCD";
  if (/batter/.test(s)) return "Batteries";
  if (/power\s?bank/.test(s)) return "Power Banks";
  if (/car charger/.test(s)) return "Car Chargers";
  if (/charger|charging/.test(s)) return "Chargers";
  if (/\bcable\b|aux/.test(s)) return "Cables";
  if (/\bcase\b|cover/.test(s)) return "Cases";
  if (/holder|mount|stand/.test(s)) return "Holders";
  if (/headphone|earphone|earbud|speaker|\baudio\b/.test(s)) return "Audio";
  if (/adapter|adaptor/.test(s)) return "Adptors";
  if (/flex|camera|sim tray|back glass|charging port|microphone|loud speaker|earpiece|button|part/.test(s)) return "Parts";
  return null;
}

async function main() {
  console.log(LIVE ? "=== LIVE RUN ===" : "=== DRY RUN (no writes) ===");
  let after = null, scanned = 0, missing = 0, planned = 0;
  const brandDist = {}, typeDist = {};
  const samples = [];
  const ops = []; // {ownerId, brand, type}

  for (let page = 0; page < 60; page++) {
    const data = await gql(
      `query($after:String){ products(first:100, after:$after, sortKey:CREATED_AT){ pageInfo{hasNextPage endCursor} edges{ node{ id title brand: metafield(namespace:"custom",key:"brand"){value} ptype: metafield(namespace:"custom",key:"product_type"){value} } } } }`,
      { after }
    );
    for (const { node } of data.products.edges) {
      scanned++;
      const hasBrand = node.brand?.value;
      const hasType = node.ptype?.value;
      if (hasBrand && hasType) continue;
      missing++;
      const brand = hasBrand ? null : deriveBrand(node.title);
      const type = hasType ? null : deriveType(node.title);
      if (!brand && !type) continue;
      planned++;
      if (brand) brandDist[brand] = (brandDist[brand] || 0) + 1;
      if (type) typeDist[type] = (typeDist[type] || 0) + 1;
      if (samples.length < 40) samples.push(`${(brand||hasBrand||"?").padEnd(9)} ${(type||hasType||"?").padEnd(16)} | ${node.title.slice(0, 70)}`);
      ops.push({ ownerId: node.id, brand, type });
    }
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }

  console.log(`Scanned ${scanned} products. Missing brand/type: ${missing}. Will enrich: ${planned}.`);
  console.log("Brand distribution:", brandDist);
  console.log("Type distribution:", typeDist);
  console.log("\nSamples (brand | type | title):");
  samples.forEach((s) => console.log("  " + s));

  if (!LIVE) { console.log("\nDry run only. Re-run with --live to apply."); return; }

  // Apply in batches of 25 metafields
  const mfs = [];
  for (const op of ops) {
    if (op.brand) mfs.push({ ownerId: op.ownerId, namespace: "custom", key: "brand", type: "single_line_text_field", value: op.brand });
    if (op.type) mfs.push({ ownerId: op.ownerId, namespace: "custom", key: "product_type", type: "single_line_text_field", value: op.type });
  }
  let ok = 0, fail = 0;
  for (let i = 0; i < mfs.length; i += 25) {
    const batch = mfs.slice(i, i + 25);
    const d = await gql(`mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ metafields{id} userErrors{field message} } }`, { m: batch });
    const errs = d.metafieldsSet.userErrors;
    ok += d.metafieldsSet.metafields.length;
    if (errs.length) { fail += errs.length; console.log("errors:", JSON.stringify(errs.slice(0, 3))); }
    process.stdout.write(`\rApplied ${ok} metafields...`);
  }
  console.log(`\nDone. Set ${ok} metafields, ${fail} errors.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
