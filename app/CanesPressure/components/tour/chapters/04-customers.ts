import type { TourChapter } from "./types";

// Generated tour content — authored + fact-checked against the code it describes.
export const CUSTOMERS: TourChapter = {
  "id": "customers",
  "title": "Customers",
  "blurb": "Profiles, properties and history",
  "steps": [
    {
      "id": "customers-list",
      "title": "Your customer book",
      "body": "This is everyone you've done work for. When an estimate is approved, the customer shows up here automatically. **New customer** adds someone who never came through as a lead — repeat work, a cash referral.\n\nEach row shows their property, phone, last job, and **Lifetime** — money actually collected from them — plus a due chip when they owe you. Newest activity floats to the top, and search matches name, phone, email, or address.",
      "mobileBody": "This is everyone you've done work for. When an estimate is approved, the customer shows up here automatically. The round **+** button up top adds someone who never came through as a lead — repeat work, a cash referral.\n\nEach row shows their address, phone, last job, and lifetime money collected, plus a due chip when they owe you. Newest activity floats to the top, and search matches name, phone, email, or address.",
      "route": "/CanesPressure/customers",
      "selector": "a[href=\"/CanesPressure/customers\"]",
      "tip": "Search a few digits of their phone number — the fastest way to find anyone."
    },
    {
      "id": "customers-profile",
      "title": "The customer profile",
      "body": "Tap any row to open the full profile. The buttons up top — **Call**, **Text**, **Email** — save you the phone shuffle: **Text** drops you straight into your message thread with them.\n\n**Contact info** keeps their phone, email, source, and the date they became a customer. Hit **Edit** to fix a number or a misspelled name, then **Save**. **Archive** sits in that same edit view — it tags an old customer **Archived** without deleting a thing. Every job and invoice stays, and **Unarchive** brings them back anytime."
    },
    {
      "id": "customers-properties",
      "title": "Properties and gate codes",
      "body": "**Properties** holds their service addresses. Add one with street and city, and use **Site notes (optional)** for what you always end up hunting for — the gate code, where to park, the dog that bites. Those notes stay pinned to the address, right where you'll look next time.\n\nThe first address automatically becomes the primary — the one that prefills new estimates and jobs so you never retype it. Got several? Tap **Set primary** on the one you use most. Tapping any address opens it in Google Maps.",
      "tip": "Write the gate code into the site notes the day you learn it — it stays with the address."
    },
    {
      "id": "customers-history",
      "title": "Every job, estimate, and invoice",
      "body": "The **Work history** card is this customer's full paper trail: **Jobs**, **Estimates**, and **Invoices** tabs, each with a running count. Tap a live job to jump to it on the schedule; a billed one opens its invoice. Unpaid invoices show exactly how much is still due.\n\nThe **Balance** card keeps the two numbers that matter — **Lifetime collected** and **Open balance**, what's outstanding across unpaid invoices. And **Notes** is free-form memory: the price you quoted, what they said no to last time. Hit **Save notes** and it sticks.",
      "mobileBody": "The **Work** section is this customer's full paper trail: **Jobs**, **Estimates**, and **Invoices** tabs, each with a running count. Tap a live job to jump to it on the schedule; a billed one opens its invoice. Unpaid invoices show exactly how much is still due.\n\nThe **Balance** list keeps the two numbers that matter — **Lifetime collected** and **Open balance**, what's outstanding across unpaid invoices. And **Notes** is free-form memory: the price you quoted, what they said no to last time. Hit **Save notes** and it sticks."
    },
    {
      "id": "customers-create-work",
      "title": "Start the next job from here",
      "body": "When they call for more work, start it right on the profile. In **Create new**, **New estimate** opens the builder already filled with this customer and their primary address — nothing to retype.\n\nFor repeat work that doesn't need a quote — the $350 driveway they book every spring — hit **New job** instead: name it, enter the total, pick the address, optionally a time and crew, then **Save job**. Give it a time and it goes on the schedule; skip the time and it waits in the schedule tray until you place it."
    },
    {
      "id": "customers-no-duplicates",
      "title": "One customer, never two",
      "body": "The app knows people by phone number, so a customer can't exist twice. Try to add a number that's already on file and you'll get a note that the customer already exists, with an **Open the existing customer** link to the profile that holds their history.\n\nThe same guard runs behind the scenes: an approved estimate or a new job for a known number attaches to the existing customer and fills in only the blanks — it never overwrites a name or email you've corrected.",
      "tip": "Add a phone number whenever you have one — it's how the app recognizes people."
    }
  ]
};
