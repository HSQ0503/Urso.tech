import type { TourChapter } from "./types";

// Generated tour content — authored + fact-checked against the code it describes.
export const INVOICES: TourChapter = {
  "id": "invoices",
  "title": "Invoices & getting paid",
  "blurb": "Card, cash and receipts",
  "steps": [
    {
      "id": "invoices-complete-and-bill",
      "title": "Billing starts on the job",
      "body": "Getting paid starts on the job, not on a billing screen. Open a job on the schedule: tap **Start job** when the crew begins, then **Complete & bill** when they finish. That one tap marks the job done, builds the invoice from the job's line items, and asks how the customer is paying — **Text invoice to pay by card** or **Record cash payment**. A $450 driveway job becomes a $450 invoice with zero typing.",
      "route": "/CanesPressure/schedule",
      "selector": "a[href=\"/CanesPressure/schedule\"]",
      "tip": "Bill every job through **Complete & bill** — even cash jobs get an invoice behind them, so nothing slips."
    },
    {
      "id": "invoices-pay-by-card",
      "title": "Card: text the invoice",
      "body": "Pick **Text invoice to pay by card** and the customer gets a text with a link to your branded invoice page — line items, the total, and a pay button (**Pay $450.00 securely** on that driveway job). The button opens Square's secure payment page; card details never touch your app. The moment the payment goes through, the invoice and the job flip to paid on their own. You get a payment alert by email, and the customer gets an emailed receipt when their email is on file."
    },
    {
      "id": "invoices-record-cash",
      "title": "Cash on the spot",
      "body": "Paid on the spot — cash in hand or a check? Tap **Record cash payment**. The **Amount collected** field comes pre-filled with the billed total; change it if you took a different amount, then tap the verify button — it repeats the number back: **Verify — collected $450.00**. Record the full amount and the invoice and job flip to paid, the card link shuts off so nobody pays twice, reminders stop, and the same receipts go out as with card. Record less and the balance stays open."
    },
    {
      "id": "invoices-the-list",
      "title": "Every bill in one place",
      "body": "**Invoices** is every bill you've ever raised, and the **Outstanding** number at the top is the money you're still owed. Filter with the tabs — **All**, **Unpaid**, **Paid**, **Void** — each with a count. Every invoice wears a status: **Draft** (created, not sent), **Sent**, **Viewed** — which means the customer actually opened your link — **Paid**, and **Void**. Each row shows the customer, the total, and exactly what's still due.",
      "route": "/CanesPressure/invoices",
      "selector": "a[href=\"/CanesPressure/invoices\"]",
      "tip": "Start your day on the **Unpaid** tab — when it reads \"Nothing outstanding — you're all caught up,\" you're done chasing."
    },
    {
      "id": "invoices-open-one",
      "title": "Inside an invoice",
      "body": "Tap any invoice to open it. The page shows the line items carried over from the job, the **Total**, and a **Payments** list — every dollar received, with method and date. The buttons beside it do the work: send or **Resend** the bill by text, email, or both; **Record cash payment**; and **Fix contact details** when a bill went to a wrong number or email — fixable even after sending, and follow-ups go to the correction. The **Customer link** card shows the exact page your customer sees."
    },
    {
      "id": "invoices-reminders-and-void",
      "title": "The app chases for you",
      "body": "You don't chase money — the app does. When a sent invoice sits unpaid, the customer automatically gets a friendly reminder text 3 days after you send it, and again at day 7. The moment the bill is paid, the reminders stop on their own.\n\nBilled the wrong thing? Open the invoice and tap **Void invoice**. Voiding cancels any pending reminder texts, shuts off the customer's link, and releases the job — run **Complete & bill** on it again to send a corrected invoice.",
      "tip": "Void, don't delete — voided bills stay on the **Void** tab so the paper trail survives."
    },
    {
      "id": "invoices-collected-means-collected",
      "title": "Collected means collected",
      "body": "One rule keeps every number in this app honest: **Collected** means money actually received — a card payment that settled or a cash payment you verified. An invoice you sent but nobody paid counts for zero. So when Insights shows what you collected, that's real money, not hopeful paperwork — and **Outstanding** on the Invoices page is exactly what's left to chase.",
      "route": "/CanesPressure/insights",
      "selector": "a[href=\"/CanesPressure/insights\"]",
      "tip": "Quote **Collected** when you talk numbers — it's the one figure that can't flatter you."
    }
  ]
};
