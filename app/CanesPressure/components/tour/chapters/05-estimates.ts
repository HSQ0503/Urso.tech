import type { TourChapter } from "./types";

// Tour content — condensed from the fact-checked long-form pass; every claim
// traces to code-verified copy.
export const ESTIMATES: TourChapter = {
  "id": "estimates",
  "title": "Estimates",
  "blurb": "Build, send and win quotes",
  "steps": [
    {
      "id": "estimates-build",
      "title": "Quotes that build themselves",
      "body": "The tabs track every quote's life: **Draft**, **Sent**, **Viewed** — the customer actually opened it — **Approved**, **Declined**, **Expired**.\n\nStart from a lead or customer and everything prefills — name, phone, address. Tap services from your saved price list and they land as lines; adjust quantity or price, pick a deposit — **None**, **25%**, **50%**, or **Custom**. Your cover message and terms attach from Settings automatically. All that's left is the work and the price.",
      "route": "/CanesPressure/estimates",
      "selector": "a[href=\"/CanesPressure/estimates\"]"
    },
    {
      "id": "estimates-send",
      "title": "Send it; they sign on their phone",
      "body": "Pick **Text**, **Email**, or **Both**, then hit **Save & send**. The customer gets a clean page built for their phone: the work, the price, your terms — **Approve** by typing their name (that's their signature), or **Decline** with a reason. You're texted the moment they act.\n\nAn **Options** estimate lets them tick add-ons themselves — quote the driveway, offer gutter cleaning at $150, and they upsell themselves. No phone call needed.",
      "tip": "Put one or two well-priced add-ons on every quote — checked boxes are found money."
    },
    {
      "id": "estimates-after",
      "title": "What happens after",
      "body": "A yes creates the job automatically in the schedule's **Unscheduled** tray and a proper customer record — nothing approved ever slips through the cracks.\n\nSilence gets chased for you: reminder texts at day 2 and day 5, and quotes expire on their own after 28 days (change **Valid for (days)** in Settings). Sent quotes lock, so what the customer saw is exactly what they approved. Priced it wrong? **Void** it and send a fresh one."
    }
  ]
};
