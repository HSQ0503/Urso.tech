import type { TourChapter } from "./types";

// Generated tour content — authored + fact-checked against the code it describes.
export const WELCOME: TourChapter = {
  "id": "welcome",
  "title": "Welcome & Today",
  "blurb": "The big picture and your home page",
  "steps": [
    {
      "id": "welcome-start",
      "title": "Welcome to your new home base",
      "body": "This is where Canes Pressure Washing runs now — every call and text, every lead, every estimate, the schedule, the invoices, and the money, all in one place.\n\nYou're looking at **Today**, the page that greets you by name each morning and puts whatever needs attention right at the top. Nothing here is a report you have to dig for. The work comes to you, in the order it matters.",
      "route": "/CanesPressure"
    },
    {
      "id": "welcome-flow",
      "title": "How your work flows",
      "body": "Every dollar follows the same path here:\n\n- A lead comes in — you call them back fast\n- You book the estimate visit; a text asks them to reply YES to confirm\n- You send the estimate — they review and approve it right from their phone\n- The moment they approve, it becomes a job waiting to be scheduled\n- You schedule it, the crew washes, the invoice goes out, they pay\n\nMost of the handoffs happen on their own, and every number on this page updates as the work moves."
    },
    {
      "id": "welcome-tour-basics",
      "title": "How this tour works",
      "body": "Move through with **Next** and **Back**. The list icon at the top of this card opens the chapter list — jump anywhere, any time.\n\nWant to try something mid-step? Tap the minus to minimize; a **Resume tour** pill stays on screen and picks up right where you left off, even after a reload. End the tour early and **Settings** will restart it — look for **Start the tour**.\n\nOne thing to know: this tour never changes your data. But the app around it is live — real leads, real dollars.",
      "tip": "Tap the list icon now to peek at where we're headed."
    },
    {
      "id": "welcome-call-queue",
      "title": "The call queue comes first",
      "body": "**Call these now** sits at the top of your queues for a reason: it's every new lead still waiting on a call back. Each card's timer counts the minutes that lead has waited — it re-checks every 30 seconds and shifts color at 5 and 15 minutes. Speed sells: a $450 driveway job goes to whoever calls first.\n\nHit **Call** to dial straight from the card, or **Open** for the full story. Clear the queue and it reads \"All caught up. Every new lead has been called.\" More queues appear below only when something needs you — **Past due visits** (an estimate visit whose time came and went with nothing logged: open the lead, log what happened, or rebook), **Unconfirmed visits**, **Follow-ups due**.",
      "mobileBody": "**Call these now** sits at the top of your lists for a reason: it's every new lead still waiting on a call back. Each row's timer counts the minutes that lead has waited — it re-checks every 30 seconds and shifts color at 5 and 15 minutes. Speed sells: a $450 driveway job goes to whoever calls first.\n\nTap the round phone button to dial on the spot; tap the name to open the lead. More lists appear below only when something needs you — **Past due visits** (an estimate visit whose time came and went with nothing logged: open the lead, log what happened, or rebook), **Unconfirmed visits**, **Follow-ups due**.",
      "selector": ".cp-group-danger",
      "tip": "Call the lead with the biggest timer first — they've waited longest."
    },
    {
      "id": "welcome-workflow-strip",
      "title": "Your whole pipeline in one strip",
      "body": "The four-column strip near the top is the whole business at a glance — **Leads**, **Quotes**, **Jobs**, **Invoices** — with live counts and real dollars: quotes awaiting approval and what they're worth, jobs still needing a spot on the schedule, money outstanding.\n\nEvery column is a button. Tap **Quotes** to land on your estimates; tap **Invoices** to land straight on the unpaid list. And when an invoice has been out more than a week, the strip flags it in red as overdue.",
      "selector": "section.cp-card.overflow-hidden",
      "tip": "Glance at this strip before you leave the page — it shows where today's money is stuck."
    },
    {
      "id": "welcome-visits-jobs",
      "title": "Two calendars: visits and jobs",
      "body": "**Today's visits** is where you're going — today's estimate appointments, with **Total**, **Confirmed**, and **Pending** counts. Each row shows the time, the customer, and whether they've said YES. The map pin opens the address in Maps.\n\n**Today's jobs** is where your crews are going — the washes on for today, each with a colored dot and crew name. Your day and theirs, kept separate on purpose.\n\nA line under the visits list previews the next day with visits booked, and **View schedule** opens the full calendar.",
      "mobileBody": "**Today's visits** is where you're going — today's estimate appointments, each row with the time, the customer, and a **Confirmed** or **Pending** chip. Tap a row to open the lead.\n\n**Today's jobs** is where your crews are going — the washes on for today, each with a colored dot and crew name. Your day and theirs, kept separate on purpose.\n\nA line under the visits list previews the next day with visits booked, and **Schedule** at the top of either list opens the full calendar."
    },
    {
      "id": "welcome-money-activity",
      "title": "The money row keeps score",
      "body": "Three numbers keep score on the week. **Collected this week** is cash that actually landed — payments completed in the last 7 days. **Won this week** is estimates approved in the last 7 days. **Booked next 7 days** is work already on the calendar. Tap the first two to open **Insights**; the third opens the **Schedule**.\n\nBelow, **Recent activity** shows the last 8 things that happened — texts sent for you, calls logged, appointments set — each stamped with how long ago. Tap a name to jump straight to that lead.",
      "tip": "Check **Collected this week** every Friday — that's the number that pays the bills."
    },
    {
      "id": "welcome-navigation",
      "title": "Finding your way around",
      "body": "The sidebar is organized the way your day is. The top group is your daily loop — **Today**, **Inbox**, **Leads**, **Customers**. Under **Work** live **Estimates** and **Schedule**. Under **Money**: **Invoices**, **Expenses**, **Payouts**, and **Insights**. **Settings** stays pinned at the bottom.\n\nYou don't need to memorize any of it. Start at **Today** each morning and let the page point you to what's next — the cards and counts on it link to the right place.",
      "mobileBody": "On your phone, the bottom bar carries your daily loop — **Today**, **Inbox**, **Leads**, **Schedule** — plus **More**, which opens everything else: **Customers**, **Estimates**, **Invoices**, **Expenses**, **Payouts**, **Insights**, and **Settings**.\n\nYou don't need to memorize any of it. Start at **Today** each morning and let the page point you to what's next — the cards and counts on it link to the right place.",
      "selector": "a[href=\"/CanesPressure\"]"
    }
  ]
};
