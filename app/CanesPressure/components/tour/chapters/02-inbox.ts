import type { TourChapter } from "./types";

// Generated tour content — authored + fact-checked against the code it describes.
export const INBOX: TourChapter = {
  "id": "inbox",
  "title": "Inbox & your phone line",
  "blurb": "Every text and call in one place",
  "steps": [
    {
      "id": "inbox-overview",
      "title": "Every text and call, one place",
      "body": "This is your inbox. Every text and call to your business number lands here, so nothing lives only on your personal phone.\n\nConversations are grouped: your lead vendor's feed pinned on top, then **Leads** and **Customers**, newest activity first. An orange dot marks anything you haven't dealt with yet — a new text or a missed call — and new messages show up on their own, no refreshing.\n\nThe search box finds anyone by name or phone number.",
      "route": "/CanesPressure/inbox",
      "selector": "a[href=\"/CanesPressure/inbox\"]",
      "tip": "Search by the last four digits of a phone number when you can't remember a name."
    },
    {
      "id": "inbox-conversation",
      "title": "One thread per person",
      "body": "Open a conversation and everything with that person sits in one stream, in order — texts, calls, voicemails. A voicemail card has a play button for the recording and, when there is one, a written transcript you can skim instead of listening. Estimates you text out show as an **Estimate sent** card with an **Open estimate** link.\n\nOn a wide screen, the rail on the right shows who you're talking to: job history and lifetime total for a customer; service, address, and notes for a lead.",
      "mobileBody": "Open a conversation and everything with that person sits in one stream, in order — texts, calls, voicemails. A voicemail card has a play button for the recording and, when there is one, a written transcript you can skim instead of listening. Estimates you text out show as an **Estimate sent** card.\n\nOn your phone the conversation takes the full screen — tap **Inbox** at the top left to go back. Use **View profile** or **Open lead** up top to jump to their full record."
    },
    {
      "id": "inbox-replying",
      "title": "Replying",
      "body": "Type in the box and hit **Send** — your text goes out from the business number.\n\nThe chips above the box are quick replies. Tap **On my way** or **Running 10 minutes late** and it fills the box, ready to edit or send as-is.\n\nYour own replies always send immediately, any hour of the day — only the app's automatic texts wait for morning (more on that in a moment).",
      "mobileBody": "Type in the box and tap the orange send button — your text goes out from the business number.\n\nThe chips above the box are quick replies. Tap **On my way** or **Running 10 minutes late** and it fills the box, ready to edit or send as-is. Swipe the row sideways to see them all.\n\nYour own replies always send immediately, any hour of the day — only the app's automatic texts wait for morning (more on that in a moment)."
    },
    {
      "id": "inbox-business-line",
      "title": "One number for the business",
      "body": "Your business runs on one phone number. When someone calls it, they hear a short please-hold greeting while the call rings through to your cell — about 20 seconds.\n\nAnswer, and before you're connected a voice tells you who it is: \"Canes customer, Maria, calling,\" a lead by first name, or \"New Canes lead calling.\" You know what you're picking up before you say hello.\n\nCallers only ever deal with the business number. Your personal cell stays private."
    },
    {
      "id": "inbox-calling-out",
      "title": "Calling out",
      "body": "Every **Call** button in the app works the same way: tap it and your own phone rings first — \"Calling your phone now — answer to connect.\" Pick up, and the app dials the customer and joins the two of you.\n\nOn their screen, the caller ID is your business number, not your cell. So when they call back, it rings your line and lands in this inbox with the rest of the conversation.",
      "tip": "Always dial from a **Call** button, not your phone's keypad, so customers never see your personal number."
    },
    {
      "id": "inbox-missed-calls",
      "title": "Missed calls text themselves back",
      "body": "Can't pick up? The caller gets a voicemail prompt asking for their name and address, and the app texts them on the spot: \"Sorry we missed your call - we will get back to you shortly.\" The person who almost dialed a competitor gets an answer instead of silence.\n\nA caller the app doesn't know becomes a lead automatically, so there's a card waiting for you. The missed call shows in red in your inbox, with the voicemail recording right in the conversation. You can change the text-back wording under **Missed call text** in **Settings**.",
      "tip": "Play the voicemail before calling back — callers are asked to leave their address, which is half your quote."
    },
    {
      "id": "inbox-new-numbers",
      "title": "Nothing sits unseen",
      "body": "A text from a number the app has never seen becomes a new lead automatically — nothing to type, nothing to copy over.\n\nAnd you don't have to be watching this screen. The app texts your own phone: a brand-new number pings you as a new lead, and when a known customer or lead replies, you get their name, the start of the message, and a link straight to them. Those alerts come through day or night — a lead is worth waking up for."
    },
    {
      "id": "inbox-texting-rules",
      "title": "Rules the app follows on its own",
      "body": "Two guardrails run on the app's automatic texts:\n\n- **Quiet hours** — no automatic outreach between 9 PM and 8 AM Eastern. A quote request that comes in at midnight gets its \"we got your request\" text after 8 AM, not at 12:04. The missed-call text-back still goes out on the spot, and your own replies are never held.\n- **STOP** — if anyone texts STOP, automatic texting to that number ends for good, and automatic texts like the \"we got your request\" note and the missed-call text-back say \"Reply STOP to opt out.\"\n\nTexts the app sent on its own are tagged **Auto** in the thread, so you always know what went out in your name.",
      "tip": "Adjust **Quiet hours start** and **Quiet hours end** in **Settings** if your customers keep different hours."
    }
  ]
};
