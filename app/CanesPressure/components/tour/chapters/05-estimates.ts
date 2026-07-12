import type { TourChapter } from "./types";

// Generated tour content — authored + fact-checked against the code it describes.
export const ESTIMATES: TourChapter = {
  "id": "estimates",
  "title": "Estimates",
  "blurb": "Build, send and win quotes",
  "steps": [
    {
      "id": "estimates-list",
      "title": "Every quote, one list",
      "body": "This is every quote you've ever written, in one place. The tabs track each one's life: **Draft** (not sent yet), **Sent**, **Viewed** — that means the customer actually opened it — **Approved**, **Declined**, and **Expired**. Each tab shows a count, so one glance tells you how many quotes are sitting with customers right now. Sort by newest, oldest, or highest amount when you're hunting for a specific job.",
      "mobileBody": "This is every quote you've ever written, in one place. The tabs track each one's life: **Draft** (not sent yet), **Sent**, **Viewed** — that means the customer actually opened it — **Approved**, **Declined**, and **Expired**. Each tab shows a count, so one glance tells you how many quotes are sitting with customers. Swipe the tabs sideways; the round plus button up top starts a new one.",
      "route": "/CanesPressure/estimates",
      "selector": "a[href=\"/CanesPressure/estimates\"]",
      "tip": "Check the Viewed tab often — those customers opened your quote and haven't answered yet."
    },
    {
      "id": "estimates-catalog",
      "title": "Your services and prices",
      "body": "**Service catalog** is your price list: every service you offer, each with a default price. Set it up once and quotes practically write themselves — in the builder, you tap a service and it drops in as a line with the price already filled. Tap **Add service** to add one, set its **Default price**, and mark it **Taxable** if sales tax applies. Editing a price here never changes estimates you already sent — only new ones.",
      "route": "/CanesPressure/estimates/items",
      "tip": "Add your ten most common jobs first — a $250 driveway, a $450 house wash — and refine as you go."
    },
    {
      "id": "estimates-start",
      "title": "Starting a quote",
      "body": "You can start a quote three ways: from a lead, from a customer, or from scratch with **New estimate**. Start from a lead or customer and everything the app already knows — name, phone, email, job address — arrives pre-filled, so you never retype what you typed last week. Your cover message, terms, and expiry date load from Settings automatically. All that's left is the work and the price.",
      "mobileBody": "You can start a quote three ways: from a lead, from a customer, or from scratch with the round plus button on the Estimates screen. Start from a lead or customer and everything the app already knows — name, phone, email, job address — arrives pre-filled, so you never retype what you typed last week. Your cover message, terms, and expiry date load from Settings automatically. All that's left is the work and the price.",
      "route": "/CanesPressure/estimates",
      "selector": "a[href=\"/CanesPressure/estimates/new\"]"
    },
    {
      "id": "estimates-builder",
      "title": "Building the quote",
      "body": "The builder is where the quote takes shape. Tap a service from your catalog and it lands as a line — adjust the quantity or price right there and the total updates as you go. One-off job? Tap **Custom**, name it, price it, then hit **Save to my services** to keep it for next time. Pick a deposit — **None**, **25%**, **50%**, or **Custom** (you can change these presets in Settings). And **Internal notes (private)** never reach the customer — gate codes and crew notes live there."
    },
    {
      "id": "estimates-options",
      "title": "Let them pick add-ons",
      "body": "Every estimate is one of two types. **Standard** is one fixed scope — every line included. **Options** lets the customer choose: mark a line as **Optional add-on** and they get a checkbox for it on their approval page, with the total recalculating as they tick. Quote the driveway, offer gutter cleaning as a $150 add-on — they upsell themselves, no phone call needed. Mark an option **Required** to show it as included without letting them remove it.",
      "tip": "Put one or two well-priced add-ons on every quote — checked boxes are found money."
    },
    {
      "id": "estimates-send",
      "title": "Sending it out",
      "body": "Pick **Text**, **Email**, or **Both**, then hit **Save & send**. The customer gets a link to a clean page built for their phone: your message up top, the work and the price, your terms one tap away. To say yes, they tap **Approve** and type their full name — that counts as their signature. To pass, they tap **Decline** and can tell you why. The moment they open it, the estimate flips to **Viewed** — and when they approve or decline, a text lands on your phone.",
      "tip": "Quoting a property manager? Tick Send to a different contact to route the quote to their office instead."
    },
    {
      "id": "estimates-after-yes",
      "title": "What a yes sets in motion",
      "body": "An approval sets the machine in motion. A job is created automatically and waits in the schedule's **Unscheduled** tray, so nothing approved ever slips through the cracks. The customer gets a proper record in Customers, built from the estimate — a yes is the moment a lead becomes a customer. If you set a deposit, the thank-you screen shows them the amount that holds their spot. Back on the estimate, you'll see **Approved — job created** with a **View on the schedule** shortcut."
    },
    {
      "id": "estimates-follow-up",
      "title": "The app chases for you",
      "body": "Silence isn't a no — people get busy. If a sent estimate sits unanswered, the app follows up by text for you: once 2 days after sending, again at day 5. The chasing stops on its own the moment they approve, decline, or opt out of texts. Every estimate also carries an expiry — 28 days unless you change **Valid for (days)** in Settings. When that date passes, the quote flips to **Expired** and the customer's link says so. Need to kill one early? **Void estimate** cancels the reminders and shuts the link off.",
      "tip": "Treat Expired as a nudge, not a loss — start a fresh estimate to re-quote at today's prices."
    },
    {
      "id": "estimates-locking",
      "title": "Why sent quotes lock",
      "body": "One rule keeps every quote honest: drafts are fully editable, sent ones are locked. Until you send, change anything — lines, prices, deposit, terms. The moment it goes out, it freezes, so what the customer saw is exactly what they approved — no arguments about a price that moved. Typo'd the phone or email? On a sent estimate, tick **Send to a different contact**, enter the right one, and hit **Resend** — the correction sticks for the reminders too. Priced it wrong? Void it and send a fresh one.",
      "tip": "Save drafts freely — nothing reaches the customer until you hit Save & send."
    }
  ]
};
