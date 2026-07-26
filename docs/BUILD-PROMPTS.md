# Build Prompts — rebuild this system for another business

A prompt library. Prompt 0 sets the context and you keep it in the conversation. Then run
prompts 1 → 20 in order; each one builds on the last, and each ends with acceptance criteria
so you can tell whether the agent actually finished.

Read [`SITE-BLUEPRINT.md`](./SITE-BLUEPRINT.md) first — the prompts assume you know what
you're asking for.

**How to use these:** copy a prompt verbatim, replace anything in `{{CURLY BRACES}}`, and give
it to your coding agent one at a time. Don't paste all twenty at once; each phase needs to
compile and be checked before the next.

---

## Prompt 0 — Project context (keep this at the top of every session)

```
I'm building a two-sided commerce system for {{BUSINESS NAME}}, a {{BUSINESS TYPE, e.g.
"wholesale auto-parts supplier"}} in {{COUNTRY}}. Two halves:

1. A public trade storefront where anyone can browse but prices are hidden until a customer
   logs in with a trade access code.
2. A staff back-office portal: point-of-sale billing, invoicing, customer payment ledger,
   inventory, reports, staff accounts with per-feature permissions.

Stack:
- Next.js (App Router, latest), React, TypeScript
- Tailwind CSS v4, theme via CSS custom properties, light + dark mode
- NextAuth v5 — Google OAuth plus owner-issued email/password credentials
- Shopify Admin GraphQL API as the datastore; anything Shopify can't model goes in shop
  metafields under a "portal" namespace
- jsPDF + jspdf-autotable for documents, ExcelJS for spreadsheets
- Deployed on Vercel

Business details:
- Currency {{GBP}}, tax {{VAT 20%}}
- Invoice prefix {{ABC}} → ABC-2026-0001
- Owner email(s): {{owner@example.com}}
- Price tiers I need: {{wholesale, in-shop, eBay, Amazon}}
- Product categories: {{list them}}

Conventions to follow in every file:
- Route groups (shop) and (app) so the storefront and portal have separate layouts.
- All Shopify access goes through helpers in lib/ — pages and API routes never call the
  Shopify API directly.
- Every API route that mutates data checks permissions as its first statement. Never rely on
  middleware alone.
- Error messages are written for shop staff, not developers.
- Comments explain constraints, not what the next line does.

Before writing code, read the framework docs in node_modules/next/dist/docs/ — this Next
version may differ from what you know.

Acknowledge and wait for my first build prompt.
```

---

## Phase 1 — Foundation

### Prompt 1 — Scaffold and theme

```
Scaffold the project.

1. Create the Next.js app with TypeScript, Tailwind v4, App Router, and the src-less layout
   (app/ at the root).
2. In app/globals.css define a theme with CSS custom properties on :root and .dark:
   --bg, --surface, --subtle, --ink, --muted, --line, --accent, --accentfg.
   Use {{ACCENT COLOUR}} as the accent. Map them to Tailwind v4 @theme tokens so I can write
   text-ink, bg-surface, border-line, bg-accent.
3. Build a ThemeToggle component — light/dark/system, persisted to localStorage, applied
   before first paint so there's no flash.
4. Create lib/business.ts exporting a BUSINESS constant (name, tagline, address lines, email,
   phone, website, tax number, bank details) read from NEXT_PUBLIC_BIZ_* env vars with
   sensible defaults, plus an async loadBusiness() that fetches live values from /api/settings
   and caches them in module memory.
5. app/page.tsx redirects to /shop.

Acceptance: `npm run build` passes, dark mode toggles with no flash, no hardcoded colours
outside globals.css.
```

### Prompt 2 — Shopify data layer

```
Build the data layer. Everything talks to Shopify through this file.

Create lib/shopify.ts:
- Read SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_TOKEN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET,
  SHOPIFY_API_VERSION from env.
- Support both auth modes: a static shpat_ token, or client-credentials OAuth with the token
  cached in module memory until 60s before expiry.
- Export shopifyConfigured() so the UI can show a "connect Shopify" state instead of crashing.
- Export adminGraphQL<T>(query, variables) that throws a typed ShopifyError with a readable
  message on HTTP failure or GraphQL userErrors.
- Also export getLocations() and setAvailable() for inventory writes.

Then create lib/settings.ts — portal settings stored as JSON in the shop metafield
portal.settings, with a DEFAULT_SETTINGS object covering: business name, tagline, address,
email, phone, website, tax number, bank details, invoice footer, invoice prefix, tax rate,
low-stock threshold, favicon URL.

Critically: store API secrets in a SEPARATE metafield portal.integrations, and never return
them to the browser. A blank incoming value means "keep the stored secret unchanged" — the
UI must never echo a secret back.

Add nextInvoiceNumber(): reads and increments a counter in portal.invoice_counter and returns
PREFIX-YYYY-0001.

Acceptance: every function is typed, no `any`, ShopifyError messages are readable by a
non-developer, secrets cannot leak through the settings endpoint.
```

### Prompt 3 — Auth, roles and permissions

```
Build authentication with three-layer permission enforcement.

Define nine feature permissions in lib/permissions.ts (client-safe, no server imports):
inventory, billing, invoices, orders, customers, collections, reports, settings, users —
each with a key, label and one-line description. Export ALL_PERMS and
DEFAULT_MEMBER_PERMS (a sensible starting set for a new hire).

lib/portal-users.ts — staff accounts in the shop metafield portal.users:
- Owner emails come from PORTAL_OWNER_EMAIL (comma-separated), always have every permission,
  and cannot be edited or removed as members.
- Members: email, name, phone, role, addedAt, scrypt password hash, permissions array.
- Hash with scrypt + random salt; verify with timingSafeEqual.
- A PublicUser type that omits the hash — this is the only shape the browser ever sees.

auth.config.ts must be EDGE-SAFE: Google provider, no Node or Shopify imports, and a session
callback that only reshapes the already-decoded JWT.
auth.ts is the full Node config: adds a Credentials provider verifying email + password, a
signIn callback allowing only the owner and invited teammates, and a jwt callback that bakes
role and permissions into the token at sign-in so edge middleware never calls Shopify.

middleware.ts:
- PUBLIC_PREFIXES: /login, /api/login, /api/auth, /api/me, /shop, /api/shop, /api/cron,
  /api/public, /no-access. "/" is public too.
- Everything else requires auth; unauthenticated users redirect to /login?from=<path>.
- A GATE array mapping portal URL prefixes to required permissions; a member lacking one
  redirects to /no-access?feature=<perm>.
- Set an x-pathname request header so server components can read the current path.

lib/guard.ts for API routes: isOwnerRequest(), canSeeFinanceRequest(), requirePermission(),
requireAnyPermission() — each returning null when allowed or a 401/403 NextResponse.

Also support a master-password fallback: a PORTAL_SESSION_SECRET cookie that grants owner
access, for emergency admin entry.

Acceptance: a member without the billing permission is blocked at the middleware AND gets a
403 if they call the billing API directly. Password hashes never reach the browser.
```

### Prompt 4 — Portal shell and navigation

```
Build the portal chrome.

lib/nav.ts (client-safe): a NAV array of items with href, label, SVG path icon, required
permission, a `primary` flag for the mobile bar, and a group key. Groups in order: Overview,
Sell, Catalog, Admin. Export groupedNav() and visibleNav(items, me) which filters by
permission (owner sees everything).

Components:
- Sidebar — desktop only, grouped, active-route highlighting, business logo mark at the top.
- MobileNav — floating bottom bar showing `primary` items plus a "More" sheet for the rest.
- AppHeader — current page title derived from the pathname, theme toggle, user menu.
- AppFooter — business name and year.

app/(app)/layout.tsx composes these with a fixed-height flex layout: sidebar left, header on
top, scrollable content, mobile nav floating. Content area needs bottom padding on mobile to
clear the nav bar, removed at md+.

lib/use-me.ts — a useMe() hook fetching /api/me, plus useIsOwner() and useCanSeeFinance().
useCanSeeFinance is important: regular staff must NOT see all-time sales totals, only
outstanding balances and today's collection. Owner or the `reports` permission unlocks it.

Also build /login (Google button + email/password form + master password) and /no-access
(explains which feature was blocked and tells the user to ask the owner).

Acceptance: nav items disappear for users lacking the permission; mobile nav is thumb-reachable;
a member without `reports` never sees a total-sales figure anywhere.
```

---

## Phase 2 — Catalog

### Prompt 5 — Multi-tier pricing model

```
Build multi-tier pricing. One product carries five prices.

lib/pricing.ts (client-safe — the POS, product editor and Excel import all share it):
- Base variant price = standard retail.
- Four tiers stored as product metafields: {{wholesale → custom.wholesale_price,
  in-shop → custom.price_shop, eBay → custom.price_ebay, Amazon → custom.price_amazon}}.
- A blank tier falls back to the base price.
- Export PRICE_TIERS (key, label, short label for table headers, metafield key, description),
  a TierPrices type, tierNum() to parse a stored value into a positive number or null,
  tierForContext({wholesale, segment}) and priceForContext(base, tiers, context).

lib/segments.ts (client-safe): where a customer or order came from — {{online, shop, ebay,
amazon}} — stored as Shopify tags `seg:<key>`. Each segment has a key, full label, short badge
label, tag, description and Tailwind badge classes. Export segmentsFromTags(),
tagsForSegments(), isSegmentTag().

lib/channels.ts (client-safe): marketplace routing via `channel:<key>` tags —
{{Online Store, eBay ×2, Amazon ×2}}.

Acceptance: switching sale context re-prices correctly, and a product with no tier values still
prices at base everywhere.
```

### Prompt 6 — Inventory

```
Build /portal/inventory — the busiest page in the app.

lib/products.ts: a ProductRecord type and helpers to list products (paginated, searchable),
plus bulk operations: bulkSetStatus, bulkDelete, bulkSetPrice, bulkSetStock,
bulkAddToCollection, bulkSetChannels.

components/ColumnChooser.tsx: a reusable ⋯ Columns menu with a useColumns(key, defs, hidden)
hook persisting visibility to localStorage, and a useSort() hook. Columns can be `locked` so
they can't be hidden.

The page:
- Table columns: Product (locked), SKU, Price, the four tier prices (hidden by default),
  stock status, channels, Available (locked).
- Debounced search over title and SKU, "load more" pagination.
- Filters: all / low stock / out of stock, using the configurable low-stock threshold.
- Inline editing of stock and price — optimistic update, revert on failure.
- Multi-select with a bulk action bar: activate, draft, delete, set price, set stock, add to
  collection, set channels, assign barcodes.
- Row link through to the product editor.

API: /api/products (list), /api/products/[id], /api/products/bulk (one route, action-switched,
maxDuration 300), /api/products/search, /api/inventory, /api/locations, /api/stats.
Every one starts with a permission check.

Acceptance: bulk-editing 50 products doesn't time out; hidden columns stay hidden after reload;
inline edits that fail server-side visibly revert.
```

### Prompt 7 — Product create and edit

```
Build /portal/products/new and /portal/products/[id]/edit.

lib/product-edit.ts: an EditProduct type covering every field, a PRODUCT_TYPE_CHOICES list
({{your categories}}), loadProduct(), updateProduct(), and image add/remove/reorder.

Both pages share one form covering: title, description (rich text), status (active/draft),
vendor, brand, model (multi-value), product type, tags, SKU, barcode, base price, compare-at
price, all four tier prices, stock quantity per location, images with drag-to-reorder,
collection membership, and channel assignment.

Add a "generate barcode" button that fills the barcode field from the SKU or an internal code.

Acceptance: creating and editing use the same component; every field round-trips through
Shopify without loss; images upload with a visible progress state.
```

### Prompt 8 — Collections

```
Build /portal/collections and /portal/collections/[id].

lib/collections.ts: CollectionDetail with title, handle, description HTML, image, smart-vs-manual
flag, product count, smart rules, and a paginated product list.

List page: grid of collection cards with image, title and product count; create a collection;
an "auto-organise" action that groups uncategorised products by product type into collections.

Detail page: rename, edit description, change image, view and remove products, add products via
a search picker, and view smart-collection rules read-only.

API: /api/collections, /api/collections/[id], /api/collections/organize.

Acceptance: adding 100 products to a collection completes in one request; smart collections are
clearly marked as rule-driven and not manually editable.
```

### Prompt 9 — Excel import/export

```
Build /portal/import-export using ExcelJS.

Define EXPORT_COLUMNS in lib/products.ts — an ordered array of {key, header, width} covering:
handle (blank for new), title, brand, model, type, vendor, tags, SKU, barcode, price,
compare-at, all four tier prices, stock, status, image URL, collections.

Three actions:
1. Export the full catalog to .xlsx with styled headers and frozen top row.
2. Download a blank template with the same columns and one example row.
3. Upload a filled sheet: rows with a handle UPDATE, rows without CREATE. Return a per-row
   result — title, ok/failed, action taken, error message — and render it as a table with
   created/updated/failed counts.

API: /api/export, /api/template, /api/import (multipart, maxDuration 300).

Acceptance: exporting then re-importing the same file changes nothing. A malformed row fails
alone without aborting the whole import.
```

---

## Phase 3 — Selling

### Prompt 10 — Point of sale

```
Build /portal/billing — the counter till. This page must be fast and keyboard-driven.

lib/billing.ts:
- searchVariants(q) returning variant hits with product title, variant title, SKU, price,
  image, available stock and all tier prices.
- A BillLine type that is either a catalog variant or a custom manual item (title + price).
- createBill() building a Shopify draft order: line items with price overrides, tax on/off,
  customer attachment or a walk-in name/phone, staff attribution, segment tag, and a generated
  invoice number.
- completeInvoice() converting a draft to a real paid order and decrementing stock.

The page:
- Search box, debounced, focused on load. Enter adds the top hit.
- A camera barcode scan button.
- Cart lines: quantity stepper, editable unit price, remove, running subtotal.
- "Add custom item" for anything not in the catalog.
- A Source selector ({{online / shop / eBay / Amazon}}) that RE-PRICES every catalog line to
  the matching tier when changed — this is the point of the whole tier system.
- Customer: search registered customers, or type a walk-in name and phone.
- Tax toggle, discount, notes.
- An invoice preview modal before committing.
- "Take payment" with a method picker (cash / card / bank transfer / on account) and support
  for partial payment.
- After completion: buttons to print, download PDF, email, and WhatsApp the invoice.

Acceptance: a full sale is completable with keyboard only. Switching Source re-prices the cart
instantly. Stock decrements exactly once.
```

### Prompt 11 — Barcode scanning and label printing

```
Add barcodes.

components/BarcodeScanner.tsx — a modal camera scanner using @zxing/browser's
BrowserMultiFormatReader. Rear camera preferred, de-duplicate repeat reads within ~1.5s, call
onDetected(code) per scan and let the parent decide whether to keep scanning. Handle
permission-denied and no-camera with clear messages. Stop all tracks on unmount.

lib/barcodes.ts (server): assignBarcodes(productIds, {overwrite}) filling empty variant barcode
fields from the SKU or a generated internal code; lookupByCode(code) matching a scanned value
against barcode OR SKU exactly.

lib/barcode-labels.ts (client) using jsbarcode: printBarcodeLabels(items, options) rendering
Code128 labels with barcode, product name, price and SKU, then opening a print window with
exact mm page geometry. Four presets: A4 38×21mm (65/page), A4 63.5×34mm (24/page), thermal
50×25mm, thermal 57×32mm. Options: copies per item, and toggles for name, price and SKU.

Wire scanning into the POS (scan adds to cart) and inventory (scan jumps to the product), and
label printing into the inventory bulk bar.

API: /api/barcodes/lookup.

Acceptance: labels print at true physical size — measure one with a ruler. Scanning the same
barcode twice quickly adds one line, not two.
```

### Prompt 12 — Invoice list and editor

```
Build /portal/invoices and /portal/invoices/[id].

List page: invoice number, customer, source segment badge, staff, status, date, total. Column
chooser and sortable headers. Filters by status, segment and date range. Actions: open, export
CSV, generate a multi-invoice report PDF, generate per-customer day statements, and download a
ZIP of today's per-customer reports.

Detail page — full editor for unpaid invoices:
- Add lines by product search or as custom items; edit quantity, unit price and title; remove.
- Attach or change the customer.
- A payments panel: record a payment (amount, method, note), a "pay balance" shortcut, a
  payment history list, and revoke.
- Actions: save, mark paid, duplicate, void/undo-paid, email, download PDF, delete.
- Paid invoices become read-only except for payments and void.

API: /api/billing (list), /api/billing/[id] (get/update/delete), /api/billing/[id]/action
(complete / duplicate / void / payment / revoke-payment), /api/billing/export,
/api/billing/report.

Acceptance: editing an invoice never changes its invoice number. Voiding restores stock.
Revoking a payment updates both the invoice balance and the customer ledger.
```

### Prompt 13 — Customers and the payment ledger

```
Build /portal/customers and /portal/customers/[id]. The ledger is the heart of this page.

lib/customers.ts: CustomerSummary and CustomerDetail types. The ledger — payments (date,
amount, method, note) plus an optional credit limit — is stored in the customer metafield
portal.ledger. Customers also carry an opening balance so an existing book of debt can be
migrated on day one.

List page: name, segment badges, company, contact, invoice count, order count, total spent.
Column chooser, sorting, search, segment filter, quick-add form (with a country dial-code
picker for phone). A "today's customers" panel showing who was billed today with their
itemised bills, today's total, today's paid and outstanding.

Detail page:
- Stat row: total billed, total paid, outstanding.
- Invoice history with per-invoice paid and balance.
- Payment ledger: record, edit and revoke payments, filterable by method.
- Segment editor, profile editor, opening balance.
- A trade access code generator (with copy button) — this is what the customer uses to log into
  the storefront and see wholesale prices.
- Documents: full statement PDF, outstanding-balance demand PDF, today's itemised day
  statement, and send-by-email/WhatsApp.

API: /api/customers, /api/customers/[id], /api/customers/bulk, /api/customers/[id]/today,
/api/customers/[id]/export.

Acceptance: outstanding = opening balance + invoiced − paid, and matches on both the list and
detail pages. Revoking a payment is reflected everywhere immediately.
```

### Prompt 14 — Orders

```
Build /portal/orders and /portal/orders/[id] for real completed orders from every channel.

lib/orders.ts: an OrderRow with name, customer, date, total, currency, financial status,
fulfilment status, item count, source and derived segment. Derive the segment from tags first,
falling back to the order's source channel (pos → shop, web/draft → online, etc.).

List: filter by segment, financial status and fulfilment status; search; CSV export.
Detail: line items, customer, addresses, payment and fulfilment status, and actions to fulfil
or refund.

API: /api/orders, /api/orders/[id], /api/orders/action, /api/orders/export.

Acceptance: an order placed through the storefront appears here with the right segment badge.
```

---

## Phase 4 — Documents and delivery

### Prompt 15 — PDF generation

```
Build the document layer with jsPDF + jspdf-autotable. Every generator must be UNIVERSAL — no
window, document or browser APIs — so it can render server-side for public share links.

Shared palette: ink #1a1a1a, muted #6b655c, accent {{#a9791d}}, hairline #e2ddd3, light fill
#f5f3ee, green #1a7f4b, red #b3261e. White background, no dark header bands — these get printed
on cheap printers.

lib/invoice-pdf.ts — A4 invoice: business header with logo, invoice number and date, bill-to
block, line-item table, subtotal / tax / total, amount paid and balance with a PAID or
OUTSTANDING stamp, payment instructions and footer from settings.

lib/statement-pdf.ts — customer statement: all invoices, all payments, and a running balance.

lib/report-pdf.ts — three builders:
- buildInvoicesReportDoc(rows, opts): a filtered multi-invoice business report with totals
  broken down by segment and payment method.
- buildCustomerDayDoc(customer, invoices, opts): one customer's bills for one day.
- buildCustomerDayItemisedDoc(...): the same but line-level.

lib/customer-zip.ts (client) using JSZip: bundle every customer's day report into one ZIP,
each file named after the customer, grouped strictly by customer so bills never mix.

Each generator exports both a build (returns the jsPDF doc) and a download variant, so the
preview modal can show a doc before saving it. Add components/PdfPreviewModal.tsx and
components/InvoicePreviewModal.tsx.

Acceptance: a 200-line invoice paginates with repeated table headers. The same code produces
byte-identical output on server and client.
```

### Prompt 16 — Public share links

```
Let customers open their invoice without an account — safely.

lib/invoice-link.ts: the draft-order ID is sequential and guessable, so a share link MUST carry
an HMAC token. signInvoiceToken(id) = HMAC-SHA256 of `inv:<id>` with PORTAL_SESSION_SECRET;
verifyInvoiceToken() compares with timingSafeEqual. Same pattern for day statements, keyed on
`stmt:<id>:<date>`. Export invoiceSharePath() and statementSharePath() returning relative paths
with the token as ?t=.

Routes /api/public/invoice/[id] and /api/public/statement/[id]: verify the token, refuse with
404 (not 403 — don't confirm the ID exists) if it's wrong or missing, otherwise render the PDF
server-side and return it with an inline Content-Disposition so it opens in the browser.

These two paths must be in the middleware's public prefix list.

Acceptance: changing one character of the token gives a 404. Incrementing the ID without a
matching token gives a 404.
```

### Prompt 17 — Email and WhatsApp

```
Add messaging.

lib/email.ts — Resend. sendEmail({to, subject, html, attachments}) with base64 attachments,
plus emailConfigured() so the UI can hide send buttons when it isn't set up. From address from
EMAIL_FROM.

lib/whatsapp.ts — WhatsApp Cloud API (Meta Graph). Credentials come from the SECURED
portal.integrations metafield, never from the settings endpoint. normalizePhone() does
best-effort E.164 (strip non-digits, handle +, 00 and leading-0 with {{COUNTRY CODE}} as the
default). sendWhatsApp(to, message) sends via an approved template when one is configured
(business-initiated messages outside the 24h window require it) and falls back to plain text
otherwise. waConfigured() gates the UI.

API: /api/email/invoice (attaches the PDF), /api/whatsapp/send, /api/settings/whatsapp
(save credentials; blank token means keep existing).

Acceptance: the WhatsApp token is not present in any response body reachable by a staff account.
Send buttons are hidden, not broken, when credentials are missing.
```

### Prompt 18 — Daily digest and scheduled jobs

```
Build the end-of-day automation.

lib/digest.ts — runDailyDigest({force}):
1. Read settings; skip if the digest is disabled, or if digestLastRun already equals today
   (idempotency — cron can fire twice).
2. Load today's invoices and group them STRICTLY by customer account. One customer's bills must
   never appear in another's message. Walk-in sales with no account feed only the owner report.
3. Each customer with an account gets their day summary — bills, today's total, total
   outstanding, and a signed statement link — by email and WhatsApp.
4. The owner gets an all-customers summary at digestOwnerEmail and optionally by WhatsApp.
5. Write digestLastRun and return counts plus a per-recipient error list. One failed recipient
   must never abort the rest.

/api/cron/daily-digest: authorised by a CRON_SECRET Bearer token, or the vercel-cron
user-agent when no secret is set, or an authenticated owner clicking "send now". Also
auto-tap-out any staff still clocked in. runtime nodejs, maxDuration 300.

vercel.json: schedule it at {{20:30 UTC}}.

components/TodaySendDrawer.tsx — a manual slide-over listing today's customers with today's
total, paid, outstanding and account outstanding. Per customer: preview the itemised day PDF,
send by email, send by WhatsApp, copy the share link. Track already-sent state per customer per
day in localStorage so staff can work down the list without double-sending.

Acceptance: running the cron twice in one day sends once. A customer with two invoices gets one
message containing both, and nobody else's.
```

---

## Phase 5 — Storefront and admin

### Prompt 19 — Price-gated trade storefront

```
Build the public storefront under the (shop) route group, with its own layout — completely
separate chrome from the portal.

lib/trade.ts — the trade session: signTrade(customerId) produces
base64url(customerId).HMAC-SHA256, stored in an mi_trade cookie (httpOnly, secure, sameSite
lax). verifyTradeValue() uses timingSafeEqual. getTradeCustomerId() reads it in server
components and route handlers.

lib/storefront.ts — read-only catalog helpers: featured products, collections with parent/child
nesting, product by handle, search. Each product card carries its wholesale price so the trade
tier can be swapped in.

12 pages:
- /shop — hero, category grid, featured products
- /shop/all — paginated catalog
- /shop/collections — all collections, nested
- /shop/c/[handle] — collection page with a category sidebar
- /shop/p/[handle] — gallery, variant picker, add to cart
- /shop/search — live search
- /shop/about, /shop/contact — marketing pages
- /shop/register — wholesale account application, creates a pending customer, sends the owner
  a notification
- /shop/trade-login — email + trade access code, sets the cookie
- /shop/account — profile editing, order history, outstanding balance, log out
- /shop/checkout — cart review, payment method (cash on collection / bank transfer / on
  account), places a real invoice against the trade account

THE PRICE GATE is the defining feature. Visitors browse freely but every price and buy button
is replaced by a lock. Build components/shop/PriceLock.tsx with three variants: PriceLockInline
("🔒 Log in to see price") for cards, PriceLockButton ("🔒 Log in to buy"), and PriceLockPanel
(a full explainer with Log in / Register buttons) for the product page. Logged-in trade
customers see wholesale prices plus a green TradeBar across the top confirming trade pricing
is active.

components/shop/cart.tsx — a context-based cart persisted to localStorage, with a slide-over
drawer and animated add-to-cart feedback.

API: /api/shop/register, /api/shop/trade-login, /api/shop/trade-logout, /api/shop/me,
/api/shop/account, /api/shop/search, /api/shop/trade-checkout.

Acceptance: view source as a logged-out visitor — no price appears anywhere in the HTML, not
just hidden with CSS. Checkout is impossible without a valid trade cookie.
```

### Prompt 20 — Settings, team, dashboard and backup

```
Finish the admin surface.

/portal/settings — sectioned form:
- Business details for invoices (name, tagline, address, email, phone, website, tax number,
  bank details, invoice footer).
- Invoice prefix, tax rate, low-stock threshold, custom favicon URL (with a FaviconManager
  component that applies it at runtime).
- Daily digest: master toggle, send-to-customers toggle, send-to-owner toggle, owner email,
  owner WhatsApp number, and a "send now" button.
- WhatsApp credentials (token, phone number ID, template name) — write-only, never echoed back.
- The hour after which the header's "today's reports" button appears.
- Staff shift log with computed minutes per shift.
- Owner-only: download a full JSON backup.

/portal/users — team management: invite by email, set or reset a password, per-feature
permission checkboxes with descriptions, remove a member, and a per-staff sales performance
table (invoice count, total, paid, open). Owners are listed but not editable.

/portal — dashboard: today's takings (paid today and total outstanding — visible to all staff
since it's today-only, not all-time), total products, low stock, out of stock, collections, and
quick links to the POS and the invoice list.

/portal/channels — a marketplace connection board for {{Online Store, eBay ×2, Amazon ×2}}
with connected/not-connected state and setup instructions.

/api/backup — owner only. A single JSON snapshot of settings, integrations, products,
collections, customers WITH their full ledgers and opening balances, and invoices. This matters
because ledgers live only in metafields and are not part of a normal Shopify export — without
this they're unrecoverable.

Acceptance: settings changes appear on the next generated invoice PDF. A member without the
`users` permission cannot reach /portal/users by URL. The backup round-trips every ledger.
```

---

## Optional — the staff time clock

```
Add an optional staff time clock, off by default behind ENABLE_TAPIN=1 plus an owner
requireTapIn setting.

lib/attendance.ts — records {email, name, tapIn ISO, tapOut ISO, autoOut} in the shop metafield
portal.attendance, capped at 2000 entries. Functions: readAttendance, tapIn (verifies the
user's password), tapOut, openRecord(list, email), autoTapOutAll() for the cron job.

/portal/tap-in — a single centred card: "Tap in to start your shift", password field, tap-in
button. On success, redirect back to the page the user was heading for.

The portal layout checks the flag and redirects to /portal/tap-in when a staff member hasn't
tapped in today. Cache the requireTapIn setting with unstable_cache (60s revalidate) so this
doesn't hit Shopify on every page load — that lookup on every navigation is a real performance
trap.

AppHeader gets a tap-out button when the user is clocked in. The cron job auto-taps-out everyone
still open at {{21:30}}.

Acceptance: the gate adds no measurable latency to portal navigation. A staff member cannot tap
in with someone else's account.
```

---

## Adapting to a different industry

Most of this is a **trade-counter operating system** and transfers unchanged. What varies is
catalog vocabulary and which price tiers you keep.

| Business | Drop | Add |
| --- | --- | --- |
| Builders' merchant, auto parts | nothing | delivery/fitting line types |
| Pharmacy or grocery wholesale | eBay/Amazon tiers | batch numbers and expiry dates |
| Restaurant supply | the browse storefront | standing weekly orders, delivery routes |
| Salon, garage, clinic | channels, Excel import, storefront | services instead of products, a booking calendar |
| Fashion wholesale | nothing | size/colour matrix ordering, seasonal line sheets |

Two things to keep no matter what you're building:

1. **Three-layer permission enforcement** — middleware, API guard, and nav filter. Dropping the
   API guard because middleware "already handles it" is the single most common way this kind of
   app leaks data.
2. **HMAC on every public link.** Any resource identified by a sequential ID and shared by URL
   needs a signature, or it's enumerable.
