import type { TourChapter } from "./types";

// Practice arc — every instruction was verified against the real UI labels.
export const INVOICES: TourChapter = {
  "id": "invoices",
  "title": "Practice: get paid",
  "blurb": "Complete, bill cash, watch the money land",
  "steps": [
    {
      "id": "invoices-bill-jamie",
      "title": "Complete & bill",
      "body": "The crew's done — on Jamie's job sheet, tap **Complete & bill**. The invoice builds itself from the job's line items, and the sheet asks how the customer is paying.\n\nFor real card jobs: **Text invoice to pay by card** sends a link; they pay on Square's secure page, everything flips to paid on its own, and you get a payment alert. For the practice, Jamie paid cash: tap **Record cash payment**, confirm the amount, and tap the verify button — it repeats the number back before anything is recorded.",
      "tip": "Tap **Complete & bill**, then **Record cash payment** and verify the $450."
    },
    {
      "id": "invoices-see-it",
      "title": "The money is real (for a minute)",
      "body": "Look at the **Invoices** page: Jamie's invoice sits there **Paid** — and whenever anything is still owed, an **Outstanding** total sits at the top of the page. Unpaid invoices get reminder texts at day 3 and day 7 on their own; a bad bill gets **Void invoice** — the job reopens for a corrected re-bill.\n\nOne honest rule everywhere in this app: **Collected** means money actually received. A sent invoice counts for zero until it's paid.",
      "route": "/CanesPressure/invoices",
      "selector": "a[href=\"/CanesPressure/invoices\"]"
    },
    {
      "id": "invoices-payouts",
      "title": "Follow it to the payout",
      "body": "And here's where it lands. The waterfall runs top to bottom: **Collected** (Jamie's $450 is in there), minus job costs (your $30 gas), minus overhead, minus hourly labor, leaves **Gross profit** — the ops-manager share comes off that, and the rest splits between the owners, 60/40 in your favor to start.\n\nThe **Team** card sets who's paid what: profit split, profit share, or hourly with a crew. Hourly workers' hours come from the durations of their crew's finished jobs, counted in the period the job was scheduled. Overhead — insurance, software, the truck — lives on the **Expenses** page next door.",
      "route": "/CanesPressure/payouts",
      "selector": "a[href=\"/CanesPressure/payouts\"]",
      "tip": "Find Jamie's $450 in **Collected** and the $30 under job expenses."
    }
  ]
};
