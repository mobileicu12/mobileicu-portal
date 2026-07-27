# Functional Spec — every page, section, field, button and formula

This is the deep version. For each screen: what sections it has, every field and
control, what each button actually does, and the exact arithmetic behind every number
on screen. It also flags **which features are really wired up and which are only
placeholders**, because several are.

Companion docs: [`SITE-BLUEPRINT.md`](./SITE-BLUEPRINT.md) (architecture),
[`BUILD-PROMPTS.md`](./BUILD-PROMPTS.md) (rebuild prompts).

---

## Status legend

Used throughout this document:

| Mark | Meaning |
| --- | --- |
| **LIVE** | Fully implemented and working |
| **NEEDS KEY** | Implemented, but does nothing until a credential is added |
| **FLAGGED OFF** | Implemented, but disabled by an env var — off in production right now |
| **PLACEHOLDER** | UI exists, no backend behind it |
| **DEAD** | The field saves, but nothing ever reads it |

---

# Part 1 — The money model

Every currency figure in the app comes from one of the formulas below. This is the
part to get right first if you rebuild.

## 1.1 A single bill (POS / billing screen, computed live in the browser)

```
lineTotal   = unitPrice × qty
subtotal    = Σ lineTotal

discountAmt = type "%"  → subtotal × min(discount,100)/100
              type "£"  → min(discount, subtotal)

net         = subtotal − discountAmt
vatAmt      = vatEnabled ? net × 0.20 : 0
total       = net + vatAmt
```

The VAT rate is the **hardcoded constant `VAT_RATE = 0.2`** in the billing page, not
the Settings value (see §6.1).

## 1.2 One invoice's paid / balance

```
amountPaid = status == "COMPLETED"  →  total          (a completed sale is paid in full)
             otherwise              →  Σ payments[].amount

balance    = max(0, total − amountPaid)
```

The `COMPLETED` short-circuit matters: once a draft order is completed, Shopify owns
the money, so manually-logged partial payments on it are ignored for the balance
(they're still stored and can be revoked).

## 1.3 A customer's account outstanding

```
invoiceDue  = Σ (balance of every non-voided invoice)
ledgerPaid  = Σ (ledger payments[].amount)

outstanding = openingBalance + invoiceDue − ledgerPaid
```

`openingBalance` is the debt you carried in when you started using the system. The
customer detail page and today's-statement API clamp with `max(0, …)`; the billing
sidebar does **not**, so a customer in credit shows a negative there.

## 1.4 The billing sidebar's live account panel

```
Old outstanding      = (formula 1.3, as loaded for the selected customer)
Total due            = oldOutstanding + thisBillTotal
New outstanding      = max(0, oldOutstanding + thisBillTotal − receivedNow)
```

## 1.5 Payment allocation — oldest-first (`allocatePayment`)

The default when you record a payment against a customer. Open invoices are sorted
oldest first, then:

```
for each open invoice (oldest → newest):
    if remaining < invoice.balance:  STOP        ← partial payments never split a bill
    completeInvoice(invoice)                      ← marks PAID, deducts stock
    remaining −= invoice.balance

leftover = max(0, round(remaining, 2))
if leftover > 0: append to ledger as an account credit
```

Worked example from the source comment: **£35** against bills of £10, £25, £15, £5, £10
clears the £10 and the £25 and leaves £0. It stops at the £15 rather than part-paying
it. Pass `allocate: false` to skip all of this and record a plain account credit.

## 1.6 Dashboard "Today's takings"

Filters all invoices to `createdAt >= today 00:00`, then:

```
total       = Σ total
paid        = Σ total where status == COMPLETED
wholesale   = Σ total where segment == "online"
marketplace = Σ total where segment ∈ {ebay, amazon}
retail      = Σ total for everything else (shop / POS / unset)
byMethod[m] = Σ total grouped by payMethod, bucketed into cash|card|bank transfer|other

outstanding    = Σ total of ALL non-completed invoices (all time, not just today)
ledgerToday    = Σ ledger payments dated today   ← FLAGGED OFF, returns 0 (§6.3)
collectedToday = paid + ledgerToday
```

Cached 2 minutes via `unstable_cache`. Note `outstanding` is all-time despite sitting
in a "today" widget — that's deliberate, it's the debtor book.

## 1.7 Staff performance (`summarizeByStaff`)

Grouped by the `staff:<email>` tag on each invoice, unattributed if absent:

```
count = number of invoices
total = Σ total
paid  = Σ total where COMPLETED
open  = Σ total where not COMPLETED
```

---

# Part 2 — How a customer is managed, end to end

The full lifecycle, in order.

**1. They arrive.** Either staff create them (Customers → quick add), or they apply
themselves at `/shop/register`. Self-registration tags them `portal`,
`storefront-signup`, `pending-approval` and gives them **no segment** — so they
cannot see trade prices yet. Approval is manual: an owner opens the customer and sets
the segment to Online / Registered.

**2. They get a segment.** One of `online` (registered/wholesale), `shop` (walk-in),
`ebay`, `amazon` — stored as a `seg:*` tag. This decides which price tier they get.
Only `seg:online` customers can log into the storefront or be billed on a wholesale
invoice.

**3. They get a trade code** (optional). Customer detail → Generate. Produces an
8-character code from an unambiguous alphabet (no I/O/0/1), stored in
`customer.portal.trade_code`. Storefront login = email + this code, and the customer
must also carry `seg:online` or login is refused.

**4. They get billed.** Either staff bill them (POS/invoice screen), or they check
out themselves on the storefront. Both create a Shopify **draft order** tagged
`portal-billing` with a sequential invoice number in `portal.invoice_no`.

**5. They pay.** Three routes, all landing in different places:
- Paid in full at the till → invoice is *completed* (stock deducts, order created).
- Partial payment on one invoice → appended to that invoice's `portal.payments`.
- Payment against the account → runs the oldest-first allocation (§1.5), auto-clearing
  whole invoices and crediting any surplus to `customer.portal.ledger`.

**6. They get their paperwork.** Per-invoice PDF, full statement, today's day
statement (plain or itemised), or an outstanding-balance demand. Sent by email,
WhatsApp, a signed public link, or bundled into a ZIP.

**7. End of day.** The digest (if enabled) emails and WhatsApps each customer their
own day summary, and sends the owner an all-customers report.

---

# Part 3 — Portal pages in detail

## 3.1 `/portal` — Dashboard

**Section: Today's takings** (dark gradient card, from `/api/reports/today`)
- Headline figure with a 3-way toggle: **All** (today's total) / **Cash** / **Card** —
  switching only changes which number is shown, no refetch.
- Four mini tiles: Retail, Wholesale, Cash, Card.
- Two more tiles: Collected today, Total outstanding (amber).
- "Latest sale" strip → links to `/portal/invoices`.
- Requires the `billing` permission (the API returns 403 otherwise, and the card
  silently doesn't render).

**Section: Stat row** — Total products · Low stock (≤5) · Out of stock · Collections.
From `/api/stats`. The "≤5" is hardcoded in the GraphQL query (§6.2).

**Section: Quick actions** — five link cards: Manage inventory, Add a product,
Import/Export, New bill/invoice, View invoices.

**Not-configured state:** if Shopify credentials are missing the API returns 503 and
the page shows an amber "Connect Shopify to begin" panel naming the env vars.

## 3.2 `/portal/billing` — Billing / POS

The most complex screen. Two modes, selected by a header toggle:

| Mode | Behaviour |
| --- | --- |
| **Wholesale invoice** | Forces segment `online`, uses the wholesale tier, **requires** a registered customer who has `seg:online`. Creates a draft (unpaid) invoice. |
| **POS (instant sale)** | Forces segment `shop`, completes immediately, deducts stock. Walk-ins allowed. |

**Left column — item entry**

1. **Barcode bar** — a text input where a USB/Bluetooth scanner types; Enter fires
   `lookupAndAdd`. A 📷 button opens the camera scanner. Feedback line shows
   "✓ Added <product>" or "No product for <code>", auto-clearing after 2.5s.
2. **Product search** — 300ms debounce → `/api/variants`. Dropdown shows image,
   title, SKU, stock count and price. Clicking adds a line.
3. **Line table** — columns Item / Qty / Unit Price / Total / ✕.
   - Qty: number input, floored at 1.
   - Unit price: editable, floored at 0.
   - Adding a product already in the cart increments its qty instead of duplicating.
   - Custom lines render an editable name field with a dashed amber border.
4. **+ Add custom item** — appends a blank line with a `custom:<timestamp>:<random>`
   id, £0, qty 1, for labour/services/one-offs.

**Right column — Summary**

| Control | Behaviour |
| --- | --- |
| **Source** (select) | The four segments. Changing it **re-prices every catalog line** to the matching tier via `priceForContext`; custom lines are untouched. Helper text names the active tier. |
| **Charge VAT (20%)** (checkbox) | Toggles the 20% line and sets `taxExempt` on the draft order. |
| **Discount** (number + %/£ toggle) | Live "= £X off" readout. Sent as Shopify `PERCENTAGE` or `FIXED_AMOUNT`. |
| **Customer** (search) | 300ms debounce → `/api/customers`. Once picked, shows the name with a "change" link. Pre-fills from `?customer=<id>`. |
| **Open invoices** (select, wholesale + customer only) | Lists **today's** unpaid invoices for that customer. Choosing one switches the button to "Add to open invoice" — a running tab. |
| **Walk-in block** (POS + no customer) | Name, Phone, Email — stored as invoice metafields, no account created. |
| **Note** (textarea) | Free text onto the draft order. |
| **Totals** | Subtotal / Discount / VAT / **This bill**. |
| **Paid by** (POS only) | cash · card · bank · other. |

**Account panel** (only when a registered customer is selected): Old outstanding,
Total due (old + this bill), a "Received now £" input with a method select and a
**pay all** shortcut, and New outstanding coloured red when > 0, green at 0.

**The submit button** changes label by context: `Charge £X & complete` (POS) /
`Add £X to open invoice` / `Create invoice`.

**What submit actually does:**

- *Add-to-tab path:* loads the open invoice, merges lines (same variant → qty adds up,
  custom items always append), PATCHes it back.
- *Normal path:* computes `payThisBillInFull = received >= total && total > 0`, then
  POSTs to `/api/billing` with `complete: mode === "pos" || payThisBillInFull`.
- *Ledger step:* if a customer is attached and money was received, it posts only the
  **surplus** (`received − total`) to the ledger when the bill itself was completed —
  otherwise the whole received amount. This is the double-counting guard.

**Validation:** blocks an empty cart; blocks a wholesale invoice with no customer;
blocks a wholesale invoice for a customer lacking `seg:online`, with a message
telling you to change the segment or use POS.

**After the sale** a green result bar appears with: **📄 Invoice PDF** (opens the
preview modal), **✓ Paid in person (mark paid)** (draft only), **+ New bill**, and an
"Open in Shopify" link. The form resets itself immediately on success.

## 3.3 `/portal/invoices` — list

Columns (chooser + sortable): Invoice · Customer · Source · Staff · Status · Date ·
Total. Invoice and Total are locked visible.

Filters: text search (number or customer), status, segment.

Buttons: open row → editor · export CSV · multi-invoice report PDF · per-customer day
statements · **ZIP of today's reports**.

Finance gating: totals are hidden unless `useCanSeeFinance()` — owner, or a member
with the `reports` permission.

## 3.4 `/portal/invoices/[id]` — editor

**Header actions:** PDF · Save · Duplicate · ✉ Send (draft only) · ↩ Void / undo paid
(completed only) · Delete.

**Line editing** (drafts only — completed invoices are read-only except payments):
product search to add, editable qty/price/title, ✕ to remove, add custom line,
change customer.

**Payments panel:** amount + method + note → Record payment; a **Pay balance (£X)**
shortcut that fills the exact outstanding; a payment list with **Revoke** per row.

**What the actions do:**
- *Save* → `draftOrderUpdate`, replacing all line items. Invoice number is untouched.
- *Complete* → `draftOrderComplete(paymentPending:false)` → creates the order, deducts
  stock, then best-effort auto-fulfils it so it doesn't sit as "Unfulfilled".
- *Void* → cannot un-complete a draft in Shopify, so instead it **cancels the order
  with `restock: true`** and tags the draft `voided`. Voided invoices are filtered out
  of every list, stat and balance by the `-tag:voided` query.
- *Duplicate* → `draftOrderDuplicate` into a fresh draft.
- *Send* → `draftOrderInvoiceSend`, i.e. **Shopify's** invoice email with a payment
  link — a different channel from the Resend PDF emails used everywhere else.
- *Delete* → `draftOrderDelete`, drafts only.

## 3.5 `/portal/customers` — list

Columns: Name (locked) · Segment · Company · Contact · Invoices (paid) · Orders ·
Total spent. Search, segment filter, column chooser, sorting.

**Quick add** form: first/last name, company, email, phone with a **country dial-code
picker**, opening balance, note, segments. Defaults to segment `shop` if none chosen.

**Today's customers panel:** who was billed today, with itemised bills, today's total,
today's paid and outstanding — and a button to build the itemised day PDF.

## 3.6 `/portal/customers/[id]` — detail

**Stat row:** Total billed · Total paid (emerald) · Outstanding · Invoice count.

**Invoices card:** searchable by number, each row showing status, total, paid and
balance.

**Payment history card:** filter chips (All / cash / card / …), and per row **Edit**
(inline amount, method, note) and **Revoke**.

**Record payment card:** amount, method, note → posts to `/api/customers/[id]`, which
**allocates oldest-first by default** (§1.5) and reports back which invoices it
auto-settled.

**Edit customer card:** first name, last name, company, email, phone, opening balance,
note.

**Segment editor:** checkboxes; saving replaces all `seg:*` tags while preserving
every other tag.

**Trade code card:** Generate (regenerates each click) + Copy, with a 1.2s "copied"
state.

**Documents:** full statement PDF · outstanding-balance demand PDF · today's itemised
statement · send today's statement by email/WhatsApp.

## 3.7 `/portal/inventory`

Columns: Product (locked) · SKU · Price (online) · Wholesale £ · Shop £ · eBay £ ·
Amazon £ · Stock status · Channels · Available (locked). **The four tier-price columns
are hidden by default** and switched on from the ⋯ Columns menu.

Filters: search (title/SKU), stock status (all / low / out / in), location.
Pagination is "Load more".

Inline edits: **Set price £** and **Set stock** per row.

Bulk bar (multi-select): activate · draft · delete · set price · set stock · add to
collection · set channels · assign barcodes · **print barcode labels** (four label
presets, copies per item, and toggles for name/price/SKU).

The low-stock threshold is a piece of component state initialised to the constant `5`
— it is never loaded from Settings (§6.2).

## 3.8 `/portal/products/new` and `/portal/products/[id]/edit`

One shared form: title, description, status, vendor, brand, model, product type
(from a 12-value list — LCD, Batteries, Cables, Chargers, Car Chargers, Adaptors,
Holders, Cases, Screen Protectors, Audio, Power Banks, Parts), tags, SKU, barcode,
base price, compare-at, all four tier prices, stock per location, images, collections,
channels.

## 3.9 `/portal/collections` and `/portal/collections/[id]`

List: collection cards with image, title, product count; create; **auto-organise**
(groups uncategorised products by type). Detail: rename, description, image,
add/remove products, and smart-collection rules shown read-only.

## 3.10 `/portal/import-export`

Three actions: **Export catalog** (.xlsx, filename dated), **Download template**
(blank, same columns), **Import** (file picker → upload). Results render as a table
with created / updated / failed counts and a per-row error message. Rows with a handle
update; rows without create.

## 3.11 `/portal/channels` — **PLACEHOLDER**

Five cards (Online Store, eBay ×2, Amazon ×2) with Connected / Not connected badges.
The state lives **only in `localStorage`** under `mi-channels-connected`. Online Store
is hardcoded always-on. Nothing here talks to eBay or Amazon — it is a manual
checklist reminding you to link them in Shopify Marketplace Connect. Product↔channel
*tagging* elsewhere in the app is real; this page's connection state is not.

## 3.12 `/portal/settings`

Eight sections:

1. **Business identity** — name, tagline, address (multiline), favicon URL with live
   preview thumbnail.
2. **Contact & legal** — email, phone, website, VAT number.
3. **Invoice footer** — bank/payment details, footer note.
4. **Defaults** — invoice prefix (with a live "MICU-2026-0001" preview), **VAT rate
   (DEAD, §6.1)**, **low-stock threshold (DEAD, §6.2)**.
5. **Automatic WhatsApp** — access token (password field, shows `••••` when saved and
   blank means keep-existing), phone number ID, template name, Save button and a
   ● Connected / ○ Not connected indicator.
6. **Daily digest** — enable master toggle, send-to-customers, send-to-owner, owner
   report email, owner WhatsApp, report-button hour (0–23), plus **Send today's digest
   now** (confirms first, then `POST /api/cron/daily-digest?force=1` and reports counts).
7. **Backup & restore** — ⬇ Download full backup (.json). **Export only** — there is no
   restore endpoint; the copy says "assisted restore", meaning by hand.
8. **Staff time-clock** — Require tap in toggle (**FLAGGED OFF, §6.4**), refresh, and
   today's shift list showing tap-in/out times, `Xh Ym` duration, and an in / out /
   auto-out badge.

## 3.13 `/portal/users`

Team list with role, permissions and a has-password indicator. Add form: name, email
(their login ID), phone, password (optional — blank means Google-only sign-in, minimum
6 characters). Edit: phone, set/reset password, and nine permission checkboxes each
with its description. Owners appear but cannot be edited or removed. Below it, a
per-staff sales table (count / total / paid / open) — **owner only**, from
`/api/reports/team`.

## 3.14 `/portal/tap-in` — **FLAGGED OFF**

Single card: password field → 🟢 Tap in, then redirect back to wherever you were
heading. Copy says you'll be clocked out automatically at 9:30pm.

---

# Part 4 — Storefront pages

## 4.1 The price gate

Three components replace prices for logged-out visitors:

| Component | Where | Text |
| --- | --- | --- |
| `PriceLockInline` | product cards | 🔒 Log in to see price |
| `PriceLockButton` | card CTA | 🔒 Log in to buy |
| `PriceLockPanel` | product page | 🔒 Trade account required + Log in / Register |

Logged-in trade customers get wholesale prices plus a green `TradeBar`: "✓ Trade
pricing active — you're seeing your wholesale prices" with a Log out button.

## 4.2 `/shop/trade-login`

Two fields: email, and trade access code (monospace, auto-uppercased). Verification
requires **both** a matching `portal.trade_code` **and** the `seg:online` tag. Sets the
signed `mi_trade` cookie and redirects to `/shop`.

## 4.3 `/shop/register`

Fields: first name, last name, business name, email (required), phone, "anything else"
note, plus a `website` field used as a honeypot. Success swaps the form for an animated
confirmation panel. Creates a `pending-approval` customer with no segment — they cannot
log in until an owner approves them.

## 4.4 `/shop/checkout`

Cart lines with qty steppers and remove. Three payment options:

| Option | Description shown |
| --- | --- |
| Cash on collection | Pay in the shop when you collect. We'll have it ready. |
| Bank transfer | We'll send bank details on the invoice; goods released on payment. |
| On account | Add to your trade account balance to settle later. |

Plus a note field ("collection time, delivery request…"). Placing the order calls
`createTradeCheckout`, which creates a draft order tagged `portal-billing`,
`storefront-trade`, `seg:online` at the wholesale prices — **unpaid**, appearing in the
portal's Invoices with the chosen method. No card is taken; no Shopify hosted checkout
is involved.

## 4.5 `/shop/account`

Profile editing (first/last name, email, phone, company), order history with balances,
outstanding total, log out. Returns to `/shop/trade-login` on a 401.

## 4.6 `/shop/contact` — **partly PLACEHOLDER**

**There is no contact form.** The page is mailto and tel links plus an address block,
all pulled from Settings, and a "Want trade pricing?" CTA. Note its "Trade login"
button points at Shopify's hosted `/account/login`, not this app's `/shop/trade-login`
— inconsistent with the rest of the storefront.

---

# Part 5 — Sending: what goes out, by which service

## 5.1 The four channels

| Channel | Service | Used for | Status |
| --- | --- | --- | --- |
| Transactional email | **Resend** | Invoice PDFs, day statements, digest | **NEEDS KEY** (`RESEND_API_KEY`) |
| Shopify invoice email | **Shopify** | `✉ Send` on the invoice editor only | LIVE |
| WhatsApp | **WhatsApp Cloud API** (Meta Graph v21.0) | Day summaries, digest | **NEEDS KEY** |
| WhatsApp fallback | **wa.me click-to-send** | Same, when no API token | LIVE |

Two different email paths exist and behave differently. `✉ Send` on the invoice editor
uses **Shopify's** own invoice email with a payment link. Everything else — statements,
day summaries, digest — goes through **Resend** with a PDF attached. If you only set up
one of the two, half your sending silently won't work.

**Email sender caveat:** `EMAIL_FROM` defaults to `onboarding@resend.dev`, Resend's
shared test sender, which **only delivers to your own Resend account address**. Real
customer delivery needs a verified domain.

## 5.2 WhatsApp specifics

Phone normalisation is best-effort E.164: strip non-digits, drop a leading `+`, strip
`00`, and convert a leading `0` to `44` (UK-assumed). Rejects anything under 8 digits.

If a template name is configured, messages send as that approved template with the
summary as the first body parameter — required for business-initiated messages outside
the 24-hour window. With no template it sends plain text, which only works inside an
open conversation.

**Without an API token** the Today's-sending drawer falls back to opening a `wa.me`
link in a new tab with the message pre-filled. Consequence: **"Send all" skips any
customer who has a phone but no email**, because the browser can't pop one tab per
customer. Those get marked done without anything being sent.

## 5.3 The daily digest

Scheduled `30 20 * * *` (20:30 UTC) in `vercel.json`.

Authorised by `CRON_SECRET` as a Bearer token, or — if no secret is set — by the
`vercel-cron` user-agent, or by an authenticated owner clicking "Send now".

Sequence: auto-tap-out anyone still clocked in → check the master toggle → check
`digestLastRun != today` (idempotency, so a double-fire sends once) → load today's
invoices → **group strictly by customer account** (walk-ins feed only the owner report)
→ send each customer email + WhatsApp → send the owner report → write `digestLastRun`.
One failed recipient never aborts the rest; errors are collected and returned.

## 5.4 Today's sending drawer

A tab on the right edge of the portal with a pending-count badge. Per customer:
**📄 Generate** (downloads the itemised day PDF) and **📤 Send** (email + WhatsApp).
Bulk: **📦 Generate all (ZIP)** and **📤 Send all**. Sent state is tracked per customer
per day in `localStorage` under `micu:done:<date>:<customerId>` — so it is **per browser**,
not shared between staff or devices.

## 5.5 Public links

Signed with HMAC-SHA256 over `inv:<id>` or `stmt:<id>:<date>` using
`PORTAL_SESSION_SECRET`. Verified with `timingSafeEqual`. The WhatsApp day summary
embeds one so the customer can open their statement with no account.

---

# Part 6 — Dead settings, placeholders and flags

The honest list. These look functional in the UI but aren't.

## 6.1 VAT rate — **DEAD**

`settings.vatRate` is saved and shown, but **nothing reads it**. The billing page uses
a hardcoded `const VAT_RATE = 0.2`, and the actual invoice tax comes from Shopify's own
tax configuration via `taxExempt`. Changing this to 5% changes nothing anywhere. To
make it real you'd have to load settings into the billing page *and* configure Shopify's
tax rates to match.

## 6.2 Low-stock threshold — **DEAD**

`settings.lowStock` is saved but never read. Two places hardcode 5 independently:
inventory's `LOW_STOCK_DEFAULT = 5`, and the dashboard's GraphQL query
`inventory_total:>0 inventory_total:<=5`. The dashboard label even hardcodes the text
"(≤5)".

## 6.3 `ENABLE_LEDGER_TODAY` — **FLAGGED OFF**

The all-customer ledger scan that would add on-account payments to "Collected today"
is disabled for performance, so `ledgerToday` is always 0 and **Collected today equals
today's completed sales only**. Set `ENABLE_LEDGER_TODAY=1` to include them, at the
cost of a paginated scan of up to 1,500 customers.

## 6.4 `ENABLE_TAPIN` — **FLAGGED OFF**

The staff time-clock gate only runs when `ENABLE_TAPIN=1`. Without it the owner's
"Require tap in" toggle in Settings does nothing — staff are never redirected to
`/portal/tap-in`. The tap-in/out API, the shift log and auto-tap-out all still work if
reached directly.

Both flags come from the most recent commit, *"Disable (not remove) the two lag sources
behind env flags"* — they were switched off to fix portal lag, not because they were
broken.

## 6.5 Channels page — **PLACEHOLDER**

Connection state is `localStorage` only. No eBay or Amazon integration exists.

## 6.6 Credit limit — **DEAD**

`Ledger.creditLimit` is in the type and preserved on read/write, but there is no UI to
set it and nothing enforces it. Billing will happily take a customer past any limit.

## 6.7 Backup restore — **export only**

`/api/backup` writes a complete JSON snapshot; there is no import counterpart.
Restoring means re-importing products via Excel and re-entering ledgers by hand.
Customer detail is also capped at the first **500** customers per snapshot.

## 6.8 Contact form — **absent**

See §4.6 — links only, and its trade-login button points at Shopify's hosted login.

## 6.9 Scale ceilings to know about

Hard limits baked into queries, which matter as the business grows:

| Limit | Where |
| --- | --- |
| 100 invoices | `listInvoices` — the invoice list, all reports and the digest only ever see the most recent 100 |
| 100 customers | `listCustomers` |
| 100 line items | per invoice detail |
| 12 products | POS search results |
| 500 customers | backup snapshot |
| 2000 records | attendance log (oldest trimmed) |

The 100-invoice cap is the one to watch: once you pass 100 invoices in a period, the
digest and the reports quietly stop seeing the older ones.
