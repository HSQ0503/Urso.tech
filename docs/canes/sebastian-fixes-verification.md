# Sebastian's fixes: local implementation and verification

**Production status, 2026-09-18:** application commit `c36bd385c0fc8611a19e43b86f9ab2f9ae57bed7` is pushed to `main` and deployed to [urso.ws](https://urso.ws). All four Canes migrations are applied. Signed iOS build **0.1.0 (15)** is downloaded and verified for manual Transporter upload. It has not been submitted to App Store Connect.

Existing customer terms remain unchanged until Sebastian supplies his exact Markate text, as agreed in Q13.

The [decision log](./sebastian-fixes-decisions.md) records Q1–Q22. The [implementation plan](./sebastian-fixes-plan.md) describes each change and its acceptance checks.

## Request coverage

| Request | Implemented behavior |
| --- | --- |
| R01 Terms | Retain current terms; capture accepted terms in preserved document snapshots. Exact replacement text is still pending. |
| R02 Signatures | Drawn signature, printed name, consent checkbox, version check, owner acceptance history, and approval notification opening the estimate. |
| R03 Browser | Home launcher, revenue dashboard, Work Orders, recurring schedules, expense/payment controls, revisions, and archives. Phone and desktop layouts were inspected locally. |
| R04 Job reminders | Informational 24-hour reminder with Sebastian's wording, contact number, and a public job-details link. No customer confirmation is demanded by this booked-job reminder. |
| R05 Delete | A locked database operation permanently deletes only unused drafts. Other records are archived, open work/payment links are canceled through existing guarded operations, and historical payments remain. Archive restoration restores visibility only. |
| R06 Estimate texts | Immediate and queued estimate texts identify Canes and greet the customer. |
| R07 Manual decisions | Owner approval and decline. Decline checks open linked work and unpaid invoices while retaining completed work and payment history. |
| R08 Revisions | Preview linked effects, preserve signed snapshots, choose renewed signature or recorded verbal agreement, retire current card links, and retain actual receipts. Repeating work defaults to this visit; future scope is explicit. Billed future visits require individual corrections. |
| R09 Deposits | Job-to-invoice conversion attaches receipts once and carries prices, line discounts, adjustments, and tax. Payment requests use the remaining balance. |
| R10 Expenses | Dated recurring occurrences, unique rule/date generation, edit/skip occurrence, pause/resume/end rule, and an explicit migration cutover without invented historical charges. |
| R11 Employee pay | Payouts navigation removed and old URLs redirected. Expenses records actual employee payments, date, method, note, monthly/all-time totals. Updated profit calculations do not also deduct estimated hourly labor. |
| R12 Recurring work | Date/time, Eastern wall time, original monthly anchor, crew and duration, immediate next scheduled visit, retry-safe generation, optional agreement, legacy scheduling confirmation, scope choices, and overlap flags. Receipts and invoices are not copied automatically. |
| R13 Owner clutter | Owner checklist/photo sections removed; priced services and crew capabilities remain. |
| R14 Discounts | Fixed amount or percentage per extended line subtotal before tax, retained through document conversion and repeat visits. Original prices and discounts are displayed. |
| R15 Work Orders | One newest-created list, row status, and native swipe deletion using the same delete/archive operation as the detail screen. |

## Verification performed

- `node --test scripts/canes-workflows.test.mjs`: 22 tests passed. This applies every Canes migration to an isolated PGlite database and exercises transactions, snapshots, approval version checks, invoice conversion, deposits, tax, discounts, customer credit and refund reversal, recurring generation/configuration/scope, expense occurrences, deletion rules, and restricted SQL execution. Provider failure cases use mocked Square responses and assert that uncertain retirement cannot change prices.
- `cd apps/mobile && npm test`: 22 tests passed. Includes retained-screen record switching, new draft resets, booking/expiry date handling, recurring conversion, and mutation feedback.
- Root and mobile TypeScript checks passed. The production Next.js build passed, including its TypeScript step.
- `npm run lint`: zero errors; 18 existing warnings in unrelated temporary/report/script files.
- Expo iOS JavaScript/Hermes export passed with dotenv loading disabled. This verifies bundling; it is not an installed iOS build or simulator test.
- Browser smoke checks used local demo data with Canes database, Square, and Twilio credentials disabled. Inspected Home, the single Work Orders list, job detail without owner checklist/photos, employee payment controls, dated expense controls, recurring creation with date/time, and public estimate signature controls. Expenses and recurring forms had no horizontal overflow at 390 × 844.
- `git diff --check` passed. Pre-existing work, including the root TypeScript artifact exclusion and unrelated untracked files, was retained.

The build emitted Node deprecation and chart-size warnings during prerendering, but completed successfully. The React test renderer also emits its upstream deprecation warning.

## Scope of local verification

The checks above were performed locally before production authorization. No customer texts/emails/pushes or card charges/refunds were initiated for testing. Production deployment evidence is recorded below. The local API endpoints returned their unconfigured-service refusal (503); that is not evidence of an authenticated staging workflow.

Additional staging/device coverage and rollout considerations:

1. Apply the four `20260918…` migrations from `supabase/canes/` to the intended Canes staging database, then deploy the matching server. These are Canes-specific files, not migrations for Woof Gang or the root project database.
2. Verify authenticated owner, ops, and assigned-crew journeys against staging, including actual Square sandbox cancellation/webhooks, quiet-hour message retries, notification navigation, and public job/signature pages backed by migrated data.
3. Install the matching native build and verify keyboard handling, signature interaction, archive/swipe behavior, and recurring/expense updates on a device or isolated simulator.
4. Confirm legacy recurring schedules individually. The migration leaves automatic scheduling disabled for old plans. Review the expense cutover setting before enabling the production generator.
5. Replace the default terms only after receiving Sebastian's exact Markate text. Historical accepted snapshots must remain unchanged.

Retired Square invoice/order identifiers remain in history tables so delayed payment/refund events can still resolve to the correct local record. Credit reductions mark affected hosted payment links for cron recovery. This recovery path still needs provider-backed staging verification before shipping.

## Production release preparation — 2026-09-18

Han authorized production deployment and a signed iOS package for manual Transporter upload. Production uses the Canes project `jeznnlveaymtrhisqckq`; Woof Gang is separate. Live preflight found explicit client-role EXECUTE grants on internal privileged functions. The additional permissions migration removes those grants and grants only `service_role`; all mobile business operations use the server API. Local database tests now reproduce Supabase's explicit default grants before applying the migrations.

## Production release evidence

- Code: `c36bd385c0fc8611a19e43b86f9ab2f9ae57bed7`, pushed to `origin/main`.
- Vercel: `dpl_AktRBEAQnZkXJ88kqRCpVZTfVecW`, state `READY`, promoted to `urso.ws`. [Deployment](https://urso-tech-ozuefo95r-hsq0503s-projects.vercel.app).
- Database: four source migrations applied together as `canes_sebastian_fixes_release_20260918`; each filename and checksum also recorded in Canes' existing `public.schema_migrations` ledger.
- Counts after migration: 44 estimates, 37 jobs, 18 invoices, 18 payments, and 3 recurring plans. Existing payment/refund rows matched the pre-deployment backup. Twenty accepted-estimate snapshots were preserved.
- Permissions: zero public privileged functions executable by `anon` or `authenticated`; `service_role` retains access. A direct public RPC request returned permission denied (`42501`). New private tables have RLS enabled.
- Production smoke checks: an existing scheduled job's public page returned HTTP 200 and rendered appointment/balance information; unauthenticated document, archive, and expense APIs returned 401; owner Work Orders redirected to sign-in.
- Expense occurrence cutover: **2026-09-18**. Existing three recurring plans remain disabled for automatic scheduling until the owner confirms their dates/times.
- EAS: [build bb16ad6f-b58a-431b-9c7e-61f5f5bf78d4](https://expo.dev/accounts/hsq0503/projects/urso/builds/bb16ad6f-b58a-431b-9c7e-61f5f5bf78d4), status `FINISHED`, distribution `STORE`, version `0.1.0`, build `15`, source commit `c36bd38`.
- Package: `/Users/han/Downloads/Urso-0.1.0-build-15.ipa`, 23,592,256 bytes. Bundle `ws.urso.app`; minimum iOS 16.4. ZIP integrity and strict deep code-signature checks passed. App Store provisioning has debugging disabled and no device list.
- SHA-256: `f752193259d49f53fdefcfa232e6669e14e68b599d96dbe2c2f5d55ccd58c59f`.
- Expo Doctor passed 20/21 checks; the remaining check reports newer SDK patch releases. The production native build completed successfully using the project's existing dependency lockfile. No unrelated SDK upgrade was introduced for this release.

The post-migration advisor reports only the intentional deny-all RLS configuration and the pre-existing [leaked-password protection setting](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No payment or customer communication was triggered as a smoke test. Normal production automations continue on the existing schedule.
