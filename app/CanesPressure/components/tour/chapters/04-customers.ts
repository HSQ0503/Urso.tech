import type { TourChapter } from "./types";

// Passive chapter — sits after the practice arc so Jamie's auto-created
// customer record is live on screen while he reads it.
export const CUSTOMERS: TourChapter = {
  "id": "customers",
  "title": "Customers",
  "blurb": "Profiles, properties and history",
  "steps": [
    {
      "id": "customers-book",
      "title": "Your customer book",
      "body": "Remember approving Jamie's estimate? That approval created a customer record automatically — **Jamie Rivera (Practice)** is in this list right now, with the job, the invoice, and the $450 lifetime figure already attached. Every approval does this; **New customer** adds anyone who never came through as a lead.\n\nA profile holds the full paper trail: **Jobs**, **Estimates**, and **Invoices** tabs, **Lifetime collected** and **Open balance**, free-form notes. The app matches people by phone number, so nobody ever exists twice.",
      "route": "/CanesPressure/customers",
      "selector": "a[href=\"/CanesPressure/customers\"]",
      "tip": "Open Jamie's profile and flip through the Work history tabs."
    },
    {
      "id": "customers-properties",
      "title": "Properties and next jobs",
      "body": "**Properties** holds each customer's service addresses, with **Site notes** — where to park, the dog that bites, what you always end up hunting for. They stay pinned to the address, right where you'll look next time. (A job's own gate code and notes — the ones the run sheet prints — live on the job sheet.)\n\nStart the next job right from the profile: **New estimate** opens the builder prefilled, or **New job** books repeat work directly — the $350 driveway they do every spring — no quote needed.",
      "tip": "Write the gate code into the site notes the day you learn it."
    }
  ]
};
