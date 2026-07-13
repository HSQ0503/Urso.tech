import type { TourChapter } from "./types";

// Practice arc — every instruction was verified against the real UI labels.
export const LEADS: TourChapter = {
  "id": "leads",
  "title": "Practice: your first lead",
  "blurb": "Work a real lead, start to booked visit",
  "steps": [
    {
      "id": "leads-meet-jamie",
      "title": "Meet Jamie",
      "body": "Time to drive. We've just added a practice lead — **Jamie Rivera (Practice)** — and everything about them is real: they'll flow through the same pipeline as a paying customer, and when the tour ends we delete every trace automatically. Your real numbers stay untouched.\n\nJamie is a **cold** lead: a price-shopper who texted in with no appointment. (**Hot** leads arrive from the lead guy with the visit already booked — the app reads his texts and fills the card in for you.) Two things to expect during practice: texts the app sends Jamie show **Not delivered** (the number's fictional), and any alerts that reach your own phone or inbox are the real automations firing. Find Jamie under **Call these now**.",
      "route": "/CanesPressure/leads",
      "onEnter": "practice-seed",
      "tip": "Open **Jamie Rivera (Practice)** now — the rest of the tour works this lead."
    },
    {
      "id": "leads-work-jamie",
      "title": "Log the call",
      "body": "This is the lead page: the conversation (Jamie's text is in there), editable details, and the **Next step** card that always tells you the move.\n\nNormally you'd hit **Call now** — your phone rings first, then it dials them. Jamie's number is fictional, so use the other path: tap **Already called? Log the outcome**, then **Closed - book estimate**. That's the same flow you'll use whenever you've already talked to someone from your own phone.\n\nHad this been real and untouched, the app would have held Jamie with an instant text and pinged you at 15 and 45 minutes.",
      "tip": "Tap **Already called? Log the outcome**, then **Closed - book estimate**."
    },
    {
      "id": "leads-book-jamie",
      "title": "Book the visit",
      "body": "The picker is open: tap tomorrow, pick a morning slot, then **Book estimate visit**.\n\nThe moment you book, the machine arms itself:\n\n- 12 hours before the visit, Jamie would be texted to reply YES\n- A YES flips the lead to **Confirmed**; no answer warns you 3 hours out\n- A final text 2 hours out says the slot may be released — releasing is always your call\n\nJamie can't reply (fictional number), but that's the whole loop a real customer walks. Next: the quote.",
      "tip": "Pick any slot tomorrow morning and hit **Book estimate visit**."
    }
  ]
};
