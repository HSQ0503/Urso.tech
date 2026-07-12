import type { TourChapter } from "./types";

// Tour content — condensed from the fact-checked long-form pass; every claim
// traces to code-verified copy.
export const LEADS: TourChapter = {
  "id": "leads",
  "title": "Leads",
  "blurb": "From first contact to booked visit",
  "steps": [
    {
      "id": "leads-pipeline",
      "title": "Leads: hot and cold",
      "body": "Everyone who might pay you lands here — one card per phone number, so nothing gets lost or doubled. **Hot** means the lead guy already booked the estimate visit; the card arrives with the date on it and the confirmation texting starts on its own. **Cold** is a price-shopper who needs a fast call.\n\nWhen the vendor texts a lead in, the app reads the message and fills in the card — name, phone, address, service. Every field stays editable, and the original text is kept on the lead's page.",
      "route": "/CanesPressure/leads",
      "selector": "a[href=\"/CanesPressure/leads\"]"
    },
    {
      "id": "leads-speed",
      "title": "Speed wins the job",
      "body": "A new cold lead sets off two things instantly: a hold text to the customer — request received, Sebastian will call shortly — and an alert to you. Left untouched, you're pinged again at 15 and 45 minutes; waiting cards group under **Call these now** with a live timer.\n\nOpen the lead and the **Next step** card walks the call: **Call now**, then log how it went — book the estimate, follow up, no answer, or lost. Cold leads that go quiet nudge you at 1, 3, and 7 days; snooze pauses it. A number that ever comes back lands on the same card, history intact.",
      "tip": "Call while the timer is still green — under five minutes wins jobs."
    },
    {
      "id": "leads-booking",
      "title": "Booking the visit",
      "body": "Close one on the phone? Tap **Closed - book estimate**, pick a day and time, done. From there the confirmations run themselves:\n\n- 12 hours before the visit, the customer is asked to reply YES (timing is in Settings)\n- A YES flips the lead to **Confirmed**\n- No answer? You get a heads-up 3 hours out, and a final text 2 hours out warns the slot may be released\n\nOut of the box, releasing is your call — the app never drops a booking on its own.",
      "tip": "Tap **Resend confirmation** on the lead if the customer says they never got the text."
    }
  ]
};
