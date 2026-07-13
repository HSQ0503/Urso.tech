import type { TourChapter } from "./types";

// Practice arc — every instruction was verified against the real UI labels.
export const ESTIMATES: TourChapter = {
  "id": "estimates",
  "title": "Practice: quote it, win it",
  "blurb": "Build, send and approve Jamie's estimate",
  "steps": [
    {
      "id": "estimates-build-jamie",
      "title": "Build Jamie's quote",
      "body": "On Jamie's lead page, hit **Create estimate** in the Estimates card — the builder opens with Jamie's details already filled in. That prefill is the point: you never retype what the app already knows.\n\nTap a service from your price list (or **Custom** to write your own — say a $450 driveway and pool deck line). Adjust quantity or price right on the line; pick a deposit preset if you want one. Your cover message and terms are attached from Settings automatically.\n\nStatuses to know: **Draft** → **Sent** → **Viewed** (they opened it) → **Approved** / **Declined** / **Expired**.",
      "route": "/CanesPressure/leads",
      "tip": "Open Jamie's lead, hit **Create estimate**, and add a $450 line."
    },
    {
      "id": "estimates-send-jamie",
      "title": "Send it",
      "body": "Under **Send by**, the app already shows it will text Jamie's number — when a customer has both a phone and an email on file, you'd pick **Text**, **Email**, or **Both** here. Hit **Save & send**.\n\nA real customer now gets a text with a link to a clean page built for their phone: the work, the price, your terms — **Approve** by typing their name (that's their signature), or **Decline** with a reason. If a quote sits silent, the app texts reminders at day 2 and day 5, and it expires on its own after 28 days.\n\nJamie's fictional number can't receive the text — so next, you'll open Jamie's page yourself and play the customer.",
      "tip": "Hit **Save & send**, then stay on the estimate page."
    },
    {
      "id": "estimates-approve-as-jamie",
      "title": "Approve it as Jamie",
      "body": "On the estimate page you'll find a **Customer link** card — the exact page Jamie would open from the text. Tap it (it opens in a new tab), and approve the quote as if you were Jamie: hit **Approve**, type the name, done.\n\nThen come back to this tab and hit **Next** — the job is already waiting in the schedule's **Unscheduled** queue, and Jamie just became a customer record. That handoff is automatic, every time. (Once your phone line is live, an approval also buzzes your phone the moment it happens.)",
      "tip": "Open **Customer link**, approve as Jamie in the new tab, then come back."
    }
  ]
};
