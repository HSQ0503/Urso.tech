import type { TourChapter } from "./types";

// Generated tour content — authored + fact-checked against the code it describes.
export const WRAP: TourChapter = {
  "id": "wrap",
  "title": "Insights, Settings & wrap-up",
  "blurb": "Your numbers and your controls",
  "steps": [
    {
      "id": "wrap-insights-scoreboard",
      "title": "Insights: your scoreboard",
      "body": "This is how the business actually did. Pick a window up top — **7d**, **30d**, **90d** or **12m** — and every number on the page follows. Four headline tiles: **Collected** is money actually received, shown against the prior period. **Outstanding** is what customers still owe on open invoices — tap it to jump straight to them. **Won work** is the value of estimates approved. **Avg job** is your average paid job. If you only look at one page a week, make it this one.",
      "route": "/CanesPressure/insights",
      "selector": "a[href=\"/CanesPressure/insights\"]",
      "tip": "Tap **Outstanding** whenever money feels slow — it lists every unpaid invoice."
    },
    {
      "id": "wrap-collected-trend",
      "title": "Watch the money land",
      "body": "**Collected over time** charts money as it arrives — green bars are cash, blue are card, day by day on the shorter views, by week or month on the longer ones. Touch any bar for the exact figures, down to the cent. Beside it, **Cash vs card** shows the split for the period. This is money actually received, not invoices sent — a $450 driveway job paid in cash shows up in that day's bar the moment the payment is recorded."
    },
    {
      "id": "wrap-crew-margin",
      "title": "Who makes you money",
      "body": "**Margin by crew** is the honest number: each crew's collected money minus the expenses logged on their jobs, so the headline is profit, not just hustle. A crew can look busy all week and still be your thinnest earner — this card tells you. Under each crew sits the math: collected minus expenses. **Top services** ranks what customers actually paid for, so you know what to sell more of. Both count only jobs paid inside the window you picked.",
      "tip": "Log job costs as they happen — these margins only count what you record."
    },
    {
      "id": "wrap-funnel-speed",
      "title": "The funnel and your speed",
      "body": "The **Lead funnel** follows every lead from **Leads** to **Contacted**, **Appointment set**, **Estimated** and **Won**, so you see exactly where people fall out. **Quote scoreboard** gives your win rate on decided quotes. **Speed to lead** is the one to obsess over: the median time from a new quote request to your first call or text, plus the share you reached within 15 minutes — automated texts don't count, only you do. **Leads and revenue by source** then shows which channels turn into collected dollars, credited to the channel that first brought the lead in."
    },
    {
      "id": "wrap-message-templates",
      "title": "Every text here is yours to edit",
      "body": "The day-to-day texts the app sends for you live in **Message templates**, written in your words: **Hold text** goes out the moment a quote request arrives, **Appointment confirmation** asks the customer to reply YES before an estimate visit, **Confirmation reply** answers that YES, and **Missed call text** goes to anyone whose call went unanswered. Type {name}, {when} or {address} anywhere and the app fills in the real details for each customer. Keep the \"Reply STOP to opt out\" line — it's required.",
      "route": "/CanesPressure/settings",
      "selector": "#tpl-hold_text",
      "tip": "Hit **Save** after editing a section — each card saves on its own."
    },
    {
      "id": "wrap-timing-quiet-hours",
      "title": "When texts go out",
      "body": "**Timing** sets the clock on those texts. **Confirmation offset (hours)** is how far before an estimate visit the confirmation goes out — 12 means 12 hours ahead; anything from 1 to 72 works. **Quiet hours start** and **Quiet hours end** protect your customers' evenings: no automated text goes out between those hours (Eastern). Anything that comes due overnight simply waits and sends in the morning. You set it once and never think about it again.",
      "selector": "#confirmation-offset"
    },
    {
      "id": "wrap-vendors-estimate-defaults",
      "title": "Lead sources and quote defaults",
      "body": "**Lead vendor numbers** is why leads file themselves: when a text arrives from a number on this list, the app reads it and fills in a lead card for you. Buying leads from someone new? Drop their number in and press **Add**. Below that, **Estimates** holds your quote defaults — the **Cover message** and **Terms** every customer sees, **Deposit presets (%)** for quick deposit choices, **Valid for (days)** before a quote expires on its own, and your **Sales tax (%)**.",
      "tip": "Add a new vendor's number before their first lead lands so nothing slips by."
    },
    {
      "id": "wrap-status-cards",
      "title": "Status, setup and this tour",
      "body": "Three cards round out the page. **Connection status** shows what's live — green dots mean your records and your text-and-call line are connected and working. **Webhooks** is technical wiring for the phone line — that's wiring Han takes care of, so there's nothing for you to do there. And **Product tour** is where this walkthrough lives — it ran on your first sign-in, and you can replay it any time you want a refresher."
    },
    {
      "id": "wrap-runs-itself",
      "title": "Everything that runs itself",
      "body": "While you sell and the crews wash, the app keeps working:\n\n- Instant hold texts to new quote requests, and a text back when a call goes unanswered\n- Visit confirmations, a final reminder if no YES, and an alert to you before you drive out\n- Alerts when a new quote request sits uncalled at 15 and 45 minutes, or one you've contacted goes quiet\n- Estimate and invoice reminders, and quotes that expire on their own\n- The 7 AM Eastern digest email: today's visits, who's confirmed, cold leads waiting, follow-ups due"
    },
    {
      "id": "wrap-ready",
      "title": "You're ready",
      "body": "That's the whole platform. Start each morning with the digest email, then open **Today** — it lines up what needs you first. Work new quote requests fast (Insights keeps score), keep estimates moving, and let the confirmations, reminders and follow-ups carry the rest. And if something ever looks off — a number that can't be right, a text that didn't land — Han is a text away. Go get paid.",
      "route": "/CanesPressure",
      "selector": "a[href=\"/CanesPressure\"]",
      "tip": "Replay this tour anytime from the **Product tour** card in Settings."
    }
  ]
};
