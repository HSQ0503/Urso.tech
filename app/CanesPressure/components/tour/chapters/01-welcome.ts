import type { TourChapter } from "./types";

// Tour content — condensed from the fact-checked long-form pass; every claim
// traces to code-verified copy.
export const WELCOME: TourChapter = {
  "id": "welcome",
  "title": "Welcome & Today",
  "blurb": "The big picture and your home page",
  "steps": [
    {
      "id": "welcome-start",
      "title": "Welcome to your new home base",
      "body": "This is where Canes Pressure Washing runs now — every call and text, every lead, every estimate, the schedule, the invoices, and the money, all in one place.\n\nThis tour isn't a slideshow: in a few minutes you'll work a practice lead through the whole pipeline yourself — call, quote, schedule, get paid — and the practice data cleans itself up at the end. Move with **Next** and **Back**, jump chapters with the list icon, minimize to look around. Replay anytime from **Settings**.",
      "route": "/CanesPressure"
    },
    {
      "id": "welcome-flow",
      "title": "How your work flows",
      "body": "Every dollar follows the same path here:\n\n- A lead comes in — you call them back fast\n- You book the estimate visit; a text asks them to reply YES\n- You send the estimate — they approve it right from their phone\n- A yes becomes a job waiting to be scheduled\n- You schedule it, the crew washes, the invoice goes out, they pay\n\nMost of the handoffs happen on their own — and this **Today** page always puts whatever needs attention first."
    },
    {
      "id": "welcome-today",
      "title": "Reading the Today page",
      "body": "**Call these now** tops the page: new leads still waiting on a call back, each with a live wait timer. Speed sells — a $450 driveway job goes to whoever calls first. More queues appear only when something needs you: **Past due visits** (a visit whose time passed with nothing logged — open the lead and log it or rebook), **Unconfirmed visits**, **Follow-ups due**.\n\nThe four-column strip — **Leads**, **Quotes**, **Jobs**, **Invoices** — is your whole pipeline; every column is a button. Below: today's visits (your day), today's jobs (your crews'), the money row, and recent activity. The sidebar groups the rest — the daily loop, **Work**, **Money**, with **Settings** pinned at the bottom.",
      "mobileBody": "**Call these now** tops the page: new leads still waiting on a call back, each with a live wait timer. Speed sells — a $450 driveway job goes to whoever calls first. More lists appear only when something needs you: **Past due visits** (a visit whose time passed with nothing logged — open the lead and log it or rebook), **Unconfirmed visits**, **Follow-ups due**.\n\nThe four-column strip — **Leads**, **Quotes**, **Jobs**, **Invoices** — is your whole pipeline; every column is a button. Below: today's visits (your day), today's jobs (your crews'), the money row, and recent activity. The bottom bar carries **Today**, **Inbox**, **Leads**, **Schedule**, plus **More** for everything else.",
      "selector": ".cp-group-danger",
      "tip": "Call the lead with the biggest timer first — they've waited longest."
    }
  ]
};
