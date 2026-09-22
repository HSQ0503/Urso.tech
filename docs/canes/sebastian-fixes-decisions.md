# Canes customer-request decisions

Status: Q1–Q22 accepted 2026-09-17 and implemented. Update 16 Q23–Q37 accepted 2026-09-20 and implemented. Exact Markate terms remain an external input. Meta Page/app credentials are an ops step, not a product fork.

Source: [Sebastian's request and screenshots](</Users/han/Desktop/Urso fixes.pdf>); Update 16 is Sebastian's 2026-09-20 message. Repository reviewed at `1c3f451a2dbc5b57adb9980caba1b65070d7c73d`.

## Request coverage

| ID  | Request                                                                  | Decisions and remaining work                                                                       |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| R01 | Replace customer terms with Sebastian's old Markate terms                | Obtain the exact text. Do not substitute the Urso-to-Canes services contract.                      |
| R02 | Capture customer agreement/signature and show it to Sebastian            | Q2, Q3. Signed evidence and approval notification must be visible.                                 |
| R03 | Repair the browser console                                               | Q1. Match the simplified mobile workflows using desktop layouts.                                   |
| R04 | Replace the job reminder with the supplied branded reminder and job link | Q12. Informational reminder 24 hours before the booked job; no reply requirement.                  |
| R05 | Delete estimates, work orders, and invoices                              | Q5. Separate unused drafts from records with business history.                                     |
| R06 | Brand estimate messages with customer name and Canes identity            | Direct requirement. Update immediate and queued sends consistently.                                |
| R07 | Manually approve or decline estimates                                    | Q3, Q15. Explicit cancellation of open linked work; retain completed work and receipts.            |
| R08 | Edit and resend accepted estimates, work orders, and invoices            | Q3, Q4, Q14, Q18. Preview linked changes; default to this visit and offer future scope explicitly. |
| R09 | Subtract collected deposits from the amount invoiced                     | Q4. Preserve total price and actual payment history, calculate remaining balance once.             |
| R10 | Make recurring expenses appear every month                               | Q7, Q20. Dated occurrences after an explicit cutover; retain historical entries.                   |
| R11 | Remove partner Payouts and record employee payments in Expenses          | Q8, Q21. Actual payments as Labor expenses, counted once in profit.                                |
| R12 | Automatically repeat work orders at a date and time on the calendar      | Q6, Q16-Q20. Scheduled future visit, anchored Eastern time, explicit scope and overlap flags.      |
| R13 | Remove checklist and job-photo clutter                                   | Q9. Owner screens change, crew functionality and records remain.                                   |
| R14 | Add line discounts to estimates, work orders, and invoices               | Q10. Preserve discounts when converting documents.                                                 |
| R15 | One Work Orders list, newest first, with swipe-left deletion             | Q5, Q11. Remove the separate status filters.                                                       |
| R16 | Edit block-off times                                                     | Q23, Q29, Q37. Calendar blocks: tap to edit or delete.                                             |
| R17 | Recurring expense should post on its date                                | Q24, Q30. Dated occurrences through today; Next date on the main Expenses screen.                  |
| R18 | Meta Ads Manager leads land in Urso as Meta ads                          | Q25, Q28, Q33–Q35. Instant Form webhook; no phone → no lead; one card per phone.                   |
| R19 | Remove “Call these now”                                                  | Q26, Q31. Quiet **New** group, no shout, no count in the title.                                    |
| R20 | Synced leads orange until called or texted, then white                   | Q27, Q32, Q36. Uncontacted `meta_ads` on Leads; white after Urso SMS or click-to-call.              |

## Accepted decisions

### Q1: Browser and mobile scope

Apply the same simplified Canes workflows and capabilities to the owner mobile app and browser console, adapting layouts to each device. Woof Gang is outside this change.

### Q2: Signed acceptance

Customer approval requires a drawn signature, printed name, and an agreement checkbox. Preserve the exact estimate and terms accepted with the signer and timestamp. Make this evidence visible to the owner and reachable from the approval notification.

### Q3: Accepted estimate revisions

Offer both resend-for-approval and record-verbal-agreement. Keep previous signed versions. Owner-recorded approval must be labeled as phone/in-person agreement and must not reuse a customer signature as evidence for changed terms.

### Q4: Financial edits

Preserve actual payments when changing a price. A $1,000 total with a $300 deposit revised to $800 leaves $500 due. If $900 has already been paid, an $800 revision creates a $100 overpayment requiring a refund or credit decision. Refunds require an explicit action. Square payment links must reflect the revised remaining balance.

### Q5: Delete and archive

Unused drafts may be permanently deleted. Records with business history are archived and disappear from normal lists while retaining signed documents and payment history. Explain any cancellation of a visit or retirement of a payment link in the confirmation. Swipe-left exposes the same operation.

### Q6: Repeat scheduling and optional agreements

Repeat scheduling works without a new signed contract. Repeated visits use the chosen Eastern date and time and become scheduled work orders. Signed recurring agreements and cancellation terms are optional. Existing signed agreement history remains intact.

### Q7: Recurring expenses

Create a dated expense automatically on its recurring date. Provide edit, skip, pause, and end controls. Preserve earlier occurrences when changing or stopping the rule.

### Q8: Employee payments

Record payments already made outside Urso, with employee, amount, payment date, method, and optional note. Show payment history, this month's total, and all-time total. Remove the owner-facing partner/profit-split Payouts interface. Wage calculation and money transfer are outside this accepted scope.

### Q9: Owner screen simplification

Remove checklist and job-photo sections from Canes owner mobile and browser screens. Preserve crew functionality and existing records. Retain priced service line items.

### Q10: Per-line discounts

Support either a fixed-dollar or percentage discount on each line, one selected type at a time. Apply the discount to the line subtotal before tax. Display original price and discount. Carry the discount through estimate, work order, and invoice conversion.

### Q11: Work-order list

Show newest-created work orders first. New recurring visits enter the list at creation. Editing an old record does not change its order. Keep status visible on each row and remove the separate status-filter tabs.

### Q12: Informational reminders and public job page

Use an informational reminder without a YES requirement or automatic cancellation for silence. The customer link is read-only and shows appointment date/time, address, services, and deposit/balance, with Call/Text buttons. Rescheduling remains a conversation with Sebastian.

## Evidence that affects the next round

- Existing job reminders request YES and support a database template override. Actual production wording has not been read in this interview.
- No customer-facing scheduled-job page or job public token exists.
- Estimate acceptance currently stores a typed name and timestamp. There is no drawn signature or immutable accepted-version record in that flow.
- Recurring plans currently require activation and mint unscheduled jobs 21 days before the next due date. They do not store repeat time or crew. Month-end clamping can move a monthly Jan 31 series to Feb 28 and then Mar 28.
- Recurring business expenses are templates used in prorated calculations, not dated charge occurrences.
- Existing team compensation calculations and timesheets do not constitute an employee payment ledger.
- The earlier code audit reproduced invoice form values leaking across invoice IDs. Fixing that is a prerequisite for the requested editing workflow.

## Accepted second-round decisions

- Q13: Keep the existing terms during development until Sebastian supplies the exact Markate customer terms. Keep historical signed terms intact.
- Q14: Preview affected linked documents before applying a revision. Update the current work order and unpaid bill together. Preserve signed versions. Completed/paid work requires explicit correction.
- Q15: Decline drafts/sent estimates directly. Declining accepted work requires confirmation of cancellation of open visits and unpaid links. Preserve completed work and payment history and expose refund/fee follow-up.
- Q16: Create the next scheduled repeat visit immediately, copying services, discounts, duration, and crew. When its date passes, create the following visit independently of completion of the earlier one. Do not copy payments or send invoices automatically.
- Q17: Preserve the original day-of-month anchor through shorter months and preserve Eastern wall-clock time through daylight saving changes.
- Q18: Default edits to this visit. Offer this-and-future changes separately. Canceling a visit skips it. Stopping the series is separate.
- Q19: Book a repeating visit at its requested time even if a crew conflict exists, and flag the overlap prominently. Do not silently move or unschedule it.
- Q20: Preserve historical data. Begin expense occurrences at an explicit cutover date without inventing past charges. Propose defaults for existing plans and require confirmation before enabling automatic booking.
- Q21: Actual employee payments count once as Labor expenses. Exclude the former estimated-labor deduction from the same reporting calculation.
- Q22: Initiate card refunds in Square and import them through reconciliation. Record cash refunds already made. Track customer credit and require explicit application to a later invoice.

The detailed execution and verification plan is in [sebastian-fixes-plan.md](./sebastian-fixes-plan.md).

## Update 16 — accepted 2026-09-20 (Q23–Q27)

Han accepted the recommended answers from the first Update 16 round.

### Q23: Block-off times

A **calendar block** is a Schedule Event (`calendar_events`: block / time off / holiday / note). It is not a work order or quote visit. Jobs already have Schedule and Move. There is currently create-only: the day list renders the event as dead text, and `/api/v1/canes/calendar-events/actions` has no update or delete.

### Q24: Recurring expense “auto charge”

On the recurring date, Urso writes an **expense occurrence** (bookkeeping). That is Q7, already shipped. Urso does not send money to a vendor and does not bill a customer. “Charge” is not a product term here.

### Q25: Meta ads ingest

Leads that Sebastian currently types from Ads Manager should be created automatically with `source = meta_ads`. That means **Facebook Instant Forms** (Lead Ads), not tagging the public website form. The website form remains `website`. Nothing in the repo currently writes `meta_ads`.

### Q26: “Call these now”

That string is the section title for every lead with `status = new`. Remove the call-to-action header. Do not hide the leads.

### Q27: Orange on synced leads

Orange on the **Leads list** means an uncontacted Meta lead. Inbox orange stays “they spoke last” / missed inbound call. Q36 widened this from webhook-only to every uncontacted `meta_ads` row.

## Update 16 — accepted 2026-09-20 (Q28–Q33)

Han answered A on the second round.

### Q28: Instant Forms, not website UTMs

The ads collect Instant Form / Leads Center submissions. Ingest is Meta’s leadgen webhook. The public quote form stays `website`.

### Q29: Edit and delete calendar blocks

Tap a calendar block to change time, title, kind, crew, notes, or all-day. Delete after confirm. No repeating blocks. A sold visit still reschedules with job Move. A block that overlaps a job is allowed and does not unschedule the job (Q19).

### Q30: Recurring expenses through today

Mint dated occurrences through today only. Show **Next: date** on the main Expenses screen. Do not pre-create future months. An empty this-month after saving with today’s date is a bug, not a missing charge pipeline.

### Q31: Quiet New

Keep new leads grouped at the top. Label the group **New**. Do not shout “Call these now” or a live count in the title.

### Q32: Contacted from Urso

A Meta row turns white after an Urso SMS or Urso click-to-call, including no-answer. Logging a call outcome also counts. Opening the lead does not. A personal-cell call that is never logged stays orange. Click-to-call must set `contacted` the way SMS already does.

### Q33: Same phone, one lead

Do not mint a second lead. Open/notify on the existing record. Do not overwrite `website`, `lead_vendor`, or `referral`. If the existing source is `other`, set `meta_ads`.

## Update 16 — accepted 2026-09-20 (Q34–Q37)

Han answered A on the third round. No further product forks remain.

### Q34: Meta ingest automations

Match website new-number intake: cold lead, `source = meta_ads`, owner push, email, hold SMS. Known phone: fill blanks only, page the owner, keep Q33 source rules. A2P may still leave the hold SMS undelivered; that is delivery, not a second product.

### Q35: Instant Form with no phone

Do not create a lead. Owner push with name/email if present: it is not in Urso because there is no number to call or text.

### Q36: Who is orange

Every uncontacted `meta_ads` lead, including ones typed before ingest. White after Urso contact (Q32). No ingest-versus-typed split.

### Q37: Block editor

Tap the day-list event. Reuse the create sheet loaded for edit. Delete lives on that sheet, behind confirm. Past blocks are editable. No swipe on the day list.

### Recorded defaults (not separately grilled)

- Map Instant Form `full_name` / `phone_number` / `email`. Address and service if those custom questions exist; otherwise leave blank. Extra answers go in notes.
- Idempotency key is Meta’s leadgen id. Retries do not create a second card.
- Do not backfill old Ads Manager rows.
- Owner mobile and browser (Q1). Crew and Woof Gang unchanged.

### Ops, not product

Meta App, Canes Page subscription, webhook callback URL, and verify token. Required before Instant Form ingest can run in production.
