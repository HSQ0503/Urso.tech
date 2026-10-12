# Canes ledger and recurring service implementation plan

Approved direction: October 11, 2026. Applies to the Canes website, Expo owner and crew experiences, customer invoice/agreement pages, shared APIs, and the Canes database. Implementation starts from `b46cdf1` on `codex/canes-ledger-recurring`.

The result is a simpler operations app with reliable financial reporting and independently managed recurring services. Home combines today's work and urgent actions with a compact financial summary. Money contains Services, Marketing, Workers, Expenses, and Payments. Existing signed agreements and recorded payments retain their history.

## Approved product rules

| Subject | Rule |
| --- | --- |
| Areas | North Palm Beach County is red and prefers Monday/Tuesday. Central is blue and prefers Wednesday/Thursday. South is green and prefers Friday/Saturday. Sunday is uncolored and remains available for explicit overrides. |
| Assignment | An area is selected manually on an estimate or work order, may default from the property, and travels with conversions and recurring work. Existing records remain unassigned until deliberately categorized. |
| Services | Paver Sealing, Roof Washing, House Washing, Window Cleaning, Gutter Cleaning, Paver/Concrete Cleaning, and Add Custom Service. Preserve original names and prices on historical documents. |
| Eligible recurring services | House Washing, Window Cleaning, Gutter Cleaning, Paver/Concrete Cleaning, and explicit custom services. Paver Sealing, Roof Washing, products/materials, and uncategorized historical lines are ineligible. |
| Offer | Each eligible service line can enroll independently: every 3 months at 20% off, every 4 months at 15% off, or every 6 months at 10% off. The discount applies to that service on the current invoice. |
| Pricing | Calculate the recurring discount once from the current agreed pre-tax service amount. Preserve the original dollar saving. Lock the agreed recurring dollar price for unchanged scope. A price/scope change requires fresh customer acceptance. |
| Payment eligibility | Unpaid and partially paid invoices can enroll when the revised invoice total still covers money already collected. Fully paid invoices and adjustments that create overpayment require an owner-reviewed credit/refund process. |
| Activation | Require email, verified stored-card setup, terms acceptance, future-charge authorization, and successful settlement of the discounted current invoice balance. Abandoned or unsuccessful enrollment stays pending and creates no appointment. |
| Recurrence | Anchor to the original service's actual completion date. Standalone invoices require an explicit service date. A weather reschedule does not reset the contractual cycle. |
| Automatic scheduling | Preserve the anniversary due date, then find a suitable appointment on the next matching area day within 14 days. Require a crew, duration, working hours, blocked-time rules, and configured travel buffer. Missing setup or capacity produces Needs scheduling. Sunday is never selected automatically. |
| Combined visits | Combine compatible services at the same property, on the same date and crew, into one visit and invoice. Each service retains its own agreement, discount, completion and cancellation state. |
| Future charges | Charge through Square after the service is completed and its invoice finalized. Do not charge solely because a scheduled date arrived. Additional scope/charges require the applicable customer authorization. |
| Cancel now | Before the first repeat is completed and paid, charge the original service's actual signup discount plus $50 per agreement. Show the total before confirmation. Owner can reduce/waive with an audit reason. Stop future service even if collection fails; retain outstanding debt. |
| Cancel after next | Retain one final service, complete it, bill it, and stop future generation. No initial-discount repayment or $50 fee. If its payment fails, stop future scheduling and retain that invoice as debt. |
| Obligation satisfied | After the first repeat is completed and paid, the original early-cancellation obligation ends. It does not restart each renewal. |
| Worker earnings | Approved actual time with effective-dated rate snapshots; manual corrections for missing time. Separate estimated, earned, unpaid and paid amounts. |
| Upsells | Configurable commission percentage per worker, off until configured. Apply to additional approved service revenue actually collected, net of discounts/refunds and excluding tax/tips. No renewal commission. Refunds produce visible adjustments. |
| Reporting | Cash received/spent follows payment dates. Job/service profitability follows associated revenue and costs. Directly assign costs when known; otherwise allocate shared cost by discounted pre-tax service value and label it allocated. Never deduct earned wages and their payment twice. |
| Attribution | Save a primary channel on each job/opportunity. Recurring services inherit their enrollment channel; new work can use a different channel. Period ROAS is attributed collections divided by period spend. Booked revenue is separate. Unknown attribution remains visible; zero spend returns N/A. |
| Marketing inputs | Manual dated expenses and period ad-spend totals first. Provider ad-spend synchronization is deferred. |
| Ledger migration | One reviewed import from Sebastian's export. Preview duplicates/conflicts and reconcile before applying. Canes becomes the maintained record after cutover. |
| Existing agreements | No automatic conversion to new discounts, fees or card charging. Replacement agreements require customer acceptance. |
| Presentation | Minimal dark Canes interface, plain sans-serif type, compact records, readable bar charts, explicit values, clear actions, and shared names across web/mobile. Preserve unrelated Woof Gang, platform admin, Brain and marketing surfaces. |

## Current implementation constraints

- Web reads domain functions and uses server actions. Mobile uses `/api/v1` adapters over the same domain functions and guards. Money remains owner-only. Crew reads stay assignment-scoped.
- `recurring_plans` and `jobs.plan_id` currently represent a whole-job agreement. `create_canes_repeat_plan` deduplicates by source document, and invoice conversion copies all items. New service agreements need independent identities and visit membership.
- Document revision SQL deletes/recreates item rows. Subscription identity cannot depend only on the current `invoice_items.id`. Introduce a stable service-line identifier and retain immutable source/revision snapshots.
- Existing repeat-time configuration can activate/mint a plan without signing. New offers must use explicit acceptance/payment states; legacy `active` does not prove new terms or card authorization.
- Four-month cadence is absent. Existing SQL has 12-month fallbacks. Update every validation and date calculation together, preserving legacy monthly/yearly plans.
- Native `theme.ts` and ledger primitives are shared with Woof Gang/admin. Scope Canes design changes rather than changing shared exports globally.
- Web standalone invoice/job creation currently uses one description and total. Add proper service-line creation so enrollment does not infer multiple services from free text.
- Existing employee payments are already Labor entries in `business_expenses`. Do not restore the old payout waterfall as the new worker ledger: it can deduct those payments plus estimated scheduled-hour labor.
- Existing service revenue uses fully paid invoice lines while headline revenue uses collections. Some reports deduct the whole job cost in each period with a payment. Replace inconsistent aggregates with shared, documented reporting rules.
- Current UI readers have row limits. Reports and exports must query database aggregates or paginate instead of summing the current screen's truncated list.

## Shared architecture and schema

### Service and property identity

Add nullable `service_area` to property/address and document snapshots (estimates, jobs, invoices and legacy recurring plans). Define stable area codes, labels, colors and weekday rules in `@urso/types`. A document override is explicit; changing a property's default never silently moves existing appointments.

Add stable service categories to the catalog and line snapshots. Keep active standard catalog options compact; retain historical catalog IDs, original descriptions and custom-service descriptions. Add a stable `service_line_id` that survives revisions, with source document/revision linkage. A replacement line representing different work gets a new identity.

### New recurring agreements

Use separate service-agreement records alongside legacy `recurring_plans` during migration. Each record contains customer/property, source invoice and stable service line, area, original service date, cadence, original agreed amount, signup savings, locked future amount, signed terms version, card authorization reference, activation/payment evidence, first-repeat fulfillment, cancellation intent, and next due date.

Separate the agreement, service occurrence, appointment, invoice line and charge attempt. A unique `(agreement_id, cycle_due_on)` prevents duplicate occurrences. Visit membership can link several occurrences to one work order without merging agreements. The legacy `jobs.plan_id` remains valid for old plans; new records use explicit occurrence membership.

Preserve immutable acceptance evidence: offer version, invoice revision, selected service/scope, before/after price, cadence, dollar savings, cancellation terms, authorization timestamp and the customer action. Never store raw card numbers or CVV.

### Financial records

- Reuse `payments`, `payment_refunds`, `job_expenses`, dated `business_expenses`, and `expense_rules` as source ledgers.
- Add stable marketing channels, expense/channel links and attribution snapshots without replacing the legacy ingestion-source enum.
- Add approved time/rate snapshots, commission earnings/adjustments and earning-to-payment allocations. Existing paid history can become reviewed opening balances instead of invented hours.
- Add service cost allocations with provenance: direct, allocated or unknown. Use integer cents and deterministic remainder allocation so detail totals match headers.
- Record payment method separately from provider. Card is a method; Square is a processor. Keep historical Other values until explicitly corrected.
- Add import batches/staged rows with source identifiers and idempotent application; preserve import provenance and conflicts.

### Security and API contract

All new tables use the Canes project's existing service-role access pattern, RLS and restrictive grants. Privileged RPCs are not callable by anonymous/authenticated database clients. Every public customer operation resolves a narrow token to its agreement/invoice, validates current state, and exposes no owner-only data.

Keep `/api/v1` envelopes and qualified success notices. Add optional response fields before requiring new request fields. Older mobile mutations must preserve new metadata rather than erase it. Reject edits that old clients cannot safely perform on a new accepted/charged agreement with a clear update-required notice.

## Enrollment and billing workflows

1. Owner finalizes itemized scope and makes eligible invoice lines available for an offer. Backend calculates the offer from the current invoice revision and existing payments.
2. Customer chooses cadence per eligible line. Display current balance, discount by line, recurring price, first due date and cancellation obligation before acceptance.
3. Customer accepts each agreement's terms and card authorization. Capture card details through Square's supported frontend tokenization, then store only verified customer/card references.
4. Acquire the existing invoice billing/revision lock. Recheck price, payments, refunds, credit and revision. Retire/reconcile old provider links before replacing an invoice with a discounted balance. Any unknown provider result stays unresolved, not replayed under a new key.
5. Persist the acceptance and proposed discount consistently, publish the reconciled current invoice, and settle its balance through the supported Square invoice flow. Keep enrollment pending until verified payment evidence arrives.
6. On payment completion, atomically activate eligible agreements and create their first service occurrences. Duplicate callbacks or reloads cannot create another discount/agreement/charge.
7. Generate one future occurrence per active agreement. Use calendar months with anchored-day clamping, Eastern time and the configured scheduling constraints. If compatible, group occurrences into one appointment.
8. At service completion, finalize the invoice and publish its authorized card-on-file payment request. Completion alone does not bill unfinished, disputed or changed scope.
9. Reconcile provider events into the existing payment ledger and service allocations. Notifications report actual state: pending, paid, failed, or action required.

Square Invoices remains responsible for collecting published invoice payments. It cannot be combined with a direct Payments API charge against the same invoice/order. Card-on-file invoice collection requires customer email and email delivery. Use Square's failure notification/payment-link behavior initially, plus Canes owner alerts. Repeated business charge attempts require explicit recovery; transport retries reuse the same idempotency key and reconcile uncertain outcomes.

Public customer card setup, enrollment and cancellation are responsive web pages opened from SMS/email and mobile links. This avoids requiring customer installation or a new native payment SDK solely for card entry.

## Cancellation workflow

Create a revocable, narrow token for a specific agreement when the owner selects Send cancellation link. Send through the existing consent-aware manual SMS path, with durable delivery history. Reissuing replaces the previous active link. Tokens expire after a configurable short window; expired links request a fresh one from the owner. Do not log raw tokens.

On opening, resolve current agreement state and show both available outcomes with exact amounts and the final visit date. A token authorizes only its agreement. Revalidate the offer at confirmation so a stale page cannot assess an outdated fee or cancel another service.

Cancel now stops future generation and removes only that agreement's unperformed occurrences from combined visits. Before the obligation is satisfied, create the approved repayment/fee invoice once. If collection fails, retain the receivable and cancellation; do not keep creating jobs. Owner waivers/reductions require reason and audit history.

Cancel after next records the final occurrence identity. Do not create later occurrences while it is pending. Completion ends service generation even if payment is still outstanding; the final invoice remains collectible without adding the initial-discount repayment or $50 fee. Customer weather reschedules retain the final occurrence identity.

## Website and mobile screens

| Surface | Website | Expo app | Shared behavior |
| --- | --- | --- | --- |
| Home | Replace the launcher-first emphasis with today's work, urgent leads/payment issues and a concise cash summary | Same priorities with native rows and sheets | Role-aware queue and financial summary; owner-only money |
| Documents | Itemized manual estimate/job/invoice builders, standard services + custom, area picker | Update actual native estimate/invoice/job editors, not legacy redirect screens | Validated category/area metadata, stable lines, preserved deposits and revisions |
| Schedule | Area labels/tints on day headers; tagged unscheduled rows; due versus appointment dates; exception warnings | Same day colors, area badges and scheduling constraints | Manual exceptions permitted; automatic scheduling never guesses or double-books |
| Recurring | Service agreement list/detail with next due/appointment, initial obligation, payment method/status and cancellation actions | Native list/detail and Send cancellation link action | Separate agreements and grouped visit membership |
| Customer invoice | Per-line offers, T&C acceptance, verified card setup and accurate current balance | Open the same secure customer URL where needed | Source invoice revision and payment state revalidated on every mutation |
| Customer cancellation | Agreement-scoped cancel-now/cancel-after-next page | Owner sends/tracks link; customer uses responsive page | State machine, exact fee, consent, no cross-agreement cancellation |
| Money | Services, Marketing, Workers, Expenses, Payments and export tabs | Same shared report contracts, native compact charts/lists | Identical periods, definitions, filters and totals |
| Workers | Approved time, rates, earnings, commissions, partial payouts and history | Native approval/log-payment flows where permission allows | Preserve paid history; recording is bookkeeping, not payroll transfer |
| Import/settings | Reviewed ledger import, channels, crew availability/buffers, stable service configuration | Operational settings appropriate to phone; import review can remain web-led | No migration guesses; changes audit and invalidate affected queries |

Use plain sans-serif headings, readable sentence-case labels and tabular numbers. Keep cards compact, action labels explicit, chart labels complete and touch targets at least 44 points. Preserve loading, empty, error, offline and permission-denied states. Area colors carry labels and do not replace existing crew/status meaning.

## Reporting definitions

- Cash collections: completed payment movements minus refund movements within the selected Eastern-time period. Deposits count when collected and are not counted again with the balance.
- Cash spending: actual paid expenses and worker-payment movements within the period. Recurring rules generate dated occurrences once; no parallel prorated duplicate ledger.
- Profitability: associated net service revenue less direct/allocated job costs and earned labor, with estimates/unknowns identified. Keep this separate from cash flow.
- Service revenue: allocate invoice-level discounts, payments and refunds in cents with deterministic remainders. Preserve sales tax and tips outside service revenue.
- Marketing: period attributed collections / period spend, excluding tax/tips and net of refunds. N/A at zero spend. Show booked value separately and retain acquisition dates for cohort inspection.
- Worker balance: approved wages + earned commissions + adjustments - allocated recorded payouts. Rate changes affect future earnings only. Refund commission reversals are new entries.
- Exports: same source query and filters as the UI, explicit timezone/date basis, stable IDs and safe CSV escaping. No hidden screen row limit.

## Implementation milestones

### M1 Area and service foundation

- [x] Shared area contracts and validation.
- [x] Shared service-category contracts and validation.
- [x] Additive area migration with nullable document metadata, inheritance and protected mutations, verified in isolated PostgreSQL. Production application remains a release step.
- [x] Web and native area assignment on estimate/work-order creation and editing.
- [x] Calendar day area labels/colors on both surfaces and shared scheduling exception notices.
- [x] Standard service choices and custom creation; archive obsolete choices without deleting history.
- [x] Area inheritance, explicit overrides, historical preservation and old-client header edits tested.
- [x] Category/stable-line revision coverage follows catalog work.

### M2 Simpler Canes workspace

- [x] Scope the Canes theme and reusable native primitives away from Woof Gang/admin.
- [x] Replace decorative type/header furniture and simplify high-use lists/forms.
- [x] Combined home screen and clear Money entry across web/mobile.
- [x] Complete standalone web job/invoice line-item parity.
- [ ] Browser/iPhone usability checks for sheets, keyboard, navigation, chart labels and accessibility.

### M3 Financial ledger and historical import

- [x] Shared database-backed cash and profitability reports without truncated client-side sums.
- [x] Marketing channels/spend/attribution and service-cost allocations.
- [x] Approved timesheets, effective-dated rates, upsell commissions and payout allocation.
- [x] Payment-method detail, expense occurrences and CSV export.
- [x] Web/mobile Money views use the same contracts and calculations.
- [ ] Stage Sebastian's export, preview conflicts, reconcile totals and apply only approved rows. The actual import requires the export, which is not yet supplied.

### M4 Service agreements and customer enrollment

- [x] Stable line identity and source/revision snapshots.
- [x] Independent agreement/occurrence/visit membership model alongside legacy plans.
- [x] Three/four/six-month offers and eligibility, immutable prices and initial savings.
- [x] Terms/card authorization/email capture and pending enrollment state.
- [x] Invoice lock/revision/provider reconciliation and verified initial payment activation.
- [x] Public invoice UI plus owner web/native status and recovery controls.

### M5 Automatic visits and cancellation

- [x] Due dates, 14-day area/capacity search, explicit missing-setup state, compatible visit grouping.
- [ ] Separate service completion inside a combined work order.
- [x] Finalized post-service Square invoice autopay, failure notification and recovery links.
- [x] Agreement-scoped cancellation links, fee waiver/audit and independent collection state.
- [x] Final-visit termination and obligation fulfillment without duplicate work or charges.

### M6 Release and operating verification

- [ ] Apply reviewed additive migrations to the correct Canes project and verify checksum ledger/grants.
- [ ] Deploy backward-compatible backend before web/native enrollment features.
- [ ] Run full automated checks and role/payment/scheduling acceptance matrices.
- [ ] Prove Square sandbox customer/card setup, publication, successful charge, decline, uncertain response and webhook ordering.
- [ ] Perform controlled production verification only with designated test records/recipient/payment method. No ordinary customer is a test subject.
- [ ] Release mobile through the appropriate EAS channel/runtime; produce a new signed store binary if native dependencies/config/runtime change. Verify App Store processing separately from build success.
- [ ] Enable new enrollment/scheduling/autopay independently after their checks. Existing automations and old signed contracts keep their established behavior.

## Files and ownership of behavior

- Shared contracts and pure calculations: `packages/types/src/`.
- Domain workflows: `lib/canes/recurring.ts`, new service-agreement/scheduling/reporting modules, `square.ts`, `analytics.ts`, `revenue.ts`, `expense-ledger.ts`, `payouts.ts`.
- SQL: additive files in `supabase/canes/`, including protected transaction functions and non-destructive data backfills.
- Web mutations: existing `app/CanesPressure/actions.ts`, `document-actions.ts`, `expense-actions.ts` delegate to focused domain functions. Avoid adding another unrelated monolith.
- API adapters: `app/api/v1/canes/`; retain `lib/api/v1.ts` authentication and permission distinctions.
- Web UI: `app/CanesPressure/(app)/`, document/schedule/recurring/settings/expense components, `canes.css`, customer `i/[token]` and agreement/cancellation routes.
- Native UI: owner/crew route groups, Canes-specific theme/components, `src/api.ts` and `src/queries.ts`. Keep query invalidation shared by workflow.
- Tests: isolated PGlite migrations/workflows, existing mobile screen harness, focused browser layout/flow checks and provider sandbox verification.

## Acceptance matrix

| Scenario | Required result |
| --- | --- |
| Old mobile edits a tagged document | Area/category/accepted agreement metadata survives or the edit is explicitly refused |
| Estimate to job to invoice, then revision | Stable service identity and area survive; historical snapshots remain available |
| Quarterly house wash plus semiannual windows | Two agreements, independent prices/terms/cancellation; compatible dates can share one visit |
| Duplicate enrollment confirmation/webhook | One discount, agreement, occurrence and payment |
| Current invoice changes during signup | Requote before acceptance; no stale amount charged |
| Partial payment exceeds discounted total | Owner-reviewed credit/refund path; no automatic refund or lost deposit |
| Card setup succeeds but payment fails | Pending enrollment, no active future service |
| Provider timeout after publication | Reconcile the same operation; no second invoice/charge with a fresh key |
| Four-month cycle, month end, DST, device abroad | Correct anchored calendar month and Eastern date/time |
| No crew/hours/duration/area or no capacity | Needs scheduling, no guessed slot or duplicate booking |
| Combined visit, one agreement canceled | Remaining services and amounts stay intact |
| Cancel now, card declines | Future work stops, outstanding fee invoice remains visible |
| Cancel after next, final payment declines | No later visits; only final invoice remains due |
| Owner waives fee | Reason and actor recorded; no automatic later collection of waived amount |
| Deposit, balance and refund in different months | Correct cash movements; costs/labor not duplicated across periods |
| Worker rate change and partial payout | Historical earning rate unchanged; earned/owed/paid reconcile |
| Refunded upsell | Commission adjustment retained in history |
| Unknown service/channel/method or missing cost | Honest uncategorized/unknown states, no fabricated ROI or margin |
| Import rerun | No duplicate jobs, payments, worker payouts or expense occurrences |
| Report exceeds existing row caps | Totals and CSV remain complete and agree |
| Owner, restricted ops, assigned/unrelated crew, anonymous | Existing role boundaries hold across web/API/native/public tokens |

## Validation and deployment sequence

Run root `npm run lint` and `npm run build`; Canes workflow and messaging suites; mobile `npm run typecheck` and `npm test`; Expo export for changed screens; schema drift and permission checks. Test each migration chain in isolated PostgreSQL before applying it. UI verification covers narrow phone and desktop layouts, long names, larger text, empty/error states and keyboard behavior.

Use a separate test backend/provider sandbox for payment and mutation tests. The current EAS preview profile points to production, so it is not an isolated backend by itself. Do not run the existing API acceptance script against production until its login-code side effects are isolated.

Release small compatible stages. Do not hide unfinished enrollment behind a button that appears to charge or schedule successfully. New financial state is additive; rollback disables new enrollment/automatic scheduling/charges while retaining agreements, acceptance evidence, invoices, debts and provider history. A code rollback never deletes money history or resurrects canceled work.

## Provider references

- [Square Cards API](https://developer.squareup.com/docs/cards-api/overview)
- [Create and publish Square invoices](https://developer.squareup.com/docs/invoices-api/create-publish-invoices)
- [Square invoice payment and failure behavior](https://developer.squareup.com/docs/invoices-api/pay-refund-invoices)
- [Square idempotency](https://developer.squareup.com/docs/build-basics/common-api-patterns/idempotency)
- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)

## Progress — October 12, 2026

Implemented in the 0.1.4 release:

- Six standard services plus custom, archived catalog history, stable line identity, itemized manual jobs/invoices, and category editing on web/native revisions.
- Scoped dark Canes design with plain sans-serif headings; work-first Home and shared Money reporting across website and Expo. Other workspaces retain their theme.
- Cash and service profitability, marketing attribution/spend, approved time and rate snapshots, upsell commission/refund adjustments, payout allocation, payment classification, and matching CSV exports.
- Owner-reviewed CSV staging for customers, completed work, existing-invoice payments, expenses, and worker opening adjustments. Duplicate source IDs and matching live records are checked again when applying. The original Claude export has not been supplied; no historical data has been imported.
- Independent service agreements with 3/4/6-month pricing, verified Square card references and acceptance evidence, current invoice reconciliation, settlement activation, area/capacity scheduling, compatible visit grouping, and owner-finalized billing.
- Customer cancellation links, initial-savings repayment plus fee, audited reductions, cancel-after-next termination, fee collection recovery, and permanent fulfillment after the first paid repeat. Existing signed plans remain separate.

Validation completed locally: root build and lint (18 existing warnings, zero errors), mobile typecheck, iOS bundle export, 43 database/provider adapter tests, 49 mobile tests, and 38 messaging integration scenarios. Browser checks cover narrow invoice entry and desktop Money/import layouts. Tests use isolated PostgreSQL and mocked provider responses; no live customer card was charged and no customer messages were sent. A physical iPhone walkthrough and a controlled Square sandbox/live-payment exercise remain operating verification steps, not proven outcomes.

New recurring offers are off on every existing invoice. Owners must explicitly enable an offer after checking its completed service date, categorized scope and price. Missing scheduling setup remains visible as Needs scheduling. The existing Meta introduction flag remains disabled pending its separate consent/recipient test.

Production migration/deployment and signed iOS archive verification are recorded in the release receipt after they complete. The archive is delivered to Han for manual Transporter upload; this task does not submit to Apple.
