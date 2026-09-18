# Sebastian's Canes fixes: implementation and verification

All product decisions are accepted in [the decision log](./sebastian-fixes-decisions.md). This plan covers the 15 requests in the source PDF, including the repeated request for recurring dates and times. It applies to Canes owner mobile and browser interfaces. Crew capabilities and Woof Gang remain intact.

## Delivery boundaries

- Implement and verify locally. Do not send customer messages, charge/refund cards, create production jobs, run production cron, or deploy while developing.
- Keep the current customer terms until Sebastian supplies the exact Markate terms. Do not present existing seeded terms as his Markate text.
- Preserve existing working-tree changes. Keep database migrations additive and retain signed/payment history.
- Ship coordinated server, schema, and mobile changes only after the complete change set passes its checks. A migration file or compiled mobile bundle is not deployment evidence.

## 1. Form identity and mutation correctness

Prerequisite for R05, R07, R08, and R14.

- Add regression coverage for opening invoice A, opening B in the retained tab, and saving B. Assert both the displayed customer and submitted ID/fields.
- Key editors and previews by record ID. Give each new-document entry a distinct draft key. Preserve a partially entered form when navigating to a picker, but reset it for a different document or fresh creation.
- Centralize invalidation groups for documents, jobs, customer history, schedule, and financial reports. Resolve missing job/invoice/report invalidations after payments, cancellations, and expenses.
- Preserve server refusal and qualified-success sentences. Display payment refusal inside the responsible modal. Show scheduling warnings after successful booking.
- Test with the real React screen/handler harness and real TanStack Query behavior where invalidation is the subject.

Primary files: mobile invoice/estimate/job/plan routes, `src/query.tsx`, `src/queries.ts`, shared sheets, and `tests/workflows.test.cjs`.

## 2. Shared price, revision, and accounting contracts

Supports R07, R08, R09, and R14.

- Define one service-line contract for quantity, unit cents, discount mode/value, calculated discount cents, taxable state, and net line cents. A discount applies to the extended line subtotal before tax.
- Reuse a pure shared calculator in browser/mobile previews and server validation. Server-persisted totals remain authoritative. Reject invalid quantities, excess discounts, and unsafe integer values.
- Add preserved document revisions/acceptance snapshots. A revision records exact lines, totals, customer details, terms, version, author, timestamp, and agreement source.
- Implement preview and apply operations for changes to linked estimate/job/invoice records. Bind apply to the previewed version so concurrent edits, sends, or payments force a refresh.
- Reuse existing invoice financial leases and locked RPCs. Retire a live Square page before changing its payable balance. An ambiguous provider result blocks the financial mutation and leaves a recoverable operation record.
- Keep payment ledger rows unchanged by price edits. Calculate overpayment separately from balance due. Customer credit is not newly collected revenue.
- Record manual refunds only against existing eligible manual payments. Card refunds continue through Square's signed webhook. Keep idempotency and refund caps.
- Applying credit to another invoice must atomically reserve the available credit, update invoice settlement, and avoid creating new collected cash. Preserve links to the original payment and receiving invoice.

Primary files: `packages/types`, document actions/domain modules, invoice API routes, `lib/canes/square.ts`, and additive Canes SQL migrations. Validate state transitions with an isolated PostgreSQL-compatible test database and mocked Square outcomes.

## 3. Editable estimates, work orders, and invoices

Implements R07, R08, and R14.

- Provide Edit and Resend for current documents, including accepted estimates. Preserve their earlier signed snapshots.
- Add line editing to work orders. Keep priced lines separate from procedural checklist-only rows.
- Add fixed-dollar/percentage line-discount controls to all three editors and show the discount in previews, public views, and generated invoices.
- Show which linked records a pricing change affects before saving. Use the shared revision operation on mobile and browser.
- For revised estimates, offer resend for signature or explicitly recorded phone/in-person approval. Display the source and date of each agreement.
- Add manual decline. For accepted work, show linked open jobs/invoices and require the explicit cancellation operation. Preserve completed work and payments.
- Carry discounts, adjustments, tax, and collected deposits through conversion. Fix the existing recurring conversion discrepancy between displayed source totals and copied lines.

Acceptance examples: discounted quantity >1, $1,000 to $800 with $300 collected, partial payment racing an edit, paid bill reduced below receipts, old signed view remaining unchanged, and failed provider-link retirement producing no changed chargeable total.

## 4. Signature capture and terms

Implements R01 and R02.

- Add browser customer signature capture with drawn strokes, printed name, agreement checkbox, and keyboard-accessible controls. Validate size/shape server-side and store inert signature data rather than arbitrary HTML.
- Atomically bind the accepted document version and its terms to the signature. Reject an approval if the displayed version changed.
- Show signer, signature, exact accepted totals/terms, approval date, and agreement source on owner mobile/browser detail views.
- Reuse the existing approval notification event, with navigation to signed estimate evidence. Do not create duplicate approval alerts.
- Keep current defaults until the supplied Markate text is available. Changing defaults affects new revisions/documents, not old signatures.

Primary files: public approval component/page, estimate actions/domain, acceptance storage, push event link, owner previews, and settings.

## 5. Delete, archive, and simplified Work Orders

Implements R05, R13, and R15.

- Permanently delete only unused drafts without linked business history. Archive other eligible documents with an audit timestamp and actor.
- Filter archived records out of normal lists while retaining an explicit archived-records view for history and restoration where appropriate.
- Preview cancellation/payment-link effects before archiving open work. Reuse the guarded cancellation and financial-retirement paths.
- Show one Work Orders list ordered by creation descending, with status on each row. Remove the status tabs. Swipe-left and the detail action use the same server operation.
- Remove owner checklist and job-photo sections and their entry points on mobile/browser. Preserve crew screens, data, and procedural checks.
- Ensure archived/canceled work leaves the active calendar and that cache invalidation refreshes every affected list and linked document.

Primary files: list/domain readers, document action routes, owner jobs/detail, browser jobs page/navigation, browser job detail sheet.

## 6. Scheduled repeat work

Implements R12.

- Store repeat time, original day-of-month anchor, duration, crew, next occurrence date, and explicit scheduling-enabled state. Keep optional agreement state separate from scheduling state.
- New repeat schedules become active immediately. Preserve existing agreements but require confirmation of missing scheduling fields before enabling old plans.
- Create the next future scheduled job immediately. A time-driven generator advances when that occurrence's date passes, regardless of completion status.
- Preserve Eastern wall-clock time, clamp short months against the original anchor, and do not silently generate historical jobs after downtime.
- Copy service/discount snapshots and crew/duration. Do not copy receipts or automatically send invoices. Existing customer reminders apply to generated jobs.
- Mint the job, its lines, occurrence marker, and next due date in one locked transaction. Keep the unique plan/date constraint and handle retries without skipping missing line data.
- Record and surface crew overlaps without changing the requested time.
- Offer this-visit and this-and-future edits. Separate skip visit, pause, resume, and stop series. Existing signed cancellation terms remain tied to their agreement, and any fee invoice requires explicit owner action.

Primary files: recurring schema/domain/actions/routes, cron, shared recurring form, plan detail, schedule and job readers. Tests cover Jan 31/Feb/Mar, leap years, EST/EDT, duplicate cron runs, pause/edit races, and failed item insertion rollback.

## 7. Dated recurring expenses and employee payment records

Implements R10 and R11.

- Separate recurring expense rules from dated occurrences. Uniquely identify rule/date occurrences and generate only through today from the configured cutover date.
- Preserve legacy data. Do not fabricate historical paid charges. Retain source IDs and explicit legacy/cutover treatment so reports do not count both templates and occurrences.
- Support edit occurrence, change future rule, skip occurrence, pause, and end. Stopping a rule preserves prior expenses.
- Add employee payment records with employee, positive integer amount, paid date, method, note, and idempotency key. Use the existing roster with appropriate owner-only controls.
- Display recurring expenses in their actual months. Display employee history and monthly/all-time totals under Expenses.
- Count employee payments once as Labor expense. Exclude the old estimated-hourly deduction from the same updated profit calculations. Do not confuse payout overrides with actual payments.
- Remove the Payouts destination from mobile/browser navigation and redirect old URLs to the employee expense view.

Primary files: overhead/expenses/reporting modules, expense API, Expenses screens, navigation, additive rule/occurrence/payment tables. Tests cover monthly generation, retries, pause/edit/end, cutover behavior, and labor counted once.

## 8. Branded reminders and customer job page

Implements R04 and R06.

- Add revocable random job tokens for a read-only customer page. Return only customer-facing date/time, address, services, deposit, and balance. Exclude gate codes, crew/private notes, expenses, and internal identifiers.
- Use the supplied Canes reminder wording and 561-537-5674 contact number, filling name/date/time/job link from the current booked job.
- Stop requesting YES and prevent silence-based cancellation for the affected booked-job flow. Preserve explicit incoming reschedule/cancellation requests as owner alerts.
- Normalize reminder deduplication to job plus scheduled instant. Rescheduling retires the old task and creates the new one. Handle bookings inside 24 hours once, without reminder bursts or messages for past/canceled work.
- Update both immediate estimate texts and queued estimate sends to identify Canes and address the customer. Preserve consent and quiet hours.
- Treat provider acceptance, queued delivery, and confirmed delivery as distinct states. Never claim a queue item exists without persisting it.

Primary files: job schema/public page, templates, actions, cron/task sender, inbound handling, estimate notifications. Provider interactions remain mocked during tests.

## 9. Browser parity and mobile integration

Implements R03 and integrates every feature above.

- Add browser Work Orders and Recurring destinations using the same domain functions as mobile.
- Replace obsolete owner navigation and payout controls. Match the single work-order list, date-aware calendar, expense history, editable documents, and signature visibility.
- Preserve existing Canes visual tokens while simplifying content. Reuse shared native sheets and browser form patterns.
- Verify responsive desktop/mobile widths, keyboard-safe forms, navigation history, empty/error/stale states, accessible controls, and local-state resets.
- Make each mutation invalidation part of its feature acceptance check. Add focus refresh where external changes can otherwise leave retained screens stale.

## Verification and completion evidence

1. Run targeted failing tests before fixes where a reported bug has a reproducible seam.
2. Run mobile workflow tests and TypeScript checks after each coherent slice.
3. Validate new SQL, constraints, roles, transactions, retry behavior, and money invariants in an isolated local database. Do not treat TypeScript as database validation.
4. Run root TypeScript, lint, and build against the integrated change set. Record pre-existing warnings separately.
5. Run API guard/validation checks against a local server with provider mocks and isolated data. Confirm public signature/job pages expose only their intended data.
6. Render browser journeys and mobile simulator journeys against isolated fixtures. Do not start a production-backed app that can register push or trigger writes while claiming a read-only check.
7. Review the full diff for cross-record edits, lost notices, concurrent writes, unsigned financial changes, and migration compatibility. Verify every R01-R15 row against implementation and tests.
8. Report separately: implemented, locally tested, migration pending/applied, deployed server SHA, mobile bundle/build, and observed device behavior. Exact Markate text remains pending until supplied.

## Current progress

- [x] Inspect all seven PDF pages and screenshots.
- [x] Complete product interview and record Q1-Q22.
- [x] Prepare request-by-request implementation plan.
- [x] Form identity and invalidation prerequisites.
- [x] Shared financial revisions and discounts.
- [x] Signature evidence and terms integration.
- [x] Archive/delete and owner simplification.
- [x] Scheduled repeat work.
- [x] Dated expenses and employee payments.
- [x] Reminder and public-job experience.
- [x] Browser/mobile implementation, local build checks, isolated database tests, and browser smoke checks.
- [ ] Staging provider integration and native-device acceptance before release.

See [the verification handoff](./sebastian-fixes-verification.md) for the exact evidence and release boundaries.
