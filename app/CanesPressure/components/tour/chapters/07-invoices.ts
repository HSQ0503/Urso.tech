import type { TourChapter } from "./types";

// Tour content — condensed from the fact-checked long-form pass; every claim
// traces to code-verified copy.
export const INVOICES: TourChapter = {
  "id": "invoices",
  "title": "Invoices & getting paid",
  "blurb": "Card, cash and receipts",
  "steps": [
    {
      "id": "invoices-bill",
      "title": "From done to paid",
      "body": "Billing starts on the job sheet: **Start job** when the crew begins, **Complete & bill** when they finish — the invoice builds itself from the job's line items. Then choose how they pay.\n\n**Text invoice to pay by card**: they get a link and pay on Square's secure page; the invoice and job flip to paid on their own — you get a payment alert, and the customer gets an emailed receipt when their email is on file. **Record cash payment**: verify the amount on the spot, done — and the card link shuts off so nobody pays twice.",
      "route": "/CanesPressure/invoices",
      "selector": "a[href=\"/CanesPressure/invoices\"]",
      "tip": "Bill every job through **Complete & bill** — even cash jobs get an invoice behind them, so nothing slips."
    },
    {
      "id": "invoices-chase",
      "title": "The app chases, you don't",
      "body": "**Outstanding** at the top is the money you're still owed; the tabs slice unpaid from paid. Unpaid invoices get friendly reminder texts at day 3 and day 7, stopping on their own the moment money lands. Billed the wrong thing? **Void invoice** — the customer's link shuts off, and the job reopens for a corrected re-bill. The paper trail survives on the **Void** tab.\n\nOne honest rule everywhere in this app: **Collected** means money actually received. A sent invoice counts for zero until it's paid."
    }
  ]
};
