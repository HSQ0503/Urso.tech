import type { TourChapter } from "./types";

// Tour content — condensed from the fact-checked long-form pass; every claim
// traces to code-verified copy.
export const SCHEDULE: TourChapter = {
  "id": "schedule",
  "title": "Schedule & jobs",
  "blurb": "The calendar, crews and run sheets",
  "steps": [
    {
      "id": "schedule-board",
      "title": "The dispatch board",
      "body": "Flip between **Day**, **Week**, and **Month**. Solid, crew-colored blocks are sold jobs; hairline chips are estimate visits — one glance separates money on the books from money you're still chasing.\n\nApproved work waits in the **Unscheduled** tray. Drag a card onto the calendar — where you drop is the start time, snapped to 15 minutes. Assign a crew and the block wears its color; putting one crew on overlapping jobs warns you, but never blocks. You're the boss.",
      "mobileBody": "Flip days with the week strip up top. Solid crew-colored dots are sold jobs; hollow rings are estimate visits — solid means sold.\n\nApproved work waits in an **Unscheduled** group at the top. Tap a job, pick the day, time, crew, and duration, then hit **Schedule**. Putting one crew on overlapping jobs warns you, but never blocks. You're the boss.",
      "route": "/CanesPressure/schedule",
      "selector": "a[href=\"/CanesPressure/schedule\"]",
      "tip": "Keep the Unscheduled tray empty — anything sitting there is sold money without a date."
    },
    {
      "id": "schedule-jobsheet",
      "title": "The job sheet",
      "body": "Tap any job and its sheet opens: customer and price, one-tap call and **Directions**, the gate code, site notes, and the sold line items — plus **Reschedule**, crew, status, and **Cancel / no-show**.\n\nThe customer gets a confirmation text the day before, automatically; their YES flips the job to **Confirmed**. Two fields punch above their weight: **Duration** is what the hourly pay math in Payouts runs on, and **Arrival window** sets the time range printed on the crew's run sheet."
    },
    {
      "id": "schedule-runsheet",
      "title": "Run sheets and a job's life",
      "body": "In **Day** view, **Run sheet** is a crew's whole day on one printable page: stops in order, addresses with map links, the gate code in a box you can't miss, and the work as a checklist — this is what replaces the per-job Google Doc. Print one per crew, leave them on the truck seats. Block time off with **Event** — holidays and days off paint as muted bands.\n\nEvery job walks the same road: **Unscheduled → Scheduled → Confirmed → In progress → Completed → Invoiced → Paid**. Finished work leaves the board, so an empty week really is empty."
    }
  ]
};
