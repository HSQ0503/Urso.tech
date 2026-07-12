import type { TourChapter } from "./types";

// Generated tour content — authored + fact-checked against the code it describes.
export const MONEY: TourChapter = {
  "id": "money",
  "title": "Expenses & payouts",
  "blurb": "Costs, profit and who gets what",
  "steps": [
    {
      "id": "money-two-kinds",
      "title": "Two kinds of costs",
      "body": "Money going out comes in two kinds, and the app keeps them apart on purpose.\n\n- **Job costs** — gas, materials, dump fees. Logged on the job itself: open the job, pick a category like **Gas / travel**, **Materials** or **Dump fee**, type the amount, hit **Add expense**. Each job's numbers stay clean.\n- **Overhead** — insurance, software, the truck. What you pay even in a slow week. That gets added here.\n\nThe **Job costs** section below is a read-only roll-up of what your jobs spent over the last 60 days — open a job to add or remove its costs.",
      "route": "/CanesPressure/expenses",
      "selector": "a[href=\"/CanesPressure/expenses\"]",
      "tip": "Tap a job's name in the roll-up to jump straight to it on the schedule."
    },
    {
      "id": "money-add-overhead",
      "title": "Adding overhead",
      "body": "Add overhead with the **Add expense** form: name it, enter the amount, pick a category, and choose **Monthly** or **Yearly**. The **Recurring — repeats every period** box is ticked by default — untick it for a one-off purchase, like a new surface cleaner.\n\nUp top, **Monthly overhead** normalizes everything to one true monthly number: a $1,200-a-year insurance policy counts as $100 a month. One-time buys are listed with the rest but never inflate that monthly figure.",
      "tip": "Use the note field for the policy number or plan name — anything worth remembering."
    },
    {
      "id": "money-waterfall",
      "title": "The profit waterfall",
      "body": "**Payouts** answers the question that matters most: after the bills, who takes home what.\n\n**The waterfall** runs the math top to bottom: **Collected**, minus **Job expenses**, minus **Overhead**, minus **Labor** for the hourly crew, leaves **Gross profit**. The **Ops-manager share** comes off that, and what's left is **Distributable** — split between owner and partner. Your split starts at 60/40 in your favor.\n\nThe **Take-home** card turns all that into each person's actual number — yours is the big highlighted headline.",
      "route": "/CanesPressure/payouts",
      "selector": "a[href=\"/CanesPressure/payouts\"]"
    },
    {
      "id": "money-time-ranges",
      "title": "Pick your period",
      "body": "The **Day** / **Week** / **Month** / **Year** tabs at the top re-run everything for that period — the page opens on the current month, and weeks run Monday through Sunday.\n\nOverhead is pro-rated to fit the window, so comparisons stay fair: a $99-a-month subscription counts about $99 against a month, about $3.25 against a single day, and about $1,188 across the year. Money collected and job costs land in the period they were recorded."
    },
    {
      "id": "money-team-roster",
      "title": "Your team, your terms",
      "body": "The **Team** card is your roster — who gets paid, and how. Hit **Add team member**, and under **How they’re paid** pick one of four types:\n\n- **Profit split (owner / partner)** — a percentage of the distributable profit\n- **Profit share (ops manager)** — a percentage of gross profit, off the top\n- **Hourly** — a dollar rate plus the crew they ride with\n- **Not paid here** — on the roster, no cut\n\nEvery row spells out the arrangement in plain terms, with edit and remove buttons on the right."
    },
    {
      "id": "money-set-the-split",
      "title": "Changing the split",
      "body": "**Set the split** is where the owner and partner percentages live. Type each share, watch the **Total** update underneath, and hit **Save split** — the waterfall and everyone's take-home recompute right away.\n\nDon't sweat making it add to exactly 100: if the numbers total something else, shares are normalized to 100% when paid out. Entering 60 and 40 pays the same as 6 and 4 — it's the ratio that counts.",
      "tip": "Keep the total at 100 anyway, so the percentages you see match the checks you write."
    },
    {
      "id": "money-crew-hours",
      "title": "Where crew hours come from",
      "body": "One last thing worth knowing: how the app counts crew hours.\n\nAn hourly worker's hours are the hours of their crew's finished jobs scheduled in the period. A 3-hour driveway job your crew finishes credits 3 hours to every hourly person on that crew, each at their own rate. Only finished jobs count, and each worker's line shows the result as hours times rate.\n\nThat's the whole labor math — no timesheets to chase.",
      "tip": "Keep job durations accurate on the schedule — they are what the labor math runs on."
    }
  ]
};
