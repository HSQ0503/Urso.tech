import type { TourChapter } from "./types";

// Generated tour content — authored + fact-checked against the code it describes.
export const LEADS: TourChapter = {
  "id": "leads",
  "title": "Leads",
  "blurb": "From first contact to booked visit",
  "steps": [
    {
      "id": "leads-pipeline",
      "title": "The pipeline",
      "body": "Every person who might pay you lands here — vendor texts, website requests, referrals. One card per phone number, so nothing gets lost or doubled.\n\nThe tabs slice the list — **All**, **Open**, **Hot**, **Cold**, **Won**, **Lost** — each with a live count. The page opens on **Open**: everything still in play.\n\nAs you work a lead it moves through statuses: **New**, **Contacted**, **Appointment set**, **Confirmed**, **Estimated**, and finally **Won** or **Lost**. You'll rarely set these by hand — calls, bookings, and customer replies move them for you.",
      "route": "/CanesPressure/leads",
      "selector": "a[href=\"/CanesPressure/leads\"]"
    },
    {
      "id": "leads-hot-vs-cold",
      "title": "Hot vs cold",
      "body": "**Hot** means the lead guy already booked the estimate visit — the card arrives at **Appointment set** with the date on it, and the confirmation texting starts on its own. **Cold** is a price-shopper who asked for a virtual quote: no appointment, just a number that needs a fast call.\n\nWhen the vendor texts a lead in, the app reads the message and fills in the card — name, phone, address, service, appointment. Every field stays editable, and the original text is kept on the lead's page. A **Review parse** tag means the app wasn't fully sure — give those details a quick look."
    },
    {
      "id": "leads-speed-to-lead",
      "title": "Speed wins the job",
      "body": "A cold lead is a race — a $450 driveway job goes to whoever calls first.\n\nWhen a new quote request lands, two things happen on their own:\n\n- An instant text goes to the customer — request received, Sebastian will call in a few minutes (wording editable in Settings; overnight ones wait for morning)\n- You get an alert\n\nLeft untouched, you're pinged again at 15 and 45 minutes. Waiting cards show a live timer — green under 5 minutes, amber under 15, then red — and group under **Call these now**.",
      "tip": "Call while the timer is still green — under five minutes wins jobs."
    },
    {
      "id": "leads-working-a-lead",
      "title": "Working a lead",
      "body": "Tap any card to open the lead's page — everything you need mid-call in one place.\n\n- **Next step** — always tells you the move: call, confirm, or head out\n- **Details** — name, phone, service, address, notes; edit anything, one **Save**\n- **Conversation** — the latest texts, with **Open full thread** for the whole exchange\n- **Activity** — every call, customer reply, status change, and automatic message, time-stamped\n\nUp top: one-tap call, **Text**, and **Directions** buttons for when you're already driving.",
      "tip": "Type gate codes and quoted prices into **Notes** during the call — future you will thank you."
    },
    {
      "id": "leads-call-flow",
      "title": "After the call",
      "body": "The **Next step** card gives you one big **Call now** button. The moment the call starts, the card flips to **How did the call go?** and walks the outcome:\n\n- **Closed - book estimate** — you sold the visit; the booking picker opens right there\n- **Follow up** — interested, not ready yet\n- **No answer** — log the attempt and move on\n- **Lost** — asks **Why did we lose it?** in one line\n\nCalled from your own phone instead? Tap **Already called? Log the outcome** and pick the same options."
    },
    {
      "id": "leads-booking",
      "title": "Booking the visit",
      "body": "Tap **Closed - book estimate** and the picker appears: tap a day, tap a time — slots run 8 AM to 6 PM Eastern — then **Book estimate visit**. **Custom time** handles odd hours.\n\nFrom there the confirmations run themselves:\n\n- 12 hours before the visit, a text asks the customer to reply YES — change the timing in Settings\n- A YES flips the lead to **Confirmed** and an instant see-you-then text goes back\n- No YES 3 hours out? You get a heads-up\n- 2 hours out, one final text warns the slot may be released — and you're pinged again\n\nOut of the box, releasing the slot is your call — the app warns the customer, but it never drops a booking on its own.",
      "tip": "Tap **Resend confirmation** on the lead if the customer says they never got the text."
    },
    {
      "id": "leads-staying-on-top",
      "title": "Staying on top",
      "body": "Cold leads you've talked to but not closed sit at **Contacted** — and the app won't let them rot. When one goes quiet, you get a nudge after 1 day, again at 3, and at 7.\n\n\"Call me next month\"? Open **More options** on the lead and snooze the follow-up: **Tomorrow**, **3 days**, or **Next week**. Nudges pause until then.\n\nDead? Mark it **Lost** and write the real reason.\n\nAnd if that number ever comes back — even after a **Won** or **Lost** — it lands on the same card, full history intact.",
      "tip": "Snooze instead of ignoring — the nudges stop until the day you picked."
    },
    {
      "id": "leads-add-your-own",
      "title": "Add one yourself",
      "body": "Not every lead comes through the vendor — someone flags you down mid-job or a neighbor asks for a card. Hit **Add lead** and capture it before you forget.\n\nName and a 10-digit phone are all it takes. Pick **Hot** or **Cold**; choosing **Hot** lets you set the estimate visit right on the form. Add service and address if you have them, then **Save lead**.\n\nIf that phone number already has a card, the app says so and hands you an **Open lead** link instead of making a double.",
      "mobileBody": "Not every lead comes through the vendor — someone flags you down mid-job or a neighbor asks for a card. Tap the round plus button at the top of the Leads page and capture it before you forget.\n\nName and a 10-digit phone are all it takes. Pick **Hot** or **Cold**; choosing **Hot** lets you set the estimate visit right on the form. Add service and address if you have them, then **Save lead**.\n\nIf that phone number already has a card, the app says so and hands you an **Open lead** link instead of making a double."
    }
  ]
};
