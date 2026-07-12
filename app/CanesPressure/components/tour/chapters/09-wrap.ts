import type { TourChapter } from "./types";

// Tour content — condensed from the fact-checked long-form pass; every claim
// traces to code-verified copy.
export const WRAP: TourChapter = {
  "id": "wrap",
  "title": "Insights, Settings & wrap-up",
  "blurb": "Your numbers and your controls",
  "steps": [
    {
      "id": "wrap-insights",
      "title": "Your scoreboard",
      "body": "Pick a window — **7d** to **12m** — and every number follows. **Collected** is real money received; **Outstanding** lists every unpaid invoice when you tap it; **Won work** and **Avg job** round out the headlines.\n\nBelow: money over time (cash vs card), **Margin by crew** — who actually makes you money, collected minus the costs on their jobs — the lead funnel, your quote win rate, **Speed to lead**, and which lead sources turn into collected dollars. If you only look at one page a week, make it this one.",
      "route": "/CanesPressure/insights",
      "selector": "a[href=\"/CanesPressure/insights\"]"
    },
    {
      "id": "wrap-settings",
      "title": "Your controls",
      "body": "Everything the app says — and when it says it — lives here. **Message templates**: the hold text, confirmations, and missed-call reply, in your words, with {name}, {when}, and {address} filled in per customer. **Timing**: the confirmation offset and quiet hours. **Lead vendor numbers**: texts from these auto-fill lead cards — add a new vendor before their first lead lands. **Estimates**: your terms, deposit presets, expiry, and tax.\n\nAnd the **Product tour** card is where this walkthrough lives — replay it anytime.",
      "route": "/CanesPressure/settings",
      "selector": "a[href=\"/CanesPressure/settings\"]",
      "tip": "Hit **Save** after editing a section — each card saves on its own."
    },
    {
      "id": "wrap-ready",
      "title": "You're ready",
      "body": "While you sell and the crews wash, the app keeps working: hold texts, visit confirmations and the final reminder, missed-call replies, escalations to you, cold-lead follow-ups, estimate and invoice reminders, and the 7 AM Eastern digest email with the day ahead.\n\nStart each morning with the digest and **Today**, work new leads fast, and let the rest run itself. If something ever looks off — a number that can't be right, a text that didn't land — Han is a text away. Go get paid.",
      "route": "/CanesPressure",
      "tip": "Replay this tour anytime from the **Product tour** card in Settings."
    }
  ]
};
