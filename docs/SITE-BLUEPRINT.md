# Site Blueprint — what this system actually is

A reusable description of every page, feature and moving part in this codebase, written so
the same system can be rebuilt for a different business. Pair it with
[`BUILD-PROMPTS.md`](./BUILD-PROMPTS.md), which turns each section below into a prompt you
can hand to an AI coding agent.

---

## 1. The one-paragraph summary

This is a **two-sided commerce system**. One half is a **public trade storefront** where prices
are hidden until a customer logs in with an access code. The other half is a **staff back-office
portal** — point-of-sale billing, invoicing, a customer payment ledger, inventory with multi-tier
pricing, barcode scanning and label printing, PDF invoices and reports, WhatsApp and email
delivery, staff accounts with per-feature permissions, and a time clock. Shopify is used as the
database and product engine; everything custom lives in Shopify metafields.

## 2. Stack and the one architectural decision that matters

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, server components) |
| Styling | Tailwind CSS v4, CSS custom-property theme tokens, light/dark |
| Auth | NextAuth v5 (Google OAuth + credentials), JWT sessions, edge middleware |
| Data | Shopify Admin GraphQL API — **no separate database** |
| PDFs | jsPDF + jspdf-autotable (works on both server and client) |
| Excel | ExcelJS (catalog import/export) |
| Barcodes | @zxing/browser (camera scanning), jsbarcode (label printing) |
| Messaging | Resend (email), WhatsApp Cloud API (Meta Graph) |
| Scheduling | Vercel Cron |
| Hosting | Vercel |

**The decision that shapes everything: Shopify is the database.** Products, variants, stock,
collections, customers and draft orders are all native Shopify objects. Everything Shopify
does not model — portal settings, staff accounts and password hashes, customer payment
ledgers, opening balances, attendance records, invoice counters, API secrets — is stored as
JSON in **shop metafields** under the `portal` namespace.

That gives you zero database ops and a real e-commerce engine for free. It costs you query
speed (every page hit is an API round trip, hence the caching in the layout) and it makes
Shopify a hard dependency. If you rebuild for a business that isn't retail, swap this layer for
Postgres + Prisma and keep everything else — the rest of the app only talks to the `lib/*`
helpers, not to Shopify directly.

### Where custom data lives

| Metafield | Contents |
| --- | --- |
| `shop.portal.settings` | Business details, VAT rate, invoice prefix, digest config, feature flags |
| `shop.portal.integrations` | WhatsApp token + phone ID (never returned to the browser) |
| `shop.portal.users` | Staff accounts: email, name, role, scrypt password hash, permissions |
| `shop.portal.attendance` | Time-clock records (capped at 2000 entries) |
| `shop.portal.invoice_counter` | Sequential invoice numbering |
| `customer.portal.ledger` | Payments taken against a customer + credit limit |
| `product.custom.wholesale_price` / `price_shop` / `price_ebay` / `price_amazon` | The four channel price tiers |
| Tags `seg:*`, `channel:*` | Customer/order segments and marketplace routing |

---

## 3. Page inventory

33 pages across three zones. Route groups `(shop)` and `(app)` give the storefront and the
portal completely separate layouts.

### 3.1 Root

| Route | Access | What it does |
| --- | --- | --- |
| `/` | Public | Redirects to `/shop` — the storefront is the site homepage |
| `/login` | Public | Portal sign-in: Google OAuth, or owner-issued email + password, or a master password fallback |
| `/no-access` | Signed in | Friendly "you don't have permission for X" page; tells the user to ask the owner |

### 3.2 Storefront — `(shop)` group, 12 pages

The whole storefront is **price-gated**: visitors browse freely but see "🔒 Log in to see price"
instead of prices and buy buttons. Logging in with a trade code sets a signed cookie, swaps
every price for the wholesale tier, and shows a green "Trade pricing active" bar.

| Route | What it does |
| --- | --- |
| `/shop` | Hero, "shop by category" grid, featured products |
| `/shop/all` | Full catalog, paginated |
| `/shop/collections` | All collections, with parent/child nesting |
| `/shop/c/[handle]` | Collection page + category sidebar |
| `/shop/p/[handle]` | Product page: image gallery, variant picker, add to cart, or the trade-lock panel |
| `/shop/search` | Live product search |
| `/shop/about` | Static marketing copy |
| `/shop/contact` | Contact details and form |
| `/shop/register` | Wholesale account application — creates a pending Shopify customer |
| `/shop/trade-login` | Email + trade access code → signed `mi_trade` cookie |
| `/shop/account` | Trade customer's own area: profile editing, order history, outstanding balance |
| `/shop/checkout` | Cart review, payment method (cash on collection / bank transfer / on account), places a real invoice |

Storefront components worth naming: a localStorage cart with a slide-over drawer
(`components/shop/cart.tsx`), `PriceLock` (the three lock states), `TradeBar`,
`CategorySidebar`, `CollectionBrowser`, `ProductGallery`, `ShopSearch`.

### 3.3 Staff portal — `(app)` group, 18 pages

Sidebar on desktop, floating bottom nav on mobile, grouped into Overview / Sell / Catalog / Admin.

| Route | Permission | What it does |
| --- | --- | --- |
| `/portal` | any | Dashboard: today's takings (paid + outstanding), product count, low stock, out of stock, collections |
| `/portal/billing` | `billing` | **Point of sale.** Product search or camera barcode scan, cart, per-line price override, custom line items, source selector that auto-reprices to the right tier, walk-in or registered customer, VAT toggle, invoice preview, take payment |
| `/portal/invoices` | `invoices` | Invoice list with column chooser, sorting, segment and status filters, PDF export, multi-invoice business report, per-customer day statements, ZIP of today's reports |
| `/portal/invoices/[id]` | `invoices` | Edit an unpaid invoice line by line, add customers or custom lines, record and revoke payments, mark paid, duplicate, void, email, download PDF, delete |
| `/portal/customers` | `customers` | Customer list with segments, columns, sorting, quick add, "today's customers" panel with itemised bills |
| `/portal/customers/[id]` | `customers` | Full account: totals billed/paid/outstanding, invoice history, **payment ledger** (record, edit, revoke), segment editor, profile editor, opening balance, trade access code generator, statement and outstanding-balance PDFs, day statement send |
| `/portal/orders` | `orders` | Real completed orders from all channels, segment-tagged, exportable |
| `/portal/orders/[id]` | `orders` | Order detail |
| `/portal/inventory` | `inventory` | Product table with hideable columns (including the four price tiers), search, low-stock and out-of-stock filters, inline stock and price editing, multi-select bulk actions (activate, draft, delete, set price, set stock, add to collection, set channels, assign barcodes), barcode label printing in four label formats |
| `/portal/products/new` | `inventory` | Create a product: title, brand, model, type, SKU, barcode, all price tiers, stock, images, collections, channels |
| `/portal/products/[id]/edit` | `inventory` | Full editor for every field plus image management |
| `/portal/collections` | `collections` | Collections list, create, auto-organise |
| `/portal/collections/[id]` | `collections` | Collection detail: rename, description, image, add/remove products, smart-collection rules |
| `/portal/import-export` | `inventory` | Download the catalog as Excel, download a blank template, bulk import (create + update by handle) with a per-row result report |
| `/portal/channels` | any | Marketplace connection board — Online Store, eBay ×2, Amazon ×2 |
| `/portal/settings` | `settings` | Business details for invoices, VAT rate, invoice prefix, low-stock threshold, custom favicon, daily digest config, WhatsApp credentials, report button hour, tap-in toggle, staff shift log, owner backup download |
| `/portal/users` | `users` | Team management: invite by email, set password, per-feature permission checkboxes, remove, plus per-staff sales performance |
| `/portal/tap-in` | any | Shift clock-in screen — re-enter your password to start your shift |

---

## 4. Feature inventory

### 4.1 Authentication and access control

Three ways in: **Google OAuth** (owner and invited teammates only), **owner-issued email +
password** (scrypt-hashed, stored in a metafield), and a **master-password cookie** as an
admin fallback. Owner emails come from `PORTAL_OWNER_EMAIL` and always have full access.

Permissions are nine feature keys — `inventory`, `billing`, `invoices`, `orders`, `customers`,
`collections`, `reports`, `settings`, `users` — enforced in **three places**:

1. **Edge middleware** (`middleware.ts`) gates page routes by URL prefix, redirecting to `/no-access`.
2. **API guards** (`lib/guard.ts`) re-check on every mutating route — never trust the middleware alone.
3. **Nav filtering** (`lib/nav.ts`) hides menu items the user can't use.

Permissions are baked into the JWT at sign-in so edge middleware never has to call Shopify.

There is a fourth, financial gate: **staff see outstanding balances and today's collection, but
not all-time sales totals** unless they hold the `reports` permission (`useCanSeeFinance`).

### 4.2 Multi-tier pricing

One product carries five prices: the base/retail price plus four metafield tiers — wholesale,
in-shop, eBay, Amazon. A blank tier falls back to the base price. The POS "Source" selector
re-prices the whole cart when you switch it, and the storefront shows the wholesale tier to
logged-in trade customers. Segments (`seg:online|shop|ebay|amazon`) tag where a customer or
order came from and drive which tier applies.

### 4.3 Billing, invoices and the payment ledger

Invoices are Shopify **draft orders**; completing one converts it to a real order and decrements
stock. Invoice numbers are sequential from a metafield counter (`MICU-2026-0001`). Payments
are recorded against both the invoice and the customer's ledger, support partial payments,
carry a method and note, and can be edited or revoked. Customers have an **opening balance**
so you can migrate an existing book of debt on day one.

### 4.4 Documents

Six PDF generators, all built on jsPDF and deliberately free of browser APIs so they render on
the server for public share links:

- A4 invoice
- Customer statement (invoices + payments + running balance)
- Customer day statement (one day's bills)
- Itemised customer day statement (line-level)
- Multi-invoice business report (filtered, with totals by segment and payment method)
- Outstanding-balance demand

Plus Excel catalog export/import and a ZIP bundle of every customer's day report.

### 4.5 Sharing without accounts

Public invoice and statement links are **HMAC-signed capability URLs** (`/api/public/invoice/[id]?t=…`).
The draft-order ID is sequential and guessable, so the token is what makes the link safe. This
is what lets you WhatsApp a customer their invoice without them logging in anywhere.

### 4.6 Barcodes

Camera scanning via ZXing in the POS (scan to add to cart) and in inventory. Bulk barcode
assignment fills empty barcode fields from the SKU or generates an internal code. Label
printing renders Code128 labels with name, price and SKU in four formats: A4 65-up, A4 24-up,
and 50×25mm / 57×32mm thermal roll.

### 4.7 Messaging and the daily digest

At 20:30 UTC a Vercel Cron job runs the digest: every wholesale customer billed that day gets
their own statement by email and WhatsApp (grouped strictly by account so bills never mix
between customers), the owner gets an all-customers summary, and any staff still clocked in are
auto-tapped-out. The job is idempotent via a `digestLastRun` date stamp. There is also a manual
"Today's send" drawer for staff to send each customer's day report one at a time, with
already-sent state tracked in localStorage.

WhatsApp credentials live in a separate metafield from the rest of settings so a staff member
reading `/api/settings` can never see the token.

### 4.8 Staff time clock

Optional (`ENABLE_TAPIN=1` plus an owner toggle). Staff re-enter their password after login to
start a shift; the portal layout redirects them to `/portal/tap-in` until they do. Manual tap-out,
automatic tap-out at 21:30, and a shift log with computed minutes on the Settings page.

### 4.9 Owner backup

`/api/backup` produces a single JSON snapshot of settings, integrations, products, collections,
customers with full ledgers, and invoices. This exists because the ledgers and opening balances
live only in metafields — they are not part of a Shopify export, so without this they would be
unrecoverable.

### 4.10 UI conventions used throughout

Column chooser with persisted visibility and sorting, sticky page headers, slide-over drawers,
modal previews for PDFs, optimistic inline editing, skeleton loading, a light/dark theme built on
CSS custom properties (`--ink`, `--accent`, `--surface`, `--line`), a runtime-configurable
favicon, and Framer Motion for drawer and card transitions.

---

## 5. API inventory

53 route handlers. Grouped by concern:

| Group | Routes |
| --- | --- |
| Auth & identity | `auth/[...nextauth]`, `login`, `me`, `me/password` |
| Catalog | `products`, `products/[id]`, `products/bulk`, `products/search`, `variants`, `inventory`, `locations`, `stats` |
| Collections | `collections`, `collections/[id]`, `collections/organize` |
| Billing | `billing`, `billing/[id]`, `billing/[id]/action`, `billing/export`, `billing/report` |
| Customers | `customers`, `customers/[id]`, `customers/bulk`, `customers/[id]/today`, `customers/[id]/export` |
| Orders | `orders`, `orders/[id]`, `orders/action`, `orders/export` |
| Data transfer | `import`, `export`, `template`, `backup` |
| Reports | `reports/today`, `reports/today-customers`, `reports/team` |
| Messaging | `email/invoice`, `whatsapp/send`, `settings/whatsapp` |
| Public / unauthenticated | `public/invoice/[id]`, `public/statement/[id]` (both HMAC-gated) |
| Storefront | `shop/register`, `shop/trade-login`, `shop/trade-logout`, `shop/me`, `shop/account`, `shop/search`, `shop/trade-checkout` |
| Ops | `cron/daily-digest`, `attendance`, `settings`, `users`, `barcodes/lookup` |

Conventions: `runtime = "nodejs"` everywhere Shopify is touched, `maxDuration = 300` on bulk
operations, permission check as the first statement, `503` when Shopify is unconfigured, `502`
on upstream failure, and errors phrased for shop staff rather than developers.

---

## 6. Environment variables

```bash
# Shopify (either a static token or client credentials)
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_TOKEN=shpat_...          # or:
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=...
SHOPIFY_API_VERSION=2025-10
SHOPIFY_CURRENCY=GBP

# Auth
AUTH_SECRET=...
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
PORTAL_OWNER_EMAIL=owner@example.com,second-owner@example.com
PORTAL_SESSION_SECRET=...              # also signs trade cookies + public link tokens

# Messaging
RESEND_API_KEY=...
EMAIL_FROM="Business Name <invoices@yourdomain.com>"

# Site
NEXT_PUBLIC_SITE_URL=https://store.example.com
NEXT_PUBLIC_BIZ_NAME=...               # plus TAGLINE, ADDRESS, EMAIL, PHONE, WEBSITE, VAT, BANK

# Ops
CRON_SECRET=...
ENABLE_TAPIN=1                         # optional — staff time clock
```

---

## 7. Reusing this for a different business

The system is really a **trade-counter operating system**, and most of it is business-agnostic.
What changes per industry is mainly the catalog vocabulary and which of the four price tiers
you keep.

| Business | Keep as-is | Change |
| --- | --- | --- |
| Any wholesale / cash-and-carry | Everything | Product types, tier names |
| Builders' merchant, auto parts | Everything | Add a "fitting" or delivery line type |
| Pharmacy, grocery wholesale | Everything | Add batch/expiry to the product model |
| Restaurant supply | Most | Replace the storefront with a standing-order page |
| Salon, garage, clinic | Portal only | Swap products for services, add a booking calendar; drop channels and Excel import |

Two rules when adapting: **keep the three-layer permission enforcement** (middleware, API
guard, nav filter) and **keep the HMAC on public links**. Everything else can be traded away.
