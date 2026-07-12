import type { TourChapter } from "./types";

// Tour content — condensed from the fact-checked long-form pass; every claim
// traces to code-verified copy.
export const MONEY: TourChapter = {
  "id": "money",
  "title": "Expenses & payouts",
  "blurb": "Costs, profit and who gets what",
  "steps": [
    {
      "id": "money-costs",
      "title": "Two kinds of costs",
      "body": "Money going out comes in two kinds, kept apart on purpose. **Job costs** — gas, materials, dump fees — are logged on the job itself: pick a category, type the amount, hit **Add expense**. **Overhead** — insurance, software, the truck — is added here as one-time, monthly, or yearly, and the page normalizes it all to one true monthly number.\n\nKeep both honest and every profit number downstream — crew margins, payouts — is honest too.",
      "route": "/CanesPressure/expenses",
      "selector": "a[href=\"/CanesPressure/expenses\"]",
      "tip": "Log job costs the day they happen — margins only count what you record."
    },
    {
      "id": "money-payouts",
      "title": "Who takes home what",
      "body": "The waterfall runs top to bottom: **Collected**, minus job costs, minus overhead, minus hourly labor, leaves **Gross profit**. The ops-manager share comes off that, and what's left splits between the owners — 60/40 in your favor to start, changeable anytime in **Set the split**. The **Day** / **Week** / **Month** / **Year** tabs re-run everything for that period.\n\nThe **Team** card is the roster — profit split, profit share, or hourly with a crew. An hourly worker's hours come from the durations of their crew's finished jobs — no timesheets to chase, so keep job durations accurate."
    }
  ]
};
