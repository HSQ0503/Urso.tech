import type { TourChapter } from "./types";

// The practice teardown chapter: entering it deletes every trace of Jamie.
export const MONEY: TourChapter = {
  "id": "money",
  "title": "Practice complete",
  "blurb": "Jamie disappears; the automations stay",
  "steps": [
    {
      "id": "money-cleanup",
      "title": "And now Jamie disappears",
      "body": "That was the whole loop — lead, call, booked visit, estimate, approval, job, expense, invoice, payment — and you just ran every step of it yourself.\n\nJamie is practice data, so we've just deleted all of it: the lead, the conversation, the estimate, the job, the $30 gas, the invoice, and the $450. Check any page — your real numbers are exactly as they were. From here on, everything you touch is the real business.",
      "route": "/CanesPressure",
      "onEnter": "practice-cleanup",
      "tip": "Glance at Invoices or Payouts — Jamie's $450 is gone."
    },
    {
      "id": "money-runs-itself",
      "title": "What keeps running without you",
      "body": "Everything Jamie walked through by hand runs itself on real leads:\n\n- Instant hold texts to new quote requests; missed calls text themselves back\n- Visit confirmations, the final reminder, and escalations to you when nobody answers\n- Cold-lead nudges at 1, 3, and 7 days; estimate reminders at day 2 and 5; invoice reminders at day 3 and 7\n- The 7 AM Eastern digest email with the day ahead\n\nQuiet hours hold customer texts overnight, STOP is honored forever, and every automatic send is tagged **Auto** in the thread."
    }
  ]
};
