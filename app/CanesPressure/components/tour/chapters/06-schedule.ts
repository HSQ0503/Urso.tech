import type { TourChapter } from "./types";

// Generated tour content — authored + fact-checked against the code it describes.
export const SCHEDULE: TourChapter = {
  "id": "schedule",
  "title": "Schedule & jobs",
  "blurb": "The calendar, crews and run sheets",
  "steps": [
    {
      "id": "schedule-board",
      "title": "The calendar",
      "body": "This is the calendar you'll run the week from. Flip between **Day**, **Week**, and **Month** at the top, and hit **Today** to snap back to now.\n\nTwo kinds of blocks live here. Real, sold jobs are solid and wear their crew's color. Estimate visits — appointments to go quote work — show as hairline chips. One glance separates money on the books from money you're still chasing. Use the **All** / **Jobs** / **Quotes** toggle to see one kind at a time.",
      "mobileBody": "On your phone the schedule is a list, not a grid. The strip up top pages week by week — tap a day chip to see just that day. Jobs carry a solid crew-colored dot; estimate visits a hollow ring. Same rule, smaller screen: solid means sold.",
      "route": "/CanesPressure/schedule",
      "selector": "a[href=\"/CanesPressure/schedule\"]",
      "tip": "Tap a hairline visit chip for directions or a one-tap **Start estimate**."
    },
    {
      "id": "schedule-unscheduled-tray",
      "title": "The Unscheduled queue",
      "body": "When a customer approves an estimate, the job lands here — priced, named, and waiting for a date. The **Unscheduled** tray is your backlog of sold work: a $450 driveway job sits in it until you give it a slot.\n\nEach card shows the customer, the total, and the address, and the count up top tells you how many are waiting. Nothing sold slips through a crack in a notebook again.",
      "mobileBody": "On your phone, sold-but-unplaced work sits in an **Unscheduled** group at the top of the schedule. Every row says **Tap to schedule** — tap it and pick a time.",
      "tip": "Keep this tray empty — anything sitting here is sold money without a date."
    },
    {
      "id": "schedule-place-jobs",
      "title": "Putting work on the board",
      "body": "Grab a card from the **Unscheduled** tray and drop it on the calendar. Where you let go is the start time — drops snap to the nearest 15 minutes, so blocks line up clean. Need to shuffle the week? Drag any scheduled block to a new day or time.\n\nThe board updates the instant you drop, so laying out a full week takes about a minute. If a move doesn't stick, the calendar tells you and puts things back.",
      "mobileBody": "No dragging on a phone. Tap a job under **Unscheduled** and the **Schedule job** sheet opens: pick the day and time, a crew, and a duration, then hit **Schedule**. To move something already booked, tap it and use **Reschedule** on its sheet."
    },
    {
      "id": "schedule-crews",
      "title": "Crews and colors",
      "body": "Assign a crew when you schedule a job, or anytime from the job's sheet — every block then wears that crew's color, so the week reads at a glance: who's loaded, who's light. The **All crews** dropdown narrows the board to one crew.\n\nPut one crew on two overlapping jobs and both blocks get a warning outline, plus a note — \"Heads up: overlaps…\" — naming the clash. It warns, it never blocks. Two small jobs on the same street at once? Your call."
    },
    {
      "id": "schedule-auto-confirm",
      "title": "Confirmations run themselves",
      "body": "Put a job on the calendar and the day-before confirmation handles itself. 24 hours before the start, the customer gets a text confirming the time and address and asking them to reply YES. When they reply, the job flips to **Confirmed** — tap the job and its status chip says so.\n\nMove the job and the old text is scrapped and a new one lined up for the new slot — the job drops back to **Scheduled** until the customer confirms again. Pull it off the calendar and the text is canceled.",
      "tip": "Tap through the day's jobs the morning of — anything still **Scheduled** deserves a quick call."
    },
    {
      "id": "schedule-job-sheet",
      "title": "The job sheet",
      "body": "Tap any job — on the calendar or in the tray — and its sheet opens: the whole job on one card. Customer and price up top, one-tap call, **Text**, and **Directions** buttons, then the address with **Open in Maps**, the gate code, site notes, and the sold line items exactly as quoted.\n\nIt's also the controls: **Reschedule**, **Unschedule**, assign a crew, set the status, or **Cancel / no-show** (a reason is required). Hit **Edit** to update the gate code or notes, and the links jump to the estimate, invoice, or customer.\n\nTwo fields here punch above their weight: **Duration** is what the hourly pay math in Payouts runs on, and **Arrival window** sets the time range printed on the crew's run sheet."
    },
    {
      "id": "schedule-run-sheet",
      "title": "The run sheet",
      "body": "The run sheet is a crew's whole day on one printable page. Open a day in **Day** view and hit **Run sheet**: jobs in time order, numbered like stops on a route, each with the time window, phone, address with **Open in Maps**, the gate code in a box you can't miss, the work as a checklist, and site notes.\n\nRunning more than one crew that day? Filter the sheet to a single crew, then **Print / share**. Nobody texts you from a locked gate at 8 AM.",
      "mobileBody": "The run sheet lives on the desktop calendar's **Day** view — build and print the crews' sheets from your computer.",
      "tip": "Print one sheet per crew the night before and leave them on the truck seats."
    },
    {
      "id": "schedule-block-time",
      "title": "Blocking time off",
      "body": "The calendar should know when you can't work. Hit **Event** in the toolbar to open **Create event**: title it, pick the date and times or check **All day**, apply it to one crew or **Everyone**, and set the kind — **Block**, **Time off**, **Holiday**, or **Note**.\n\nEvents paint as muted bands, clearly not jobs, so a glance shows the day is spoken for before you book against it.",
      "mobileBody": "On the phone, tap the round + button at the bottom right and choose **Event** — same form. That menu also has **Job**, for adding a one-off job by hand."
    },
    {
      "id": "schedule-job-life",
      "title": "A job's life",
      "body": "Every job walks the same road: **Unscheduled** when the estimate is approved, **Scheduled** when you place it, **Confirmed** when the customer texts YES, then **In progress**, **Completed**, **Invoiced**, **Paid**. **Canceled** is the exit ramp, and it always asks for a reason.\n\nSet any of these from the **Status** dropdown on the job sheet. Once a job hits **Completed**, **Invoiced**, **Paid**, or **Canceled** it leaves the calendar — the board only shows work that still needs doing, so an empty week really is empty.",
      "tip": "Flip jobs to **In progress** when the crew starts and **Completed** when they finish — the calendar stays honest all day."
    }
  ]
};
