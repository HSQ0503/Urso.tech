import type { TourChapter } from "./types";

// Practice arc — every instruction was verified against the real UI labels.
export const SCHEDULE: TourChapter = {
  "id": "schedule",
  "title": "Practice: schedule it, do it",
  "blurb": "From the Unscheduled queue to a finished job",
  "steps": [
    {
      "id": "schedule-place-jamie",
      "title": "Put Jamie on the board",
      "body": "Here's the dispatch board — **Day**, **Week**, **Month**. Solid, crew-colored blocks are sold jobs; hairline chips are estimate visits. (Jamie's booked visit already vanished — the moment a quote is approved, the lead is won and its visit leaves the board.) One glance separates money on the books from money you're chasing.\n\nJamie's approved job is waiting in the **Unscheduled** tray. Drag it onto tomorrow — where you drop is the start time, snapped to 15 minutes. Then tap the job and pick a crew under **Assign crew**. Double-booking a crew warns you, but never blocks.",
      "mobileBody": "Here's the schedule. Solid crew-colored dots are sold jobs; hollow rings are estimate visits. (Jamie's booked visit already vanished — the moment a quote is approved, the lead is won and its visit leaves the board.) Solid means sold.\n\nJamie's approved job is waiting under **Unscheduled** at the top. Tap it, pick tomorrow, a time, a crew, and a duration, then hit **Schedule**. Double-booking a crew warns you, but never blocks.",
      "route": "/CanesPressure/schedule",
      "selector": "a[href=\"/CanesPressure/schedule\"]",
      "tip": "Drag Jamie's job from the tray onto tomorrow and assign a crew."
    },
    {
      "id": "schedule-jamie-jobsheet",
      "title": "The job sheet",
      "body": "Tap Jamie's job to open its sheet: customer and price, one-tap call and **Directions**, the sold line items — plus a gate code and site notes once you add them via **Edit** — and **Reschedule**, crew, status, **Cancel / no-show**. Scheduling also armed the real automation: the customer gets a confirmation text the day before, and their YES flips the job to **Confirmed**.\n\nOne field punches above its weight: **Duration** is what the hourly pay math in Payouts runs on — keep it honest. Now tap **Start job** — the crew just pulled up.",
      "tip": "Open Jamie's job and tap **Start job**."
    },
    {
      "id": "schedule-jamie-expense",
      "title": "Log what the job cost",
      "body": "While a job runs, its costs get logged right here on the sheet. In the expenses panel, pick **Gas / travel**, type 30, and hit **Add expense**. Thirty seconds of honesty now is what makes your per-crew margins and payouts real later — the app can only count what you record.\n\n(For the crew's paper world: on a computer, **Day** view's **Run sheet** prints their whole day — stops in order, gate codes, the work as a checklist. That's what replaces the per-job Google Doc.)",
      "tip": "Add a $30 **Gas / travel** expense to Jamie's job."
    }
  ]
};
