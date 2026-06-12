# FranPOS → Supabase field map

Built from live discovery payloads pulled off **Woof Gang Windermere (loc 202684)** on 2026-06-11.
Raw payloads live in `.franpos-discovery/` (gitignored — real customer PII). This doc is the sanitized schema.

## Host & auth (settled)
- Base: `https://publicapi.franpos.com/api/` — token as `&Token=<key>` on every URL.
- `devnewapi.franpos.com` is the **internal** app API; needs a `sessionKey` from `POST store-login`, **not** our public token. Do not use.
- **One token = one location.** Multi-location needs the main (corporate) token we don't have → loop the 4 per-store tokens.
- Quota: **1,000 successful calls/month/location.** 4xx errors and `checkUsageLimit` are **free** — only 200s count. Retries are cheap.

## Gotchas (learned the hard way)
- **No colons in the URL path** — the WAF blocks `:` ("potentially dangerous Request.Path"). Datadump `fromDate` must be a **date only** (`2026-05-01`), no `T00:00:00`.
- Datadump signature: `datadump/v1/orders/{days}/{page}/{fromDate}/{locationId}?pageSize=&version=`. `days`≤30 window, paginated. Windermere ≈ 36 orders/day → `pageSize=500` = **1 page/day** incremental, ~3 pages for a 30-day backfill chunk.
- Money fields come as 4-decimal numbers, sometimes string-encoded via PostgREST later — wrap in `Number()`.
- Times: `CreatedOn` is **store-local** (EDT, −4 from the `CreatedOnUTC` seen in orderPayments). Bucket "by day" on local time.
- Customer `FirstName` is usually the **pet** name; `LastName` the owner. `DateOfBirth` = pet DOB (→ birthday campaign lever).

---

## Endpoints in the nightly/2×-daily sync

### 1. `datadump/v1/orders/{30}/{page}/{fromDate}/{loc}` — order headers ✅
| FranPOS field | → use | Supabase |
|---|---|---|
| `OrderId`, `CompanyOrderNumber` | order key | (orders staging) |
| `CustomerId` | link to customer | |
| `EmployeeId` | cashier | |
| `CreatedOn` | day bucket (local) | `metrics_daily.date` |
| `SubTotal` / `Total` | revenue, avg ticket | `metrics_daily.revenue` |
| `DiscountTotal`, `TaxTotal`, `Tips` | breakdown | |
| `ShippingOption` | **channel proxy** ("In-store" vs online/pickup/delivery) | online-vs-phone split |

### 2. `datadump/v2/orderitems/{30}/{page}/{fromDate}/{loc}` — line items ✅ (the richest)
| FranPOS field | → use | Supabase |
|---|---|---|
| `Name`, `Sku` | product identity | Products page |
| `Price`, `Quantity` | line revenue, units | `metrics_daily.retail_revenue` / `grooming_revenue` |
| **`Cost`** | **per-item margin** (retail has real cost e.g. Coconut Treats 0.41/0.99; services Cost=0) | Products page margin — **QuickBooks NOT needed for product margin** |
| `SalesPerson` | **groomer name** (per line) | groomer revenue/attach |
| `Discount` | discount attribution | |
| `RevenuAccountCode`/`CogsAccountCode` | GL (null at this store) | — |

### 3. `CustomerAnalysisReport` (POST `{StartDate,EndDate,restrictByLocations}`) ✅
551 customers for May at one store. One call powers the whole Retain panel.
| FranPOS field | → use | Supabase |
|---|---|---|
| `CustomerId`, `CustomerName` | identity | `customers` |
| `PurchaseTotal` | **LTV / spend** | `customers.ltv` |
| `DiscountsReceived` | discount depth | |
| `IsNew` / `IsReturning` / `IsMember` | **new-vs-returning, membership** | retention KPIs |
| **`ProductTypes`** `["Product"]`/`["Service"]`/`["Product","Service"]` | **cross-sell directly** (retail-only / grooming-only / both) | cross-sell bar |

### 4. `Customers/ByCompany/{page}?startDate=&endDate=` — customer master ✅
`CustomerId, FirstName(pet), LastName(owner), Email, CellPhone, DateOfBirth, Balance, RewardPoints, LocationId` → `customers` (win-back list, segments, birthday campaigns).

### 5. `walkin/company/workinghours?companyId={loc}` — hours ✅
Per-day open/close. Windermere: Mon–Fri 9–19, Sat 9–18, Sun 9–17 → **after-hours definition** for the Capture panel.

### 6. `datadump/v1/orderPayments/...` — payment mix ✅ (optional)
`PaymentMethod, CreditCardType, PaymentMethodID` + `CreatedOnUTC` (timezone anchor). Not currently shown; cheap if we want a payment-mix tile.

---

## Derivable from order history (no extra endpoint needed)

Because every order carries `CustomerId` + `CreatedOn`, the backfilled order history yields directly:
- **Return rate** (% customers with 2+ visits), **visit cadence** (avg days between visits), **one-and-done %**
- **Real cohort retention curves** (replaces the modeled curve in the seed)
- **Win-back / lapsed lists** (no visit in N days), **per-groomer return rate** (via `SalesPerson`)
- **New vs returning** (first-order date in our history; `CustomerAnalysisReport.IsNew` as cross-check)

Iron-rule note: label this **"Return rate"** on the dashboard (defined: returned for another visit), NOT "rebook rate" — strict rebook (booked next appointment at checkout) is a different metric and still gated on booking data below.

## Open items (need follow-up before these metrics are real)

1. **No-show + strict checkout-rebook** ⚠️ *the one real gap.* Both live in the booking/schedule system, which produces no order trace (a no-show generates no order at all). `walkin/booking/appointments?companyId=&dateStr=` rejects **every** date format ("String was not recognized as a valid DateTime") — likely the wrong path for appointment-based grooming (walk-in queue feature). Options: (a) ask FranPOS support for the correct public booking-status endpoint + format; (b) `POST store-login` → `sessionKey` → devnewapi `bookings` (rich: `retentionTypes`, `changeStatusStage`); (c) ship v1 with Return rate + "pending" tags on no-show/rebook. **Decision needed.**
2. **Item-level grooming vs retail tag.** `getProductServicesByCompany` returns **405** on every variant — can't pull the catalog `type` field. Fallback heuristic from orderitems: retail = numeric/barcode SKU & `Cost>0`; service = text SKU (e.g. "Nail Grind") & `Cost=0`. Good enough for v1; refine once catalog access is fixed (also unblocks stock/dead-stock).
3. **Groomer hours / utilization.** `report/timeClocks` (POST) returned "Attempted to divide by zero" on an empty range — retry with a known-staffed date range + `pageIndex`/`pageSize` in body.
4. `customers/history/{id}/{type}` returns a **PDF**, not JSON — not a data source; ignore.

## Pass-through lines — deposits & gift cards (migration 0008)

Deposit and gift-card SALES are liabilities, not revenue — the redeemed visit rings full
price later (verified: no negative redemption lines; they apply on the payment side), so
counting the sale line double-counts ~$83k/yr (~3%). Worse, these lines look like services
(text SKU, cost 0), so they were inflating grooming revenue, bookings, groomer stats, LTV,
and rebook denominators. `franpos_item_is_passthrough(name)` is the single definition:
any `…deposit…` name, or names starting with `gift card`. Kept as revenue on purpose:
"Spa Package 3 for $20", "Teddy Bear package", "Gift Bag", "Bday Gift Plush Toy" (real
delivered products). `product_sales_daily.is_passthrough` flags the rows so the Products
page can show-but-separate them. Known undercount: forfeited no-show deposits are real
revenue but indistinguishable without the booking feed.

## Independent validation — Winter Garden (2026-06-12)

- **Payments stream vs our orders, May:** $55,725.58 vs $55,725.58 — exact.
- **Portal "Sales by category", May:** net sales $46,245.48 vs dashboard $46,245.47 (1¢
  rounding). The portal report **omits deposits/gift cards itself** — independently
  confirms the pass-through exclusion. Grooming split within 0.06% ($31,379.49 portal
  service categories vs $31,398.12 ours — residual ≈ one zero-cost text-SKU retail item).
- **Cron verified:** staging written 23:05:37 UTC on schedule; one $30 ticket paid 26 min
  after the close-run is scooped by the next run's 3-day overlap (evening cron moved to
  00:30 UTC for safety). `CustomerAnalysisReport` does NOT reconcile to orders (appears
  appointment-scoped, undocumented) — never anchor displayed numbers on it.

## Backfill validation (2026-06-11)

12 months × 4 stores landed (~46k orders / 92k lines / ~370 calls; each store kept 650+ of its monthly quota). Verified against the FranPOS portal report (Windermere, May 2026, Full Groom): **ours 477 units / $44,897 vs portal 471 / $44,418 — 98.7% match, zero refund/dupe artifacts.** The residual is definitional: the portal attributes by *appointment date*, we attribute by *checkout date* (when money hit the till). Urso reports transaction-dated revenue — state this definition wherever "revenue" is shown.

Two pipeline gotchas encoded in the script:
- **Datadump pages are 0-indexed** (`pages: 3` = indexes 0–2). Starting at page 1 silently drops the first 500 rows of every window.
- **Full-year rollups need the v2 set-based functions** (migration 0007) — v1's correlated subqueries blow Supabase's 8s statement timeout; service_role timeout is now 120s.

## Net result
Revenue, avg ticket, channel, **per-product margin**, groomer attribution, customer LTV, new-vs-returning, membership, and **cross-sell** are all confirmed and buildable now (~80% of the FranPOS surface). Cost data is present → the Products page and margin work **without QuickBooks**. Remaining gaps (no-show/rebook, item-level service tag, groomer hours) all have fallbacks and don't block the first sync.
