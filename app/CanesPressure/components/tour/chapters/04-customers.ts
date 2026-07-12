import type { TourChapter } from "./types";

// Tour content — condensed from the fact-checked long-form pass; every claim
// traces to code-verified copy.
export const CUSTOMERS: TourChapter = {
  "id": "customers",
  "title": "Customers",
  "blurb": "Profiles, properties and history",
  "steps": [
    {
      "id": "customers-book",
      "title": "Your customer book",
      "body": "An approved estimate creates the customer automatically; **New customer** adds anyone who never came through as a lead. Each row shows their property, phone, last job, and **Lifetime** — money actually collected from them — plus a due chip when they owe you.\n\nThe profile holds the full paper trail: **Jobs**, **Estimates**, and **Invoices** tabs, **Lifetime collected** and **Open balance**, and free-form notes. The app matches people by phone number, so nobody ever exists twice.",
      "route": "/CanesPressure/customers",
      "selector": "a[href=\"/CanesPressure/customers\"]"
    },
    {
      "id": "customers-properties",
      "title": "Properties, gate codes, next jobs",
      "body": "**Properties** holds their service addresses, each with **Site notes** — where to park, the dog that bites, what you always end up hunting for. They stay pinned to the address, right where you'll look next time. (A job's own gate code and notes — the ones the crew's run sheet prints — live on the job sheet.)\n\nStart the next job right from the profile: **New estimate** opens the builder prefilled, or **New job** books repeat work directly — the $350 driveway they do every spring — no quote needed.",
      "tip": "Write the gate code into the site notes the day you learn it — it stays with the address."
    }
  ]
};
