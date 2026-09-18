# Canes customer-request decisions

Status: product decisions Q1-Q22 accepted by Han on 2026-09-17. The interview is complete and implementation is authorized. The exact Markate terms remain an external input.

Source: [Sebastian's request and screenshots](</Users/han/Desktop/Urso fixes.pdf>). Repository reviewed at `866613f781120a5b1b8003ee71b7cc253eda6473`.

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
