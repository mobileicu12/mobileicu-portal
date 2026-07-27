# Page Structure — wireframe snapshots of every page

Layout snapshots of all 33 pages, plus the full route tree and navigation model.

**These are wireframes, not screenshots.** They're reconstructed from the JSX, so the
regions, controls and their order are accurate; exact pixel spacing and live data are
not. Real screenshots would need the app running against live Shopify credentials.

Companion docs: [`SITE-BLUEPRINT.md`](./SITE-BLUEPRINT.md) ·
[`FUNCTIONAL-SPEC.md`](./FUNCTIONAL-SPEC.md) · [`BUILD-PROMPTS.md`](./BUILD-PROMPTS.md)

---

# 1. Route tree

```
/                                    → redirect to /shop
├── login                            Portal sign-in
├── no-access                        Permission denied
│
├── (shop)/  ······················· PUBLIC STOREFRONT — own layout, price-gated
│   └── shop
│       ├── /                        Home: hero + categories + featured
│       ├── all                      Full catalog
│       ├── collections              All collections (nested)
│       ├── c/[handle]               Collection page
│       ├── p/[handle]               Product page
│       ├── search                   Product search
│       ├── about                    Marketing
│       ├── contact                  Contact details (no form)
│       ├── register                 Wholesale account application
│       ├── trade-login              Email + trade code
│       ├── account                  Trade customer's own area
│       └── checkout                 Cart → places an invoice
│
└── (app)/  ························ STAFF PORTAL — own layout, auth required
    └── portal
        ├── /                        Dashboard              [any]
        ├── billing                  Point of sale          [billing]
        ├── invoices                 Invoice list           [invoices]
        │   └── [id]                 Invoice editor         [invoices]
        ├── customers                Customer list          [customers]
        │   └── [id]                 Customer account       [customers]
        ├── orders                   Order list             [orders]
        │   └── [id]                 Order detail           [orders]
        ├── inventory                Product table          [inventory]
        ├── products
        │   ├── new                  Add product            [inventory]
        │   └── [id]/edit            Edit product           [inventory]
        ├── collections              Collection list        [collections]
        │   └── [id]                 Collection detail      [collections]
        ├── import-export            Excel in/out           [inventory]
        ├── channels                 Marketplace board      [any]  ← PLACEHOLDER
        ├── settings                 Business settings      [settings]
        ├── users                    Team & access          [users]
        └── tap-in                   Shift clock-in         [any]  ← FLAGGED OFF
```

`[perm]` = the feature permission the middleware requires. `[any]` = any signed-in user.

---

# 2. Navigation model

**Sidebar (desktop), grouped:**

```
Overview  →  Dashboard
Sell      →  Billing · Invoices · Customers · Orders
Catalog   →  Inventory · Add Product · Collections · Import/Export · Channels
Admin     →  Settings · Team
```

**Mobile bottom bar** shows only `primary` items — Dashboard, Billing, Invoices,
Customers, Inventory — with the rest behind "More".

**Storefront header:** logo · Shop all · Collections · Search · cart · then either
`My account` + `Log out` (trade) or `Trade login` + `Register for wholesale`.

Items the user lacks permission for are removed from both navs, not disabled.

---

# 3. Shell / chrome

**Portal shell** — fixed height, only the content area scrolls:

```
┌────────────┬──────────────────────────────────────────────────────┬──┐
│            │  AppHeader: <page title>      [reports?] [☾] [user]  │  │
│  Sidebar   ├──────────────────────────────────────────────────────┤📤│ ← Today's
│            │                                                      │  │   sending
│  Overview  │                                                      │  │   tab
│   Dashboard│                  PAGE CONTENT                        │  │   (right
│            │                  (scrolls)                           │  │    edge,
│  Sell      │                                                      │  │    badge =
│   Billing  │                                                      │  │    pending)
│   Invoices │                                                      │  │
│   Customers│                                                      │  │
│   Orders   │                                                      │  │
│            ├──────────────────────────────────────────────────────┤  │
│  Catalog   │  AppFooter: business name · year                     │  │
│   …        └──────────────────────────────────────────────────────┴──┘
│  Admin     │
└────────────┘        mobile: sidebar hidden, floating bottom nav instead
```

The header's "today's reports" ZIP button only appears after the configured hour
(default 21:00) and only for owner / `invoices` holders.

**Storefront shell:**

```
┌──────────────────────────────────────────────────────────────────┐
│ ✓ Trade pricing active — wholesale prices shown    [Log out]     │ ← only when
├──────────────────────────────────────────────────────────────────┤    logged in
│ MOBILE ICU    Shop all  Collections  Search      [acct] [🛒 2]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                        PAGE CONTENT                              │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ MOBILE ICU        Shop          Company        Account           │
│ blurb             All products  About us       Trade login       │
│                   Collections   Contact        Register          │
└──────────────────────────────────────────────────────────────────┘
```

---

# 4. Portal page snapshots

## `/portal` — Dashboard

```
┌──────────────────────────────────────────────────────────────────┐
│ Dashboard                                                        │ sticky
│ MOBILE ICU — control portal                                      │
├──────────────────────────────────────────────────────────────────┤
│ ┏━━━━━━━━━━━━━━━━━━━━━━ dark gradient card ━━━━━━━━━━━━━━━━━━━━┓ │
│ ┃ TODAY'S TAKINGS · 12 sales          ( All | Cash | Card )    ┃ │
│ ┃ £1,284.50                                                    ┃ │
│ ┃ Retail + wholesale combined                                  ┃ │
│ ┃ ┌────────┬────────┬────────┬────────┐                        ┃ │
│ ┃ │ Retail │ Whlsle │  Cash  │  Card  │                        ┃ │
│ ┃ └────────┴────────┴────────┴────────┘                        ┃ │
│ ┃ ┌───────────────────┬───────────────────┐                    ┃ │
│ ┃ │ Collected today   │ Total outstanding │ ← amber            ┃ │
│ ┃ └───────────────────┴───────────────────┘                    ┃ │
│ ┃ Latest sale · MICU-2026-0042 · Acme Ltd      £84.00 · paid   ┃ │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
│                                                                  │
│ ┌───────────┬───────────┬───────────┬───────────┐                │
│ │ Total     │ Low stock │ Out of    │Collections│                │
│ │ products  │ (≤5)      │ stock     │           │                │
│ └───────────┴───────────┴───────────┴───────────┘                │
│                                                                  │
│ QUICK ACTIONS                                                    │
│ ┌────────────────┬────────────────┬────────────────┐             │
│ │Manage inventory│ Add a product  │ Import/Export  │             │
│ ├────────────────┼────────────────┴────────────────┘             │
│ │New bill/invoice│ View invoices  │                              │
│ └────────────────┴────────────────┘                              │
└──────────────────────────────────────────────────────────────────┘
```

## `/portal/billing` — Billing / POS

```
┌──────────────────────────────────────────────────────────────────┐
│ Billing / POS            [ Wholesale invoice | POS (instant) ]   │ sticky
├──────────────────────────────────────────────────────────────────┤
│ ✓ Sale completed — MICU-2026-0043.  Open in Shopify              │ after sale
│ [📄 Invoice PDF] [✓ Paid in person] [+ New bill]                 │
├────────────────────────────────────┬─────────────────────────────┤
│ ▮▏▮ Scan barcode (or type+Enter)  📷│  SUMMARY                    │
│ ✓ Added iPhone 15 Pro LCD          │                             │
│ ┌────────────────────────────────┐ │  Source                     │
│ │ Search product or SKU to add…  │ │  [ Online / Registered  ▾]  │
│ └────────────────────────────────┘ │  Prices from Wholesale tier │
│  ┌──────────────────────────────┐  │                             │
│  │ ▣ iPhone 15 Pro LCD          │  │  Charge VAT (20%)      [x]  │
│  │   IP15P-LCD · 12 in stock £40│  │                             │
│  └──────────────────────────────┘  │  Discount   = £4.00 off     │
│                                    │  [ 10    ] [ % | £ ]        │
│ ┌────────────────────────────────┐ │                             │
│ │Item      │Qty│ Unit  │ Total │✕│ │  Customer                   │
│ ├──────────┼───┼───────┼───────┼─┤ │  ┌────────────────────────┐ │
│ │iPhone LCD│ 2 │£40.00 │£80.00 │✕│ │  │ Acme Ltd      change   │ │
│ │IP15P-LCD │   │       │       │ │ │  └────────────────────────┘ │
│ │Labour    │ 1 │£15.00 │£15.00 │✕│ │  ┌─ open invoices ────────┐ │
│ └──────────┴───┴───────┴───────┴─┘ │  │ 2 open today — add to  │ │
│ [+ Add custom item (labour…)]      │  │ tab? [Create new    ▾] │ │
│                                    │  └────────────────────────┘ │
│                                    │  ┌─ walk-in (POS only) ───┐ │
│                                    │  │ Name / Phone / Email   │ │
│                                    │  └────────────────────────┘ │
│                                    │  Note [            ]        │
│                                    │  ─────────────────────────  │
│                                    │  Subtotal          £95.00   │
│                                    │  Discount (10%)    −£9.50   │
│                                    │  VAT (20%)         £17.10   │
│                                    │  This bill        £102.60   │
│                                    │  Paid by [cash|card|bank|…] │
│                                    │  ┌─ amber account panel ──┐ │
│                                    │  │ Old outstanding £40.00 │ │
│                                    │  │ Total due      £142.60 │ │
│                                    │  │ Received now £[__] ▾   │ │
│                                    │  │                pay all │ │
│                                    │  │ New outstanding£142.60 │ │
│                                    │  └────────────────────────┘ │
│                                    │  [ Charge £102.60 &         │
│                                    │      complete             ] │
│                                    │  Completes the sale and     │
│                                    │  deducts stock.             │
└────────────────────────────────────┴─────────────────────────────┘
```

## `/portal/invoices` — list

```
┌──────────────────────────────────────────────────────────────────┐
│ Invoices                            [⋯ Columns] [Export] [Report]│ sticky
├──────────────────────────────────────────────────────────────────┤
│ [Search invoice # or customer…]  [Status ▾] [Source ▾]           │
│                                        [📦 Today's reports ZIP]  │
├──────────────────────────────────────────────────────────────────┤
│ Invoice▲ │ Customer │Source│Staff│ Status │ Date    │    Total   │
├──────────┼──────────┼──────┼─────┼────────┼─────────┼────────────┤
│MICU-…0043│ Acme Ltd │Online│ raj │ PAID   │27 Jul   │   £102.60  │
│MICU-…0042│ Walk-in  │ Shop │ ana │ OPEN   │27 Jul   │    £84.00  │
└──────────┴──────────┴──────┴─────┴────────┴─────────┴────────────┘
        totals hidden unless owner or `reports` permission
```

## `/portal/invoices/[id]` — editor

```
┌──────────────────────────────────────────────────────────────────┐
│ MICU-2026-0042            [PDF][Save][Duplicate][✉ Send]         │ sticky
│ OPEN · 27 Jul 2026                    [↩ Void][Delete]           │
├────────────────────────────────────┬─────────────────────────────┤
│ [Search product or SKU to add…]    │  Customer                   │
│ ┌────────────────────────────────┐ │  ┌────────────────────────┐ │
│ │Item      │Qty│ Unit  │ Total │✕│ │  │ Acme Ltd      change   │ │
│ ├──────────┼───┼───────┼───────┼─┤ │  └────────────────────────┘ │
│ │iPhone LCD│ 2 │£40.00 │£80.00 │✕│ │  Subtotal          £84.00   │
│ └──────────┴───┴───────┴───────┴─┘ │  VAT               £16.80   │
│ [+ Add custom item]                │  Total            £100.80   │
│                                    │  Paid              £50.00   │
│ ┌─ PAYMENTS ───────────────────────┐  Balance           £50.80   │
│ │ [Amount £][method ▾][Note      ] │                             │
│ │ [Record payment]  Pay balance    │  [ Mark paid ]              │
│ │ ────────────────────────────────  │                             │
│ │ 27 Jul · £50.00 · cash    Revoke │                             │
│ └──────────────────────────────────┘                             │
└────────────────────────────────────┴─────────────────────────────┘
        completed invoices → read-only except payments and void
```

## `/portal/customers` — list

```
┌──────────────────────────────────────────────────────────────────┐
│ Customers                          [⋯ Columns] [+ Add customer]  │ sticky
├──────────────────────────────────────────────────────────────────┤
│ [Search name, company, email or phone…]   [Segment ▾]            │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ TODAY'S CUSTOMERS ────────────────────────────────────────┐   │
│ │ Acme Ltd   3 bills · £240 today · £90 due   [📄 Statement] │   │
│ └────────────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│ Name▲   │Segment │Company │Contact  │Invoices│Orders│Total spent │
├─────────┼────────┼────────┼─────────┼────────┼──────┼────────────┤
│Acme Ltd │[Online]│Acme    │…@acme   │ 12 (9) │  12  │  £4,210.00 │
│J. Smith │[Shop]  │        │07911…   │  3 (3) │   3  │    £128.40 │
└─────────┴────────┴────────┴─────────┴────────┴──────┴────────────┘

  + Add customer (expands):
  ┌────────────────────────────────────────────────────────────┐
  │ First name  │ Last name  │ Company                         │
  │ Email       │ [🇬🇧 +44 ▾] Phone number                     │
  │ Opening balance £ │ Note                                   │
  │ Segments: [x] Online [ ] Shop [ ] eBay [ ] Amazon          │
  │                                        [Cancel] [Add]      │
  └────────────────────────────────────────────────────────────┘
```

## `/portal/customers/[id]` — account

```
┌──────────────────────────────────────────────────────────────────┐
│ Acme Ltd                             [New bill] [Statement PDF]  │ sticky
│ [Online]  acme@example.com · 07911 123456                        │
├──────────────────────────────────────────────────────────────────┤
│ ┌──────────┬──────────┬─────────────┬──────────┐                 │
│ │Total     │Total paid│ Outstanding │ Invoices │                 │
│ │billed    │(emerald) │             │          │                 │
│ └──────────┴──────────┴─────────────┴──────────┘                 │
├────────────────────────────────────┬─────────────────────────────┤
│ INVOICES (12)      [Search #]      │ ┌─ RECORD PAYMENT ────────┐ │
│ ┌────────────────────────────────┐ │ │ Amount £ [____]         │ │
│ │MICU-…0043  PAID   £102.60      │ │ │ [cash ▾] Note [_____]   │ │
│ │MICU-…0042  OPEN   £84.00       │ │ │ [Record payment]        │ │
│ │            paid £50 · due £34  │ │ │ Allocates oldest-first  │ │
│ └────────────────────────────────┘ │ └─────────────────────────┘ │
│                                    │ ┌─ EDIT CUSTOMER ─────────┐ │
│ PAYMENT HISTORY                    │ │ First / Last name       │ │
│ [All][cash][card][bank]            │ │ Company / Email / Phone │ │
│ ┌────────────────────────────────┐ │ │ Opening balance £       │ │
│ │27 Jul £50.00 cash              │ │ │ Note          [Save]    │ │
│ │       "Payment with MICU-0042" │ │ └─────────────────────────┘ │
│ │              [Edit] [Revoke]   │ │ ┌─ SEGMENTS ──────────────┐ │
│ └────────────────────────────────┘ │ │ [x]Online [ ]Shop       │ │
│                                    │ │ [ ]eBay   [ ]Amazon     │ │
│                                    │ └─────────────────────────┘ │
│                                    │ ┌─ TRADE ACCESS CODE ─────┐ │
│                                    │ │  K7MPQ2XA    [Copy]     │ │
│                                    │ │  [Generate new code]    │ │
│                                    │ └─────────────────────────┘ │
└────────────────────────────────────┴─────────────────────────────┘
```

## `/portal/inventory`

```
┌──────────────────────────────────────────────────────────────────┐
│ Inventory                    [⋯ Columns] [📷 Scan] [+ Product]   │ sticky
├──────────────────────────────────────────────────────────────────┤
│ [Search product or SKU…]  [All|Low|Out|In stock]  [Location ▾]   │
├──────────────────────────────────────────────────────────────────┤
│ ┌── 3 selected ────────────────────────────────────────────────┐ │
│ │ Activate · Draft · Set price £ · Set stock · Collection ·    │ │
│ │ Channels · Assign barcodes · 🏷 Print labels · Delete        │ │
│ └──────────────────────────────────────────────────────────────┘ │
├──┬──────────────────┬────────┬────────┬──────────┬──────────────┤
│☐ │ Product          │ SKU    │ Price  │ Status   │  Available   │
├──┼──────────────────┼────────┼────────┼──────────┼──────────────┤
│☑ │▣ iPhone 15 LCD   │IP15-LCD│£40.00  │ In stock │      12      │
│☐ │▣ USB-C Cable 1m  │USBC-1M │ £2.50  │ Low      │       3      │
└──┴──────────────────┴────────┴────────┴──────────┴──────────────┘
              [ Load more ]

  hidden by default via ⋯ Columns: Wholesale £ · Shop £ · eBay £ · Amazon £ · Channels

  🏷 Print labels modal:
  ┌──────────────────────────────────────────────┐
  │ Preset: [A4 · 38×21mm (65/page)          ▾]  │
  │         A4 · 63×34mm (24/page)               │
  │         Thermal 50×25mm / 57×32mm            │
  │ Copies per item [1]                          │
  │ [x] Name  [x] Price  [x] SKU                 │
  │                        [Cancel] [Print]      │
  └──────────────────────────────────────────────┘
```

## `/portal/products/new` and `/portal/products/[id]/edit`

```
┌──────────────────────────────────────────────────────────────────┐
│ Add Product                                        [Save product]│ sticky
├──────────────────────────────────────────────────────────────────┤
│ Title *                                            (spans 2 cols)│
│ [iPhone 15 Pro LCD Screen Replacement                          ] │
│                                                                  │
│ Description                              [ HTML | Preview ]      │
│ [<p>Paste or write product HTML here…</p>                      ] │
│                                                                  │
│ Brand [MobileICU / AHL…]      │ Model(s) [iPhone 15 Pro       ]  │
│ Type  [Screen           ]      │ Tags     [iPhone 15 Pro, LCD  ]  │
│ SKU   [IP15P-LCD        ]      │ Barcode  [Optional            ]  │
│ Price (£) [39.99        ]      │ Compare-at (£) [Optional      ]  │
│ Stock [10               ]      │ Status [Active (visible)    ▾]  │
│ Image URL [https://…  (Shopify downloads it)                   ] │
│                                                                  │
│ PRICE TIERS                                                      │
│ Wholesale £[  ] Shop £[  ] eBay £[  ] Amazon £[  ]               │
│ blank = use the base price                                       │
│                                                                  │
│ Collections [x] LCD  [ ] Batteries  [ ] Cables                   │
│ Channels    [x] Online  [ ] eBay 1  [ ] Amazon 1                 │
└──────────────────────────────────────────────────────────────────┘
```

## `/portal/collections` and `/portal/collections/[id]`

```
LIST                                    DETAIL
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ Collections   [Grid|Tree]    │        │ LCD Screens        [Save]    │
│ [Search…]  [+ New collection]│        │ 42 products · handle: lcd    │
├──────────────────────────────┤        ├──────────────────────────────┤
│ ┌────────┬────────┬────────┐ │        │ Title [LCD Screens         ] │
│ │ ▣ LCD  │ ▣ Batt │ ▣ Cable│ │        │ Description [            ]   │
│ │ 42 prod│ 18 prod│ 30 prod│ │        │ Image [url]                  │
│ └────────┴────────┴────────┘ │        │ Parent [— Top level —     ▾] │
│                              │        ├──────────────────────────────┤
│ ┌─ 2 selected ─────────────┐ │        │ PRODUCTS   [+ Add products]  │
│ │ Set parent ▾ · Delete    │ │        │ ▣ iPhone 15 LCD    ✕         │
│ └──────────────────────────┘ │        │ ▣ Galaxy S24 LCD   ✕         │
│ [Auto-organise by type]      │        │        [ Load more ]         │
└──────────────────────────────┘        └──────────────────────────────┘
```

## `/portal/orders` and `/portal/orders/[id]`

```
LIST
┌──────────────────────────────────────────────────────────────────┐
│ Orders                                    [Search order #…]      │ sticky
│ [All sources | Online | Shop | eBay | Amazon]                    │
├──────────────────────────────────────────────────────────────────┤
│ ┌────────┬────────┬────────────┬────────┐                        │
│ │ Orders │ Sales  │ Unfulfilled│ Unpaid │  ← Sales owner-only    │
│ │        │(owner) │  (rose)    │(amber) │                        │
│ └────────┴────────┴────────────┴────────┘                        │
│ ┌─ 2 selected ──────────────────────────┐                        │
│ │ Archive · Reopen · Delete             │                        │
│ └───────────────────────────────────────┘                        │
├──┬─────────┬──────────┬────────┬───────────┬──────────┬──────────┤
│☐ │ Order   │ Customer │Source  │ Payment   │Fulfilment│  Total   │
│☐ │ #1042   │ Acme Ltd │[Online]│ PAID      │FULFILLED │  £102.60 │
└──┴─────────┴──────────┴────────┴───────────┴──────────┴──────────┘

DETAIL
┌────────────────────────────────────┬─────────────────────────────┐
│ #1042                              │ STATUS                      │
│ ┌────────────────────────────────┐ │  Payment: PAID              │
│ │ Line items                     │ │  Fulfilment: FULFILLED      │
│ │ 2 × iPhone 15 LCD    £80.00    │ │ CUSTOMER                    │
│ └────────────────────────────────┘ │  Acme Ltd · acme@…          │
│                                    │ TOTALS                      │
│                                    │  Subtotal / Shipping /      │
│                                    │  Tax / Total                │
└────────────────────────────────────┴─────────────────────────────┘
```

## `/portal/import-export`

```
┌──────────────────────────────────────────────────────────────────┐
│ Import / Export                                                  │ sticky
├──────────────────────────────────────────────────────────────────┤
│ ┌─ EXPORT ─────────────────┐  ┌─ TEMPLATE ────────────────────┐  │
│ │ Download your whole      │  │ Blank sheet with the same     │  │
│ │ catalog as Excel.        │  │ columns + one example row.    │  │
│ │ [⬇ Export catalog]       │  │ [⬇ Download template]         │  │
│ └──────────────────────────┘  └───────────────────────────────┘  │
│ ┌─ IMPORT ───────────────────────────────────────────────────┐   │
│ │ Rows WITH a handle update · rows WITHOUT create.           │   │
│ │ [Choose file…]  [Run import]                               │   │
│ └────────────────────────────────────────────────────────────┘   │
│ ┌─ RESULT ───────────────────────────────────────────────────┐   │
│ │ 120 rows · 30 created · 88 updated · 2 failed              │   │
│ │ Title            │ Action  │ Result                        │   │
│ │ iPhone 15 LCD    │ updated │ ✓                             │   │
│ │ Bad Row          │ —       │ ✗ Price must be a number      │   │
│ └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

## `/portal/channels` — PLACEHOLDER

```
┌──────────────────────────────────────────────────────────────────┐
│ Channels                                                         │ sticky
│ Route products to the marketplaces you sell on…                  │
├──────────────────────────────────────────────────────────────────┤
│ ┌──────────────────┬──────────────────┬──────────────────┐       │
│ │ Online Store     │ eBay — Account 1 │ eBay — Account 2 │       │
│ │      ● Connected │  ○ Not connected │  ○ Not connected │       │
│ │ (always on)      │ [Mark connected] │ [Mark connected] │       │
│ ├──────────────────┼──────────────────┴──────────────────┘       │
│ │ Amazon — Acct 1  │ Amazon — Acct 2  │                          │
│ └──────────────────┴──────────────────┘                          │
│                                                                  │
│  ⚠ State is localStorage only — nothing connects to eBay/Amazon. │
└──────────────────────────────────────────────────────────────────┘
```

## `/portal/settings`

```
┌──────────────────────────────────────────────────────────────────┐
│ Settings                                        [Save settings]  │ sticky
│ Business details used on your invoices, statements & PDFs.       │
├────────────────────────────────────┬─────────────────────────────┤
│ BUSINESS IDENTITY                  │ CONTACT & LEGAL             │
│  Business name  [            ]     │  Email    [             ]   │
│  Tagline        [            ]     │  Phone    [             ]   │
│  Address (multi)[            ]     │  Website  [             ]   │
│  Favicon URL    [        ] [▣]     │  VAT no.  [GB123456789  ]   │
├────────────────────────────────────┼─────────────────────────────┤
│ INVOICE FOOTER                     │ DEFAULTS                    │
│  Bank / payment [            ]     │  Prefix   [MICU         ]   │
│  Footer note    [            ]     │   → MICU-2026-0001          │
│                                    │  VAT rate %  [20]  ← DEAD   │
│                                    │  Low stock   [ 5]  ← DEAD   │
├────────────────────────────────────┼─────────────────────────────┤
│ AUTOMATIC WHATSAPP                 │ DAILY DIGEST                │
│  Access token [••••••••     ]      │  Enable digest        [ ]   │
│  Phone no. ID [             ]      │  Send customers       [x]   │
│  Template     [             ]      │  Send me the report   [x]   │
│  [Save WhatsApp]  ○ Not connected  │  Owner email [          ]   │
│                                    │  Owner WhatsApp [       ]   │
│                                    │  Report button hour [21]    │
│                                    │  [Save] [Send digest now]   │
├────────────────────────────────────┼─────────────────────────────┤
│ BACKUP & RESTORE                   │ STAFF TIME-CLOCK            │
│  [⬇ Download full backup (.json)]  │  Require tap in       [ ]   │
│  Export only — no restore endpoint │  [Save]  [↻ Refresh]        │
│                                    │  TODAY'S SHIFTS             │
│                                    │  raj    09:02–17:30  8h 28m │
│                                    │  ana    09:15–       [in]   │
└────────────────────────────────────┴─────────────────────────────┘
```

## `/portal/users`

```
┌──────────────────────────────────────────────────────────────────┐
│ Team & access                                    [+ Add member]  │ sticky
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ Owner  mobileicu12@gmail.com          Full access · locked │   │
│ ├────────────────────────────────────────────────────────────┤   │
│ │ Raj    raj@mobileicu.co.uk    🔑 password set      [Edit]  │   │
│ │  Inventory · Billing · Invoices · Orders · Customers       │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Edit (expands):                                                 │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Phone [+44 7911 123456          ]                        │    │
│  │ Set / reset password [          ]                        │    │
│  │ [x] Inventory      View & edit products, stock, prices   │    │
│  │ [x] Billing / POS  Create bills & take payments          │    │
│  │ [x] Invoices       View, edit, send & export invoices    │    │
│  │ [x] Orders         View & manage store orders            │    │
│  │ [x] Customers      Register & manage customers           │    │
│  │ [ ] Collections    Organise collections                  │    │
│  │ [ ] Reports        Sales & team performance              │    │
│  │ [ ] Settings       Business & portal settings            │    │
│  │ [ ] Team mgmt      Add teammates & set access            │    │
│  │                        [Remove] [Cancel] [Save]          │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│ STAFF SALES (owner only)                                         │
│ Staff │ Invoices │  Total  │  Paid   │  Open                     │
│ raj   │    24    │ £2,140  │ £1,980  │  £160                     │
└──────────────────────────────────────────────────────────────────┘
```

## `/portal/tap-in` — FLAGGED OFF

```
              ┌────────────────────────────────┐
              │             ┌────┐             │
              │             │ MI │             │
              │             └────┘             │
              │  Tap in to start your shift    │
              │  Re-enter your password to     │
              │  clock in. Auto clock-out 9:30 │
              │                                │
              │  [ Your password             ] │
              │  [        🟢 Tap in          ] │
              └────────────────────────────────┘
```

## Today's sending drawer (global, right edge)

```
                        ┌──────────────────────────────────┐
                        │ Today's sending             ↻ ✕  │
                        │ 4 to do · 2 done                 │
                        ├──────────────────────────────────┤
                        │ [📦 Generate all] [📤 Send all]  │
                        ├──────────────────────────────────┤
                        │ TO DO (4)                        │
                        │ ┌──────────────────────────────┐ │
                        │ │ Acme Ltd                     │ │
                        │ │ 3 bill(s) · £240 · £90 due   │ │
                        │ │ acme@… · 07911…              │ │
                        │ │ [📄 Generate]  [📤 Send]     │ │
                        │ └──────────────────────────────┘ │
                        │ DONE (2)              (faded)    │
                        └──────────────────────────────────┘
```

---

# 5. Storefront page snapshots

## `/shop` — home

```
┌──────────────────────────────────────────────────────────────────┐
│  [Wholesale · Trade accounts welcome]                            │
│  Phone & laptop parts at genuine wholesale prices.               │
│  Cases, cables, chargers, batteries, repair parts…               │
│  [ Shop all ]  [ Search products ]                               │
├──────────────────────────────────────────────────────────────────┤
│  Shop by category                                                │
│  ┌────────┬────────┬────────┬────────┐                           │
│  │ ▣ LCD  │ ▣ Batt │ ▣ Cable│ ▣ Case │  (4 across, 8 total)      │
│  └────────┴────────┴────────┴────────┘                           │
├──────────────────────────────────────────────────────────────────┤
│  Featured products                                               │
│  ┌────────┬────────┬────────┬────────┐                           │
│  │ ▣      │ ▣      │ ▣      │ ▣      │                           │
│  │ Title  │ Title  │ Title  │ Title  │                           │
│  │🔒 Log in to see price  ← logged out                           │
│  │ £40.00  [Add to cart] ← trade                                 │
│  └────────┴────────┴────────┴────────┘                           │
└──────────────────────────────────────────────────────────────────┘
```

## `/shop/p/[handle]` — product

```
┌──────────────────────────────────────────────────────────────────┐
│ Home / Collections / LCD Screens / iPhone 15 Pro LCD             │
├────────────────────────────────────┬─────────────────────────────┤
│ ┌────────────────────────────────┐ │ Brand · Type                │
│ │                                │ │ iPhone 15 Pro LCD Screen    │
│ │         main image             │ │                             │
│ │                                │ │ ┌─ logged out ────────────┐ │
│ └────────────────────────────────┘ │ │ 🔒 Trade account        │ │
│ ┌────┬────┬────┬────┐              │ │    required             │ │
│ │ ▣  │ ▣  │ ▣  │ ▣  │ thumbnails   │ │ Prices & ordering are   │ │
│ └────┴────┴────┴────┘              │ │ for registered trade    │ │
│                                    │ │ customers only.         │ │
│                                    │ │ [Log in] [Register]     │ │
│                                    │ └─────────────────────────┘ │
│                                    │ ┌─ trade ─────────────────┐ │
│                                    │ │ £40.00   (was £52.00)   │ │
│                                    │ │ Variant [ Default   ▾]  │ │
│                                    │ │ Qty [1]  [Add to cart]  │ │
│                                    │ └─────────────────────────┘ │
│                                    │ Description                 │
└────────────────────────────────────┴─────────────────────────────┘
```

## `/shop/c/[handle]`, `/shop/all`, `/shop/search`

```
┌──────────────────────────────────────────────────────────────────┐
│ Home / Collections / LCD Screens        (search: search bar)     │
│ LCD Screens                                                      │
├──────────────┬───────────────────────────────────────────────────┤
│ CATEGORIES   │ ┌────────┬────────┬────────┐                      │
│ ▸ LCD        │ │ ▣ card │ ▣ card │ ▣ card │                      │
│ ▸ Batteries  │ ├────────┼────────┼────────┤                      │
│ ▸ Cables     │ │ ▣ card │ ▣ card │ ▣ card │                      │
│   ▸ USB-C    │ └────────┴────────┴────────┘                      │
│ ▸ Chargers   │              [ Load more ]                        │
└──────────────┴───────────────────────────────────────────────────┘
```

## `/shop/trade-login` · `/shop/register`

```
TRADE LOGIN                             REGISTER
┌──────────────────────────┐            ┌──────────────────────────────┐
│      [Trade access]      │            │      [Trade accounts]        │
│      Trade login         │            │  Open a wholesale account    │
│ Enter your email and the │            │ Register and we'll review    │
│ code we gave you.        │            │ your application.            │
│ ┌──────────────────────┐ │            │ ┌──────────────────────────┐ │
│ │ Email  [           ] │ │            │ │First name │ Last name    │ │
│ │ Trade access code    │ │            │ │Business name            │ │
│ │ [ X X X X X X X X ]  │ │            │ │Email *    │ Phone       │ │
│ │ [Unlock trade prices]│ │            │ │Anything else?           │ │
│ └──────────────────────┘ │            │ │      [Submit application]│ │
│ No account? Register →   │            │ └──────────────────────────┘ │
└──────────────────────────┘            └──────────────────────────────┘
                                          success → animated ✓ panel
```

## `/shop/checkout`

```
┌────────────────────────────────────┬─────────────────────────────┐
│ Your cart                          │ SUMMARY                     │
│ ┌────────────────────────────────┐ │  Subtotal        £240.00    │
│ │ ▣ iPhone 15 LCD                │ │                             │
│ │   £40.00   [− 2 +]   remove    │ │  PAYMENT METHOD             │
│ ├────────────────────────────────┤ │  ( ) Cash on collection     │
│ │ ▣ USB-C Cable                  │ │      Pay when you collect   │
│ │   £2.50    [− 4 +]   remove    │ │  ( ) Bank transfer          │
│ └────────────────────────────────┘ │      Details on the invoice │
│                                    │  ( ) On account             │
│ Note                               │      Settle later           │
│ [e.g. collection time…           ] │                             │
│                                    │  [ Place order ]            │
└────────────────────────────────────┴─────────────────────────────┘
        success → order confirmation with invoice number
```

## `/shop/account` · `/shop/about` · `/shop/contact`

```
ACCOUNT                                 CONTACT (no form)
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ My account        [Log out]  │        │ Contact us                   │
│ ┌──────────────────────────┐ │        │ ┌─────────────┬────────────┐ │
│ │ Outstanding    £90.00    │ │        │ │ EMAIL       │ PHONE      │ │
│ └──────────────────────────┘ │        │ │ …@…  mailto │ tel: link  │ │
│ YOUR DETAILS                 │        │ ├─────────────┴────────────┤ │
│ First / Last / Email         │        │ │ ADDRESS                  │ │
│ Phone / Company     [Save]   │        │ └──────────────────────────┘ │
│ ORDER HISTORY                │        │ ┌─ dark CTA ───────────────┐ │
│ #1042  PAID   £102.60        │        │ │ Want trade pricing?      │ │
│ #1039  OPEN   £84.00 · £34 due│       │ │ [Register] [Trade login] │ │
└──────────────────────────────┘        └──────────────────────────────┘
```

---

# 6. Root pages

```
/login                                  /no-access
┌──────────────────────────────┐        ┌──────────────────────────────┐
│           ┌────┐             │        │           ┌────┐             │
│           │ MI │             │        │           │ 🔒 │             │
│           └────┘             │        │           └────┘             │
│    MOBILE ICU Portal         │        │  No access to this feature   │
│                              │        │  Your account doesn't have   │
│ [ Continue with Google     ] │        │  permission to open the      │
│ ──────────  or  ──────────   │        │  <feature> section. Ask the  │
│ Email    [                 ] │        │  owner under Team & access.  │
│ Password [                 ] │        │                              │
│ [        Sign in           ] │        │  [ Back to dashboard ]       │
│ Use master password →        │        │                              │
└──────────────────────────────┘        └──────────────────────────────┘
```

---

# 7. Flow maps

**A sale, end to end:**

```
   Billing page
        │
    ┌───┴────┐
  POS      Wholesale
    │           │
    │      customer must have seg:online
    │           │
    │      ┌────┴─────┐
    │   new bill   add to open tab
    │      │          │
    ▼      ▼          ▼
  draft order created (tag: portal-billing, portal.invoice_no)
        │
   received >= total ?
    ┌───┴───┐
   yes      no
    │        │
    │        └──→ stays OPEN → appears in Invoices → payment recorded later
    ▼
  draftOrderComplete → real order → stock deducted → auto-fulfilled
        │
        └──→ surplus received → customer ledger (account credit)
```

**A customer, end to end:**

```
  self-register            staff quick-add
  /shop/register                  │
        │                         │
  pending-approval,               │
  NO segment                      │
        │                         │
        └────────┬────────────────┘
                 ▼
        owner sets segment (seg:online = trade)
                 │
                 ▼
        generate trade code ──→ customer logs into /shop
                 │                       │
                 ▼                       ▼
            billed in portal      self-checkout (unpaid invoice)
                 │                       │
                 └───────────┬───────────┘
                             ▼
                   payment recorded
                   ├─ full at till      → invoice completed
                   ├─ partial           → invoice payments[]
                   └─ against account   → oldest-first allocation
                             │
                             ▼
                   end of day: digest emails + WhatsApps
                   their statement; owner gets the summary
```

**Permission enforcement, per request:**

```
  request
     │
     ▼
  middleware ──── not signed in? ──→ /login?from=…
     │
     ├─ page under a gated prefix, member lacks perm ──→ /no-access?feature=…
     │
     ▼
  page renders ──→ nav filtered by visibleNav(me)
     │
     ▼
  API call ──→ lib/guard requirePermission() ──→ 403 if not allowed
                        (never trusts the middleware alone)
```
