import type { TourChapter } from "./types";

// Tour content — condensed from the fact-checked long-form pass; every claim
// traces to code-verified copy.
export const INBOX: TourChapter = {
  "id": "inbox",
  "title": "Inbox & your phone line",
  "blurb": "Every text and call in one place",
  "steps": [
    {
      "id": "inbox-hub",
      "title": "Every text and call, one place",
      "body": "Every text and call to your business number lands here — your lead vendor's feed pinned on top, then **Leads** and **Customers**. An orange dot marks anything you haven't dealt with; search finds anyone by name or number.\n\nOpen a conversation and everything sits in one stream — texts, calls, voicemails with a play button and a transcript you can skim. Type and **Send** to reply from the business number; the chips above the box are quick replies.",
      "route": "/CanesPressure/inbox",
      "selector": "a[href=\"/CanesPressure/inbox\"]"
    },
    {
      "id": "inbox-phone-line",
      "title": "Your phone line, upgraded",
      "body": "Calls to the business number ring your cell, and a voice tells you who it is before you're connected — \"Canes customer, Maria, calling.\" Every **Call** button in the app rings your phone first, then dials the customer, showing them the business number. Your personal cell stays private.\n\nMiss a call? The caller gets an instant text-back and a voicemail prompt, and a number the app doesn't know becomes a lead automatically. Nothing slips.",
      "tip": "Always dial from a **Call** button, not your keypad, so customers never see your personal number."
    },
    {
      "id": "inbox-guardrails",
      "title": "Texts that mind their manners",
      "body": "The app's automatic texts follow two rules on their own. **Quiet hours**: no automated outreach between 9 PM and 8 AM Eastern — an overnight request gets its reply after 8 AM (the missed-call text-back is the one exception; your own replies are never held). **STOP**: anyone who texts it is never auto-texted again.\n\nAutomatic sends are tagged **Auto** in the thread, so you always know what went out in your name. And when a known customer replies, you're alerted on your own phone — day or night."
    }
  ]
};
