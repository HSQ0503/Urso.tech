import { ET, etLocalToIso } from "@/lib/canes/types";
import type {
  Address,
  BusinessExpense,
  CalendarEvent,
  Call,
  CatalogItem,
  Contact,
  Crew,
  Estimate,
  EstimateItem,
  Invoice,
  InvoiceItem,
  InvoiceReward,
  Job,
  JobExpense,
  JobItem,
  Lead,
  LeadEvent,
  Message,
  Payment,
  TeamMember,
} from "@/lib/canes/types";

// Demo fixtures — shown whenever CANES_SUPABASE_SECRET_KEY is absent so the
// dashboard is reviewable before the database and Twilio exist. Every phone
// number uses the reserved 555-01XX fictional range.

const now = Date.now();
const min = (n: number) => new Date(now - n * 60_000).toISOString();
const hrAhead = (n: number) => new Date(now + n * 3_600_000).toISOString();

// ET wall-time day + time-of-day for scheduler fixtures, so demo jobs land on
// real ET calendar days and survive DST — the same discipline scheduleJob uses.
// `dayOffset` walks ET days from today (0 = today) off a UTC-noon anchor;
// `hhmm` is the ET wall clock ("09:00").
const etDay = (dayOffset: number): string => {
  const todayEt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
  const anchor = new Date(`${todayEt}T12:00:00Z`);
  return new Date(anchor.getTime() + dayOffset * 86_400_000).toISOString().slice(0, 10);
};
const etAt = (dayOffset: number, hhmm: string): string => etLocalToIso(`${etDay(dayOffset)}T${hhmm}`);
const addMinutes = (iso: string, minutes: number): string =>
  new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

export const DEMO_LEADS: Lead[] = [
  {
    id: "d1",
    created_at: min(6),
    type: "cold",
    status: "new",
    name: "Maria Delgado",
    phone: "+15615550142",
    email: null,
    contact_id: null,
    address: "214 Sandpiper Way, West Palm Beach",
    service: "Driveway + pool deck",
    source: "lead_vendor",
    appointment_at: null,
    confirmed_at: null,
    lost_reason: null,
    notes: null,
    raw_message: "virtual quote — Maria Delgado 561-555-0142, driveway and pool deck, 214 Sandpiper Way WPB",
    parse_confidence: 0.94,
    opted_out: false,
    snoozed_until: null,
    last_activity_at: min(6),
  },
  {
    id: "d2",
    created_at: min(38),
    type: "cold",
    status: "new",
    name: "Rob Tanner",
    phone: "+15615550177",
    email: null,
    contact_id: null,
    address: null,
    service: "Roof wash (tile)",
    source: "lead_vendor",
    appointment_at: null,
    confirmed_at: null,
    lost_reason: null,
    notes: null,
    raw_message: "another virtual — Rob Tanner 5615550177 tile roof, wants price range",
    parse_confidence: 0.71,
    opted_out: false,
    snoozed_until: null,
    last_activity_at: min(38),
  },
  {
    id: "d3",
    created_at: min(200),
    type: "hot",
    status: "appointment_set",
    name: "Janet Whitfield",
    phone: "+15615550118",
    email: "janet.whitfield@example.com",
    contact_id: "ct4",
    address: "902 Banyan Isle Dr, Palm Beach Gardens",
    service: "House wash + gutters",
    source: "lead_vendor",
    appointment_at: etAt(1, "10:00"),
    confirmed_at: null,
    lost_reason: null,
    notes: "Gate code 4482. Two dogs, friendly.",
    raw_message: "APPT SET — Janet Whitfield tomorrow, house wash + gutters, 902 Banyan Isle PBG, 561-555-0118",
    parse_confidence: 0.97,
    opted_out: false,
    snoozed_until: null,
    last_activity_at: min(90),
  },
  {
    id: "d4",
    created_at: min(400),
    type: "hot",
    status: "confirmed",
    name: "Carl Jimenez",
    phone: "+15615550166",
    email: "carl.jimenez@example.com",
    contact_id: "ct3",
    address: "77 Flagler Promenade, West Palm Beach",
    service: "Paver sealing",
    source: "lead_vendor",
    appointment_at: etAt(1, "14:00"),
    confirmed_at: min(55),
    lost_reason: null,
    notes: null,
    raw_message: "appt — Carl Jimenez paver sealing Sat, 77 Flagler Promenade, 5615550166",
    parse_confidence: 0.92,
    opted_out: false,
    snoozed_until: null,
    last_activity_at: min(55),
  },
  {
    id: "d5",
    created_at: min(2000),
    type: "cold",
    status: "contacted",
    name: "Dana Osei",
    phone: "+15615550190",
    email: "dana.osei@example.com",
    contact_id: "ct5",
    address: "410 Lakeview Ct, Royal Palm Beach",
    service: "Whole exterior",
    source: "referral",
    appointment_at: null,
    confirmed_at: null,
    lost_reason: null,
    notes: "Referred by Carl. Comparing two quotes, call back Thursday.",
    raw_message: null,
    parse_confidence: null,
    opted_out: false,
    snoozed_until: hrAhead(20),
    last_activity_at: min(1500),
  },
  {
    id: "d6",
    created_at: min(4300),
    type: "hot",
    status: "won",
    name: "Priya Raman",
    phone: "+15615550133",
    email: "priya@example.com",
    contact_id: "ct1",
    address: "18 Coquina Ln, Palm Beach Gardens",
    service: "House wash",
    source: "website",
    appointment_at: min(2800),
    confirmed_at: min(4000),
    lost_reason: null,
    notes: "Closed at $425.",
    raw_message: null,
    parse_confidence: null,
    opted_out: false,
    snoozed_until: null,
    last_activity_at: min(2800),
  },
  {
    id: "d7",
    created_at: min(5800),
    type: "cold",
    status: "lost",
    name: "Gene Parker",
    phone: "+15615550109",
    email: null,
    contact_id: null,
    address: null,
    service: "Driveway",
    source: "lead_vendor",
    appointment_at: null,
    confirmed_at: null,
    lost_reason: "Went with a cheaper quote",
    notes: null,
    raw_message: "virtual — gene parker driveway 5615550109",
    parse_confidence: 0.88,
    opted_out: false,
    snoozed_until: null,
    last_activity_at: min(5500),
  },
  // d8 — the past-due black hole: estimate visit came and went ~26h ago with no
  // disposition, so it appears in the Today page's pastDueVisits queue.
  {
    id: "d8",
    created_at: min(3200),
    type: "hot",
    status: "appointment_set",
    name: "Luis Herrera",
    phone: "+15615550129",
    email: null,
    contact_id: null,
    address: "530 Tallgrass Ln, Wellington",
    service: "Driveway + sidewalk",
    source: "lead_vendor",
    appointment_at: min(1560),
    confirmed_at: null,
    lost_reason: null,
    notes: null,
    raw_message: "APPT — Luis Herrera driveway + sidewalk, 530 Tallgrass Ln Wellington, 5615550129",
    parse_confidence: 0.9,
    opted_out: false,
    snoozed_until: null,
    last_activity_at: min(1700),
  },
  // Won leads from the new marketing channels (0008) — recent + this-month, so
  // they populate channel attribution and the current payouts period.
  {
    id: "d20", created_at: min(9200), type: "cold", status: "won", name: "Gwen Fisher",
    phone: "+15615550210", email: "gwen.fisher@example.com", contact_id: null,
    address: "120 Egret Landing, Jupiter", service: "House wash", source: "meta_ads",
    appointment_at: null, confirmed_at: null, lost_reason: null,
    notes: "Came in from the Facebook ad.", raw_message: null, parse_confidence: null,
    opted_out: false, snoozed_until: null, last_activity_at: min(8600),
  },
  {
    id: "d21", created_at: min(6600), type: "cold", status: "won", name: "Trevor Nolan",
    phone: "+15615550211", email: null, contact_id: null,
    address: "44 Sabal Palm Dr, Palm Beach Gardens", service: "Driveway + patio", source: "yard_sign",
    appointment_at: null, confirmed_at: null, lost_reason: null,
    notes: "Saw a yard sign in the neighborhood.", raw_message: null, parse_confidence: null,
    opted_out: false, snoozed_until: null, last_activity_at: min(5700),
  },
  {
    id: "d22", created_at: min(3600), type: "cold", status: "won", name: "Bianca Reyes",
    phone: "+15615550212", email: "bianca.reyes@example.com", contact_id: null,
    address: "9 Heron Cove, Jupiter", service: "Roof wash (tile)", source: "door_hanger",
    appointment_at: null, confirmed_at: null, lost_reason: null,
    notes: "Kept the door hanger, called two weeks later.", raw_message: null, parse_confidence: null,
    opted_out: false, snoozed_until: null, last_activity_at: min(2800),
  },
];

export const DEMO_MESSAGES: Message[] = [
  // Vendor thread (raw lead drops)
  {
    id: "m1", created_at: min(6), lead_id: null, peer_phone: "+15615550001", direction: "in",
    body: "virtual quote — Maria Delgado 561-555-0142, driveway and pool deck, 214 Sandpiper Way WPB",
    media_urls: [], automated: false, twilio_sid: null, delivery_status: null,
  },
  {
    id: "m2", created_at: min(200), lead_id: null, peer_phone: "+15615550001", direction: "in",
    body: "APPT SET — Janet Whitfield tomorrow, house wash + gutters, 902 Banyan Isle PBG, 561-555-0118",
    media_urls: [], automated: false, twilio_sid: null, delivery_status: null,
  },
  // Maria (cold) — hold text sent automatically
  {
    id: "m3", created_at: min(6), lead_id: "d1", peer_phone: "+15615550142", direction: "out",
    body: "Hi Maria! This is Canes Pressure Washing. We got your request and Sebastian will call you in just a few minutes. Reply STOP to opt out.",
    media_urls: [], automated: true, twilio_sid: null, delivery_status: "delivered",
  },
  // Janet (hot) — confirmation pending
  {
    id: "m4", created_at: min(90), lead_id: "d3", peer_phone: "+15615550118", direction: "out",
    body: "Hi Janet, this is Canes Pressure Washing confirming your free estimate visit tomorrow at 902 Banyan Isle Dr. Reply YES to confirm. Reply STOP to opt out.",
    media_urls: [], automated: true, twilio_sid: null, delivery_status: "delivered",
  },
  // Carl (hot) — confirmed
  {
    id: "m5", created_at: min(60), lead_id: "d4", peer_phone: "+15615550166", direction: "out",
    body: "Hi Carl, this is Canes Pressure Washing confirming your free estimate visit Saturday at 77 Flagler Promenade. Reply YES to confirm. Reply STOP to opt out.",
    media_urls: [], automated: true, twilio_sid: null, delivery_status: "delivered",
  },
  {
    id: "m6", created_at: min(55), lead_id: "d4", peer_phone: "+15615550166", direction: "in",
    body: "YES", media_urls: [], automated: false, twilio_sid: null, delivery_status: null,
  },
  {
    id: "m7", created_at: min(54), lead_id: "d4", peer_phone: "+15615550166", direction: "out",
    body: "You are confirmed for Saturday 10:00 AM. See you then! - Canes Pressure Washing",
    media_urls: [], automated: true, twilio_sid: null, delivery_status: "delivered",
  },
  // Dana — manual conversation
  {
    id: "m8", created_at: min(1520), lead_id: "d5", peer_phone: "+15615550190", direction: "in",
    body: "Hi, Carl gave me your number. Looking to get the whole outside done before my daughter's graduation party.",
    media_urls: [], automated: false, twilio_sid: null, delivery_status: null,
  },
  {
    id: "m9", created_at: min(1500), lead_id: "d5", peer_phone: "+15615550190", direction: "out",
    body: "Hi Dana! Happy to help — I can swing by this week for a free estimate. Does Thursday afternoon work?",
    media_urls: [], automated: false, twilio_sid: null, delivery_status: "delivered",
  },
  // Priya — a past customer (won lead d6, contact ct1) texting back in. The
  // inbox should show this thread as kind "customer", not a plain lead.
  {
    id: "m10", created_at: min(60), lead_id: "d6", peer_phone: "+15615550133", direction: "in",
    body: "Hi Sebastian! The house looks amazing. Could you also quote the driveway while you're at it?",
    media_urls: [], automated: false, twilio_sid: null, delivery_status: null,
  },
  {
    id: "m11", created_at: min(58), lead_id: "d6", peer_phone: "+15615550133", direction: "out",
    body: "Thanks Priya! Absolutely — I'll text you a price this afternoon.",
    media_urls: [], automated: false, twilio_sid: null, delivery_status: "delivered",
  },
  // Frank — a cash customer with NO lead row at all (contact ct2 only). Proves
  // the customer thread kind works without a lead behind it.
  {
    id: "m12", created_at: min(40), lead_id: null, peer_phone: "+15615550155", direction: "in",
    body: "Hey, it's Frank — driveway held up great. Can y'all come back next month and do it again?",
    media_urls: [], automated: false, twilio_sid: null, delivery_status: null,
  },
];

export const DEMO_CALLS: Call[] = [
  {
    id: "c1", created_at: min(30), lead_id: "d2", peer_phone: "+15615550177", direction: "out",
    status: "no-answer", duration_seconds: 0, recording_url: null, transcript: null, twilio_sid: null,
  },
  {
    id: "c2", created_at: min(1510), lead_id: "d5", peer_phone: "+15615550190", direction: "out",
    status: "completed", duration_seconds: 340, recording_url: null, transcript: null, twilio_sid: null,
  },
  // Maria left a voicemail before the hold text went out — shows the
  // voicemail card (transcript, no recording) in the conversation stream.
  {
    id: "c3", created_at: min(8), lead_id: "d1", peer_phone: "+15615550142", direction: "in",
    status: "no-answer", duration_seconds: 24, recording_url: null,
    transcript:
      "Hi, this is Maria — I sent the request about the driveway and pool deck. Give me a call back when you get a chance. Thanks!",
    twilio_sid: null,
  },
  // Gene got a callback ~100 minutes in before going with a cheaper quote —
  // gives the Insights speed-to-lead sample a third data point.
  {
    id: "c4", created_at: min(5700), lead_id: "d7", peer_phone: "+15615550109", direction: "out",
    status: "completed", duration_seconds: 210, recording_url: null, transcript: null, twilio_sid: null,
  },
];

export const DEMO_EVENTS: LeadEvent[] = [
  { id: "e1", created_at: min(6), lead_id: "d1", kind: "created", detail: "Parsed from lead vendor text (94% confidence)", data: {} },
  { id: "e2", created_at: min(6), lead_id: "d1", kind: "automation", detail: "Hold text sent", data: {} },
  { id: "e3", created_at: min(200), lead_id: "d3", kind: "created", detail: "Parsed from lead vendor text (97% confidence)", data: {} },
  { id: "e4", created_at: min(90), lead_id: "d3", kind: "automation", detail: "Confirmation text sent (T-12h)", data: {} },
  { id: "e5", created_at: min(55), lead_id: "d4", kind: "status", detail: "Customer replied YES — appointment confirmed", data: {} },
  { id: "e6", created_at: min(2800), lead_id: "d6", kind: "status", detail: "Closed won — $425", data: {} },
  // Recent-activity texture for the Today page feed (last 8 events, joined names).
  { id: "e7", created_at: min(30), lead_id: "d4", kind: "estimate", detail: "Estimate EST-000003 approved by Carl Jimenez", data: {} },
  { id: "e8", created_at: min(1380), lead_id: "d6", kind: "invoice", detail: "Invoice INV-000001 sent ($425.00)", data: {} },
  { id: "e9", created_at: min(60), lead_id: "d6", kind: "replied", detail: "Could you also quote the driveway while you're at it?", data: {} },
  { id: "e10", created_at: min(1500), lead_id: "d5", kind: "call", detail: "Call logged — follow up: comparing two quotes", data: {} },
];

// ── Phase 3 fixtures: contacts (the customers layer) + their addresses ────────

export const DEMO_CONTACTS: Contact[] = [
  // ct1 — the repeat customer: three jobs (job3 today, job6 invoiced, job14 paid),
  // one open invoice (inv1) and one settled (inv11).
  {
    id: "ct1", created_at: min(31000), name: "Priya Raman", phone: "+15615550133",
    email: "priya@example.com", source: "website", notes: "Prefers texts. Repeat customer.",
    archived: false, last_activity_at: min(60),
  },
  // ct2 — cash-only customer, no email, no lead row behind the thread.
  {
    id: "ct2", created_at: min(3100), name: "Frank Osei", phone: "+15615550155",
    email: null, source: "referral", notes: "Pays cash on completion.",
    archived: false, last_activity_at: min(40),
  },
  // ct3 — two properties (home + rental).
  {
    id: "ct3", created_at: min(400), name: "Carl Jimenez", phone: "+15615550166",
    email: "carl.jimenez@example.com", source: "lead_vendor", notes: null,
    archived: false, last_activity_at: min(30),
  },
  {
    id: "ct4", created_at: min(200), name: "Janet Whitfield", phone: "+15615550118",
    email: "janet.whitfield@example.com", source: "lead_vendor", notes: "Gate code 4482. Two dogs, friendly.",
    archived: false, last_activity_at: min(90),
  },
  {
    id: "ct5", created_at: min(2000), name: "Dana Osei", phone: "+15615550190",
    email: "dana.osei@example.com", source: "referral", notes: "Referred by Carl.",
    archived: false, last_activity_at: min(1500),
  },
  {
    id: "ct6", created_at: min(8200), name: "Elaine Brooks", phone: "+15615550161",
    email: "elaine.brooks@example.com", source: "other", notes: null,
    archived: false, last_activity_at: min(6900),
  },
  // ct7 — the open-balance customer: first invoice was voided (wrong amount),
  // re-billed invoice is sent and now overdue.
  {
    id: "ct7", created_at: min(18000), name: "Hector Ruiz", phone: "+15615550175",
    email: "hector.ruiz@example.com", source: "website", notes: null,
    archived: false, last_activity_at: min(16400),
  },
  // ct8 — archived: moved out of the area, history kept.
  {
    id: "ct8", created_at: min(130000), name: "Walter Simms", phone: "+15615550101",
    email: null, source: "other", notes: "Moved to Tampa — keep history.",
    archived: true, last_activity_at: min(120000),
  },
];

export const DEMO_ADDRESSES: Address[] = [
  { id: "adr1", created_at: min(31000), contact_id: "ct1", line: "18 Coquina Ln, Palm Beach Gardens", site_notes: null, is_primary: true },
  { id: "adr2", created_at: min(3100), contact_id: "ct2", line: "51 Marina Blvd, West Palm Beach", site_notes: null, is_primary: true },
  { id: "adr3", created_at: min(400), contact_id: "ct3", line: "77 Flagler Promenade, West Palm Beach", site_notes: "Gate code 4417.", is_primary: true },
  { id: "adr4", created_at: min(300), contact_id: "ct3", line: "1120 Ocean Ridge Ct, Jupiter", site_notes: "Rental property — tenant is fine with crews.", is_primary: false },
  { id: "adr5", created_at: min(200), contact_id: "ct4", line: "902 Banyan Isle Dr, Palm Beach Gardens", site_notes: "Gate code 4482. Two friendly dogs.", is_primary: true },
  { id: "adr6", created_at: min(2000), contact_id: "ct5", line: "410 Lakeview Ct, Royal Palm Beach", site_notes: null, is_primary: true },
  { id: "adr7", created_at: min(8200), contact_id: "ct6", line: "12 Sailfish Ct, Palm Beach Gardens", site_notes: null, is_primary: true },
  { id: "adr8", created_at: min(18000), contact_id: "ct7", line: "63 Cypress Trace, Wellington", site_notes: null, is_primary: true },
  { id: "adr9", created_at: min(130000), contact_id: "ct8", line: "9 Pelican Pt, Lake Worth", site_notes: null, is_primary: true },
];

// ── Phase 2 fixtures: catalog, estimates, line items, jobs ───────────────────

export const DEMO_CATALOG: CatalogItem[] = [
  {
    id: "cat1", created_at: min(9000), name: "Driveway wash", description: "Concrete driveway surface clean",
    kind: "service", default_price_cents: 15000, unit: "each", taxable: false, active: true, position: 0,
  },
  {
    id: "cat2", created_at: min(9000), name: "House wash", description: "Soft wash of exterior siding",
    kind: "service", default_price_cents: 30000, unit: "each", taxable: false, active: true, position: 1,
  },
  {
    id: "cat3", created_at: min(9000), name: "Roof wash (tile)", description: "Soft wash tile roof, algae + oxidation",
    kind: "service", default_price_cents: 45000, unit: "each", taxable: false, active: true, position: 2,
  },
  {
    id: "cat4", created_at: min(9000), name: "Pool deck / paver clean", description: "Deck or paver surface clean",
    kind: "service", default_price_cents: 20000, unit: "each", taxable: false, active: true, position: 3,
  },
  {
    id: "cat5", created_at: min(9000), name: "Paver sealing", description: "Clean and seal pavers",
    kind: "service", default_price_cents: 60000, unit: "each", taxable: false, active: true, position: 4,
  },
  {
    id: "cat6", created_at: min(9000), name: "Gutter brightening", description: "Remove tiger stripes from gutters",
    kind: "service", default_price_cents: 12000, unit: "each", taxable: false, active: true, position: 5,
  },
];

export const DEMO_ESTIMATES: Estimate[] = [
  // est1 — draft for Maria (lead d1): driveway + pool deck, no deposit.
  {
    id: "est1", created_at: min(5), updated_at: min(5),
    lead_id: "d1", contact_id: null, address_id: null,
    number: "EST-000001", estimate_type: "standard", status: "draft",
    customer_name: "Maria Delgado", customer_phone: "+15615550142", customer_email: null,
    job_address: "214 Sandpiper Way, West Palm Beach", job_name: "Driveway + pool deck",
    subtotal_cents: 35000, discount_cents: 0, adjustment_cents: 0,
    tax_cents: 0, tax_rate_bps: 0, total_cents: 35000, deposit_percent: 0, deposit_cents: 0,
    message_to_customer:
      "Thanks for having us out. Here is your estimate. Tap to review the details and approve, and we will get you on the schedule. Any questions, just reply to this text.",
    terms:
      "Payment due on completion unless a deposit is agreed. Estimates are valid for 28 days. Canes Pressure Washing is not responsible for pre-existing damage, loose or failing surfaces, or oxidation revealed by cleaning. Access to water and power required. Reschedules due to weather are expected.",
    internal_notes: null, expires_at: hrAhead(28 * 24), public_token: "demo-token-est1",
    sent_at: null, viewed_at: null, approved_at: null,
    declined_at: null, decline_reason: null, signature_name: null, employee: "Sebastian",
  },
  // est2 — approved options estimate for Janet (lead d3): mandatory house wash
  // + optional gutter. Backs job5, so it must be approved before that job exists.
  {
    id: "est2", created_at: min(760), updated_at: min(705),
    lead_id: "d3", contact_id: "ct4", address_id: "adr5",
    number: "EST-000002", estimate_type: "options", status: "approved",
    customer_name: "Janet Whitfield", customer_phone: "+15615550118", customer_email: "janet.whitfield@example.com",
    job_address: "902 Banyan Isle Dr, Palm Beach Gardens", job_name: "House wash + gutters",
    subtotal_cents: 30000, discount_cents: 0, adjustment_cents: 0,
    tax_cents: 0, tax_rate_bps: 0, total_cents: 30000, deposit_percent: 25, deposit_cents: 7500,
    message_to_customer:
      "Thanks for having us out. Here is your estimate. The gutter brightening is optional — add it if you'd like. Reply with any questions.",
    terms:
      "Payment due on completion unless a deposit is agreed. Estimates are valid for 28 days. Canes Pressure Washing is not responsible for pre-existing damage, loose or failing surfaces, or oxidation revealed by cleaning. Access to water and power required. Reschedules due to weather are expected.",
    internal_notes: null, expires_at: hrAhead(28 * 24), public_token: "demo-token-est2",
    sent_at: min(750), viewed_at: min(730), approved_at: min(705),
    declined_at: null, decline_reason: null, signature_name: "Janet Whitfield", employee: "Sebastian",
  },
  // est3 — approved for Carl (lead d4): paver sealing, 50% deposit, signed.
  {
    id: "est3", created_at: min(60), updated_at: min(30),
    lead_id: "d4", contact_id: "ct3", address_id: "adr3",
    number: "EST-000003", estimate_type: "standard", status: "approved",
    customer_name: "Carl Jimenez", customer_phone: "+15615550166", customer_email: "carl.jimenez@example.com",
    job_address: "77 Flagler Promenade, West Palm Beach", job_name: "Paver sealing",
    subtotal_cents: 60000, discount_cents: 0, adjustment_cents: 0,
    tax_cents: 0, tax_rate_bps: 0, total_cents: 60000, deposit_percent: 50, deposit_cents: 30000,
    message_to_customer:
      "Thanks for having us out. Here is your estimate. Tap to review the details and approve, and we will get you on the schedule. Any questions, just reply to this text.",
    terms:
      "Payment due on completion unless a deposit is agreed. Estimates are valid for 28 days. Canes Pressure Washing is not responsible for pre-existing damage, loose or failing surfaces, or oxidation revealed by cleaning. Access to water and power required. Reschedules due to weather are expected.",
    internal_notes: null, expires_at: hrAhead(28 * 24), public_token: "demo-token-est3",
    sent_at: min(58), viewed_at: min(45), approved_at: min(30),
    declined_at: null, decline_reason: null, signature_name: "Carl Jimenez", employee: "Sebastian",
  },
  // est4 — declined ~8 days ago (win-rate texture for Insights).
  {
    id: "est4", created_at: min(12200), updated_at: min(11600),
    lead_id: null, contact_id: null, address_id: null,
    number: "EST-000004", estimate_type: "standard", status: "declined",
    customer_name: "Alan Reyes", customer_phone: "+15615550171", customer_email: null,
    job_address: "930 Sago Palm Way, Royal Palm Beach", job_name: "Roof wash (tile)",
    subtotal_cents: 38000, discount_cents: 0, adjustment_cents: 0,
    tax_cents: 0, tax_rate_bps: 0, total_cents: 38000, deposit_percent: 0, deposit_cents: 0,
    message_to_customer: "Thanks for having us out. Here is your estimate.",
    terms: "Payment due on completion unless a deposit is agreed.",
    internal_notes: null, expires_at: hrAhead(28 * 24), public_token: "demo-token-est4",
    sent_at: min(12150), viewed_at: min(11900), approved_at: null,
    declined_at: min(11600), decline_reason: "Went with a cheaper quote", signature_name: null, employee: "Sebastian",
  },
  // est5 — SENT, awaiting the customer: the state that exercises the owner's
  // "Mark approved — agreed in person" rail and the reminder automations.
  {
    id: "est5", created_at: min(2000), updated_at: min(1900),
    lead_id: null, contact_id: "ct5", address_id: null,
    number: "EST-000005", estimate_type: "standard", status: "sent",
    customer_name: "Dana Osei", customer_phone: "+15615550190", customer_email: "dana.osei@example.com",
    job_address: "410 Lakeview Ct, Royal Palm Beach", job_name: "Back patio + pool deck",
    subtotal_cents: 27500, discount_cents: 0, adjustment_cents: 0,
    tax_cents: 0, tax_rate_bps: 0, total_cents: 27500, deposit_percent: 25, deposit_cents: 6875,
    message_to_customer: "Thanks for having us out. Here is your estimate.",
    terms: "Payment due on completion unless a deposit is agreed.",
    internal_notes: null, expires_at: hrAhead(28 * 24), public_token: "demo-token-est5",
    sent_at: min(1900), viewed_at: null, approved_at: null,
    declined_at: null, decline_reason: null, signature_name: null, employee: "Sebastian",
  },
];

export const DEMO_ESTIMATE_ITEMS: EstimateItem[] = [
  // est1 lines
  {
    id: "ei1", estimate_id: "est1", catalog_id: "cat1", position: 0,
    name: "Driveway wash", description: "Concrete driveway surface clean", kind: "service", quantity: 1,
    unit_price_cents: 15000, discount_cents: 0, taxable: false, line_total_cents: 15000,
    is_option: false, is_mandatory: false, is_selected: true, package_group: null,
  },
  {
    id: "ei2", estimate_id: "est1", catalog_id: "cat4", position: 1,
    name: "Pool deck / paver clean", description: "Deck or paver surface clean", kind: "service", quantity: 1,
    unit_price_cents: 20000, discount_cents: 0, taxable: false, line_total_cents: 20000,
    is_option: false, is_mandatory: false, is_selected: true, package_group: null,
  },
  // est2 lines: mandatory house wash + optional gutter (not yet selected)
  {
    id: "ei3", estimate_id: "est2", catalog_id: "cat2", position: 0,
    name: "House wash", description: "Soft wash of exterior siding", kind: "service", quantity: 1,
    unit_price_cents: 30000, discount_cents: 0, taxable: false, line_total_cents: 30000,
    is_option: false, is_mandatory: true, is_selected: true, package_group: null,
  },
  {
    id: "ei4", estimate_id: "est2", catalog_id: "cat6", position: 1,
    name: "Gutter brightening", description: "Remove tiger stripes from gutters", kind: "service", quantity: 1,
    unit_price_cents: 12000, discount_cents: 0, taxable: false, line_total_cents: 12000,
    is_option: true, is_mandatory: false, is_selected: false, package_group: null,
  },
  // est5 line
  {
    id: "ei9", estimate_id: "est5", catalog_id: "cat4", position: 0,
    name: "Pool deck / paver clean", description: "Back patio and pool deck surface clean", kind: "service", quantity: 1,
    unit_price_cents: 27500, discount_cents: 0, taxable: false, line_total_cents: 27500,
    is_option: false, is_mandatory: false, is_selected: true, package_group: null,
  },
  // est3 line
  {
    id: "ei5", estimate_id: "est3", catalog_id: "cat5", position: 0,
    name: "Paver sealing", description: "Clean and seal pavers", kind: "service", quantity: 1,
    unit_price_cents: 60000, discount_cents: 0, taxable: false, line_total_cents: 60000,
    is_option: false, is_mandatory: false, is_selected: true, package_group: null,
  },
  // est4 line (declined)
  {
    id: "ei6", estimate_id: "est4", catalog_id: "cat3", position: 0,
    name: "Roof wash (tile)", description: "Soft wash tile roof, algae + oxidation", kind: "service", quantity: 1,
    unit_price_cents: 38000, discount_cents: 0, taxable: false, line_total_cents: 38000,
    is_option: false, is_mandatory: false, is_selected: true, package_group: null,
  },
];

// ── Phase 2 scheduler fixtures: crews, jobs, job line items, calendar events ──

export const DEMO_CREWS: Crew[] = [
  { id: "crewA", created_at: min(9000), name: "Crew A", color: "#0b6aa2", active: true, sort: 0 },
  { id: "crewB", created_at: min(9000), name: "Crew B", color: "#0f7b48", active: true, sort: 1 },
];

// Scheduled windows composed as ET wall time, so ends_at stays start + duration.
const JOB3_START = etAt(0, "09:00"); // today, Crew A
const JOB4_START = etAt(2, "13:00"); // +2 days, Crew B
const JOB5_START = etAt(1, "10:00"); // tomorrow, confirmed, Crew A

export const DEMO_JOBS: Job[] = [
  // job1 — unscheduled (tray): Carl's paver sealing, backs approved est3.
  {
    id: "job1", created_at: min(30), estimate_id: "est3", lead_id: "d4", contact_id: "ct3",
    status: "unscheduled", customer_name: "Carl Jimenez",
    job_address: "77 Flagler Promenade, West Palm Beach",
    total_cents: 60000, deposit_cents: 30000, scheduled_at: null, assigned_to: null, notes: null,
    duration_minutes: 180, ends_at: null, arrival_window_minutes: 0, crew_id: null,
    confirmed_at: null, customer_phone: "+15615550166", customer_email: "carl.jimenez@example.com", job_name: "Paver sealing",
    gate_code: "4417", site_notes: "Sealer needs 24h dry — no foot traffic after.", canceled_reason: null,
  },
  // job2 — unscheduled (tray): a second waiting job so the tray shows two.
  {
    id: "job2", created_at: min(20), estimate_id: null, lead_id: null, contact_id: null,
    status: "unscheduled", customer_name: "Maria Delgado",
    job_address: "214 Sandpiper Way, West Palm Beach",
    total_cents: 35000, deposit_cents: 0, scheduled_at: null, assigned_to: null, notes: null,
    duration_minutes: 120, ends_at: null, arrival_window_minutes: 0, crew_id: null,
    confirmed_at: null, customer_phone: "+15615550142", customer_email: null, job_name: "Driveway + pool deck",
    gate_code: null, site_notes: "Backyard spigot; front hose bib is broken.", canceled_reason: null,
  },
  // job3 — scheduled TODAY, Crew A (populates the run sheet + Today strip).
  {
    id: "job3", created_at: min(500), estimate_id: null, lead_id: "d6", contact_id: "ct1",
    status: "scheduled", customer_name: "Priya Raman",
    job_address: "18 Coquina Ln, Palm Beach Gardens",
    total_cents: 42500, deposit_cents: 0, scheduled_at: JOB3_START, assigned_to: "Crew A", notes: null,
    duration_minutes: 120, ends_at: addMinutes(JOB3_START, 120), arrival_window_minutes: 30,
    crew_id: "crewA", confirmed_at: null, customer_phone: "+15615550133", customer_email: "priya@example.com", job_name: "House wash",
    gate_code: "0916", site_notes: "Two dogs in the yard — text on the way.", canceled_reason: null,
  },
  // job4 — scheduled +2 days, Crew B.
  {
    id: "job4", created_at: min(600), estimate_id: null, lead_id: null, contact_id: "ct5",
    status: "scheduled", customer_name: "Dana Osei",
    job_address: "410 Lakeview Ct, Royal Palm Beach",
    total_cents: 78000, deposit_cents: 0, scheduled_at: JOB4_START, assigned_to: "Crew B", notes: null,
    duration_minutes: 240, ends_at: addMinutes(JOB4_START, 240), arrival_window_minutes: 0,
    crew_id: "crewB", confirmed_at: null, customer_phone: "+15615550190", customer_email: "dana.osei@example.com", job_name: "Whole exterior",
    gate_code: null, site_notes: "Graduation party Saturday — must finish by 2pm.", canceled_reason: null,
  },
  // job5 — confirmed tomorrow, Crew A (customer already replied YES).
  {
    id: "job5", created_at: min(700), estimate_id: null, lead_id: "d3", contact_id: "ct4",
    status: "confirmed", customer_name: "Janet Whitfield",
    job_address: "902 Banyan Isle Dr, Palm Beach Gardens",
    total_cents: 30000, deposit_cents: 7500, scheduled_at: JOB5_START, assigned_to: "Crew A", notes: null,
    duration_minutes: 150, ends_at: addMinutes(JOB5_START, 150), arrival_window_minutes: 0,
    crew_id: "crewA", confirmed_at: min(120), customer_phone: "+15615550118", customer_email: "janet.whitfield@example.com", job_name: "House wash + gutters",
    gate_code: "4482", site_notes: "Gate code 4482. Two friendly dogs.", canceled_reason: null,
  },
  // job6 — completed yesterday, INVOICED and awaiting card payment (backs inv1).
  {
    id: "job6", created_at: min(1600), estimate_id: null, lead_id: null, contact_id: "ct1",
    status: "invoiced", customer_name: "Priya Raman",
    job_address: "18 Coquina Ln, Palm Beach Gardens",
    total_cents: 42500, deposit_cents: 0, scheduled_at: etAt(-1, "09:00"), assigned_to: "Crew A", notes: null,
    duration_minutes: 120, ends_at: addMinutes(etAt(-1, "09:00"), 120), arrival_window_minutes: 0,
    crew_id: "crewA", confirmed_at: min(1700), customer_phone: "+15615550133", customer_email: "priya@example.com", job_name: "House wash",
    gate_code: null, site_notes: null, canceled_reason: null,
  },
  // job7 — completed + PAID in cash (backs inv2 + payment pay2).
  {
    id: "job7", created_at: min(3000), estimate_id: null, lead_id: null, contact_id: "ct2",
    status: "paid", customer_name: "Frank Osei",
    job_address: "51 Marina Blvd, West Palm Beach",
    total_cents: 25000, deposit_cents: 0, scheduled_at: etAt(-2, "14:00"), assigned_to: "Crew B", notes: null,
    duration_minutes: 90, ends_at: addMinutes(etAt(-2, "14:00"), 90), arrival_window_minutes: 0,
    crew_id: "crewB", confirmed_at: min(3100), customer_phone: "+15615550155", customer_email: null, job_name: "Driveway wash",
    gate_code: null, site_notes: null, canceled_reason: null,
  },
  // ── Historical paid work (last ~2 months) — the Insights dashboard's demo
  //    story: crew mix, cash/card mix, service variety. All terminal, so the
  //    schedule board never paints them as active blocks.
  {
    id: "job8", created_at: min(8000), estimate_id: null, lead_id: null, contact_id: "ct6",
    status: "paid", customer_name: "Elaine Brooks",
    job_address: "12 Sailfish Ct, Palm Beach Gardens",
    total_cents: 42000, deposit_cents: 0, scheduled_at: etAt(-5, "09:00"), assigned_to: "Crew A", notes: null,
    duration_minutes: 150, ends_at: addMinutes(etAt(-5, "09:00"), 150), arrival_window_minutes: 0,
    crew_id: "crewA", confirmed_at: min(8100), customer_phone: "+15615550161", customer_email: "elaine.brooks@example.com", job_name: "House wash + gutters",
    gate_code: null, site_notes: null, canceled_reason: null,
  },
  {
    id: "job9", created_at: min(18500), estimate_id: null, lead_id: null, contact_id: null,
    status: "paid", customer_name: "Marcus Webb",
    job_address: "406 Datura St, West Palm Beach",
    total_cents: 45000, deposit_cents: 0, scheduled_at: etAt(-12, "10:00"), assigned_to: "Crew B", notes: null,
    duration_minutes: 180, ends_at: addMinutes(etAt(-12, "10:00"), 180), arrival_window_minutes: 0,
    crew_id: "crewB", confirmed_at: min(18600), customer_phone: "+15615550148", customer_email: null, job_name: "Roof wash (tile)",
    gate_code: null, site_notes: null, canceled_reason: null,
  },
  {
    id: "job10", created_at: min(28500), estimate_id: null, lead_id: null, contact_id: null,
    status: "paid", customer_name: "Rosa Marino",
    job_address: "88 Gardenia Isle Dr, Royal Palm Beach",
    total_cents: 32500, deposit_cents: 0, scheduled_at: etAt(-19, "13:00"), assigned_to: "Crew A", notes: null,
    duration_minutes: 120, ends_at: addMinutes(etAt(-19, "13:00"), 120), arrival_window_minutes: 0,
    crew_id: "crewA", confirmed_at: min(28600), customer_phone: "+15615550183", customer_email: null, job_name: "Driveway + patio",
    gate_code: null, site_notes: null, canceled_reason: null,
  },
  {
    id: "job11", created_at: min(48500), estimate_id: null, lead_id: null, contact_id: null,
    status: "paid", customer_name: "Ted Alvarez",
    job_address: "27 Bimini Ln, West Palm Beach",
    total_cents: 60000, deposit_cents: 0, scheduled_at: etAt(-33, "09:30"), assigned_to: "Crew B", notes: null,
    duration_minutes: 240, ends_at: addMinutes(etAt(-33, "09:30"), 240), arrival_window_minutes: 0,
    crew_id: "crewB", confirmed_at: min(48600), customer_phone: "+15615550127", customer_email: null, job_name: "Paver sealing",
    gate_code: null, site_notes: null, canceled_reason: null,
  },
  {
    id: "job12", created_at: min(68500), estimate_id: null, lead_id: null, contact_id: null,
    status: "paid", customer_name: "Nina Kowalski",
    job_address: "301 Flamingo Dr, West Palm Beach",
    total_cents: 30000, deposit_cents: 0, scheduled_at: etAt(-47, "11:00"), assigned_to: "Crew A", notes: null,
    duration_minutes: 120, ends_at: addMinutes(etAt(-47, "11:00"), 120), arrival_window_minutes: 0,
    crew_id: "crewA", confirmed_at: min(68600), customer_phone: "+15615550139", customer_email: null, job_name: "House wash",
    gate_code: null, site_notes: null, canceled_reason: null,
  },
  {
    id: "job13", created_at: min(92000), estimate_id: null, lead_id: null, contact_id: null,
    status: "paid", customer_name: "Owen Pratt",
    job_address: "74 Ibis Blvd, Palm Beach Gardens",
    total_cents: 78000, deposit_cents: 0, scheduled_at: etAt(-63, "09:00"), assigned_to: "Crew B", notes: null,
    duration_minutes: 300, ends_at: addMinutes(etAt(-63, "09:00"), 300), arrival_window_minutes: 0,
    crew_id: "crewB", confirmed_at: min(92100), customer_phone: "+15615550152", customer_email: null, job_name: "Whole exterior",
    gate_code: null, site_notes: null, canceled_reason: null,
  },
  // job14 — Priya's third job (paid, ~3 weeks back) — makes ct1 the repeat customer.
  {
    id: "job14", created_at: min(31000), estimate_id: null, lead_id: "d6", contact_id: "ct1",
    status: "paid", customer_name: "Priya Raman",
    job_address: "18 Coquina Ln, Palm Beach Gardens",
    total_cents: 38000, deposit_cents: 0, scheduled_at: etAt(-21, "09:00"), assigned_to: "Crew A", notes: null,
    duration_minutes: 150, ends_at: addMinutes(etAt(-21, "09:00"), 150), arrival_window_minutes: 0,
    crew_id: "crewA", confirmed_at: min(31100), customer_phone: "+15615550133", customer_email: "priya@example.com", job_name: "Roof wash (tile)",
    gate_code: "0916", site_notes: null, canceled_reason: null,
  },
  // job15 — Hector's completed job: first invoice was VOIDED (wrong amount) and
  // the job was re-billed — proves the void → re-bill path end to end.
  {
    id: "job15", created_at: min(17500), estimate_id: null, lead_id: null, contact_id: "ct7",
    status: "invoiced", customer_name: "Hector Ruiz",
    job_address: "63 Cypress Trace, Wellington",
    total_cents: 36000, deposit_cents: 0, scheduled_at: etAt(-13, "09:00"), assigned_to: "Crew B", notes: null,
    duration_minutes: 120, ends_at: addMinutes(etAt(-13, "09:00"), 120), arrival_window_minutes: 0,
    crew_id: "crewB", confirmed_at: min(17600), customer_phone: "+15615550175", customer_email: "hector.ruiz@example.com", job_name: "House wash + driveway",
    gate_code: null, site_notes: null, canceled_reason: null,
  },
  // Recent paid jobs (0008) from the new channels — this-month revenue + labor,
  // so the payouts month and per-channel attribution both read healthy.
  {
    id: "job16", created_at: min(9200), estimate_id: null, lead_id: "d20", contact_id: null,
    status: "paid", customer_name: "Gwen Fisher",
    job_address: "120 Egret Landing, Jupiter",
    total_cents: 48500, deposit_cents: 0, scheduled_at: etAt(-6, "09:00"), assigned_to: "Crew A", notes: null,
    duration_minutes: 120, ends_at: addMinutes(etAt(-6, "09:00"), 120), arrival_window_minutes: 0,
    crew_id: "crewA", confirmed_at: min(8800), customer_phone: "+15615550210", customer_email: "gwen.fisher@example.com", job_name: "House wash",
    gate_code: null, site_notes: null, canceled_reason: null,
  },
  {
    id: "job17", created_at: min(6600), estimate_id: null, lead_id: "d21", contact_id: null,
    status: "paid", customer_name: "Trevor Nolan",
    job_address: "44 Sabal Palm Dr, Palm Beach Gardens",
    total_cents: 55000, deposit_cents: 0, scheduled_at: etAt(-4, "13:00"), assigned_to: "Crew B", notes: null,
    duration_minutes: 150, ends_at: addMinutes(etAt(-4, "13:00"), 150), arrival_window_minutes: 0,
    crew_id: "crewB", confirmed_at: min(5800), customer_phone: "+15615550211", customer_email: null, job_name: "Driveway + patio",
    gate_code: null, site_notes: null, canceled_reason: null,
  },
  {
    id: "job18", created_at: min(3600), estimate_id: null, lead_id: "d22", contact_id: null,
    status: "paid", customer_name: "Bianca Reyes",
    job_address: "9 Heron Cove, Jupiter",
    total_cents: 62000, deposit_cents: 0, scheduled_at: etAt(-2, "10:00"), assigned_to: "Crew A", notes: null,
    duration_minutes: 180, ends_at: addMinutes(etAt(-2, "10:00"), 180), arrival_window_minutes: 0,
    crew_id: "crewA", confirmed_at: min(2900), customer_phone: "+15615550212", customer_email: "bianca.reyes@example.com", job_name: "Roof wash (tile)",
    gate_code: null, site_notes: null, canceled_reason: null,
  },
  // job19 — COMPLETED this morning, not yet billed: the state that shows the
  // billing panel and the "Completed by mistake? Reopen" control.
  {
    id: "job19", created_at: min(1300), estimate_id: null, lead_id: null, contact_id: "ct6",
    status: "completed", customer_name: "Elaine Brooks",
    job_address: "12 Sailfish Ct, Palm Beach Gardens",
    total_cents: 28000, deposit_cents: 0, scheduled_at: etAt(0, "07:30"), assigned_to: "Crew B", notes: null,
    duration_minutes: 120, ends_at: addMinutes(etAt(0, "07:30"), 120), arrival_window_minutes: 0,
    crew_id: "crewB", confirmed_at: min(1200), customer_phone: "+15615550161", customer_email: "elaine.brooks@example.com", job_name: "Driveway + walkway wash",
    gate_code: null, site_notes: null, canceled_reason: null,
  },
];

// Per-job expenses (0007) — materials/gas/dump/sub across paid jobs so Insights
// shows true margin and per-crew profit. crew_id snapshots the job's crew.
export const DEMO_EXPENSES: JobExpense[] = [
  { id: "exp1",  created_at: min(2980),  job_id: "job7",  amount_cents: 3500,  category: "Gas / travel",  note: null, crew_id: "crewB", created_by: null },
  { id: "exp2",  created_at: min(7950),  job_id: "job8",  amount_cents: 6000,  category: "Materials",     note: "SH + surfactant", crew_id: "crewA", created_by: null },
  { id: "exp3",  created_at: min(18450), job_id: "job9",  amount_cents: 5000,  category: "Materials",     note: null, crew_id: "crewB", created_by: null },
  { id: "exp4",  created_at: min(18440), job_id: "job9",  amount_cents: 2000,  category: "Dump fee",      note: null, crew_id: "crewB", created_by: null },
  { id: "exp5",  created_at: min(28450), job_id: "job10", amount_cents: 2500,  category: "Gas / travel",  note: null, crew_id: "crewA", created_by: null },
  { id: "exp6",  created_at: min(48450), job_id: "job11", amount_cents: 9000,  category: "Materials",     note: "Sealer, 2 buckets", crew_id: "crewB", created_by: null },
  { id: "exp7",  created_at: min(48440), job_id: "job11", amount_cents: 12000, category: "Subcontractor", note: "Extra hand for the day", crew_id: "crewB", created_by: null },
  { id: "exp8",  created_at: min(68450), job_id: "job12", amount_cents: 4000,  category: "Materials",     note: null, crew_id: "crewA", created_by: null },
  { id: "exp9",  created_at: min(91950), job_id: "job13", amount_cents: 11000, category: "Materials",     note: null, crew_id: "crewB", created_by: null },
  { id: "exp10", created_at: min(30950), job_id: "job14", amount_cents: 3000,  category: "Gas / travel",  note: null, crew_id: "crewA", created_by: null },
];

// Business / overhead expenses (0008) — subscriptions, insurance, truck, gear.
// Recurring rows drive the monthly-overhead total + the payouts P&L; one-time
// rows count in the month they land. incurred_on is an ET date string.
export const DEMO_BUSINESS_EXPENSES: BusinessExpense[] = [
  { id: "be1", created_at: min(120000), name: "Urso platform",              amount_cents: 20000, category: "Software",        recurring: true,  frequency: "monthly",  incurred_on: etDay(-120), ends_on: null, active: true, note: "Monthly retainer" },
  { id: "be2", created_at: min(150000), name: "General liability insurance", amount_cents: 18000, category: "Insurance",       recurring: true,  frequency: "monthly",  incurred_on: etDay(-150), ends_on: null, active: true, note: null },
  { id: "be3", created_at: min(200000), name: "Truck payment",              amount_cents: 35000, category: "Truck / vehicle", recurring: true,  frequency: "monthly",  incurred_on: etDay(-200), ends_on: null, active: true, note: "F-250" },
  { id: "be4", created_at: min(90000),  name: "Website + hosting",          amount_cents: 3000,  category: "Software",        recurring: true,  frequency: "monthly",  incurred_on: etDay(-90),  ends_on: null, active: true, note: null },
  { id: "be5", created_at: min(50000),  name: "Surface cleaner attachment", amount_cents: 42000, category: "Equipment",       recurring: false, frequency: "one_time", incurred_on: etDay(-45),  ends_on: null, active: true, note: "16in whirl-a-way" },
  { id: "be6", created_at: min(30000),  name: "LLC annual filing",          amount_cents: 15000, category: "Other",           recurring: true,  frequency: "yearly",   incurred_on: etDay(-12),  ends_on: null, active: true, note: null },
];

// Team + comp (0008). Owner/partner split the distributable profit (60/40); the
// ops manager takes 20% of gross; workers are hourly, tied to a crew for the
// labor-hours proxy.
export const DEMO_TEAM: TeamMember[] = [
  { id: "tm1", created_at: min(120000), name: "Sebastian",       role: "owner",       comp_type: "profit_split", comp_bps: 6000, hourly_cents: 0,    crew_id: null,    active: true, sort: 0 },
  { id: "tm2", created_at: min(120000), name: "Ricky (brother)", role: "partner",     comp_type: "profit_split", comp_bps: 4000, hourly_cents: 0,    crew_id: null,    active: true, sort: 1 },
  { id: "tm3", created_at: min(100000), name: "Diego",           role: "ops_manager", comp_type: "profit_share", comp_bps: 2000, hourly_cents: 0,    crew_id: null,    active: true, sort: 2 },
  { id: "tm4", created_at: min(80000),  name: "Luis",            role: "worker",      comp_type: "hourly",       comp_bps: 0,    hourly_cents: 2000, crew_id: "crewA", active: true, sort: 3 },
  { id: "tm5", created_at: min(80000),  name: "Andre",           role: "worker",      comp_type: "hourly",       comp_bps: 0,    hourly_cents: 2000, crew_id: "crewB", active: true, sort: 4 },
];

export const DEMO_JOB_ITEMS: JobItem[] = [
  // job1 — paver sealing
  {
    id: "ji1", job_id: "job1", estimate_item_id: "ei5", position: 0,
    name: "Paver sealing", description: "Clean and seal pavers", quantity: 1,
    line_total_cents: 60000, done: false,
  },
  // job2 — driveway + pool deck
  {
    id: "ji2", job_id: "job2", estimate_item_id: "ei1", position: 0,
    name: "Driveway wash", description: "Concrete driveway surface clean", quantity: 1,
    line_total_cents: 15000, done: false,
  },
  {
    id: "ji3", job_id: "job2", estimate_item_id: "ei2", position: 1,
    name: "Pool deck / paver clean", description: "Deck or paver surface clean", quantity: 1,
    line_total_cents: 20000, done: false,
  },
  // job3 — house wash today
  {
    id: "ji4", job_id: "job3", estimate_item_id: null, position: 0,
    name: "House wash (soft wash)", description: "Soft wash of exterior siding", quantity: 1,
    line_total_cents: 42500, done: false,
  },
  // job4 — whole exterior
  {
    id: "ji5", job_id: "job4", estimate_item_id: null, position: 0,
    name: "House wash (soft wash)", description: "Soft wash of exterior siding", quantity: 1,
    line_total_cents: 30000, done: false,
  },
  {
    id: "ji6", job_id: "job4", estimate_item_id: null, position: 1,
    name: "Driveway wash", description: "Concrete driveway surface clean", quantity: 1,
    line_total_cents: 15000, done: false,
  },
  {
    id: "ji7", job_id: "job4", estimate_item_id: null, position: 2,
    name: "Roof soft-wash (tile)", description: "Soft wash tile roof, algae + oxidation", quantity: 1,
    line_total_cents: 33000, done: false,
  },
  // job5 — house wash + gutters, confirmed
  {
    id: "ji8", job_id: "job5", estimate_item_id: "ei3", position: 0,
    name: "House wash", description: "Soft wash of exterior siding", quantity: 1,
    line_total_cents: 30000, done: false,
  },
  {
    id: "ji9", job_id: "job5", estimate_item_id: "ei4", position: 1,
    name: "Gutter brightening", description: "Remove tiger stripes from gutters", quantity: 1,
    line_total_cents: 12000, done: true,
  },
  // job6 — house wash (invoiced, unpaid)
  {
    id: "ji10", job_id: "job6", estimate_item_id: null, position: 0,
    name: "House wash (soft wash)", description: "Soft wash of exterior siding", quantity: 1,
    line_total_cents: 42500, done: true,
  },
  // job7 — driveway (paid cash)
  {
    id: "ji11", job_id: "job7", estimate_item_id: null, position: 0,
    name: "Driveway wash", description: "Concrete driveway surface clean", quantity: 1,
    line_total_cents: 25000, done: true,
  },
  // job14 — Priya's roof wash (paid)
  {
    id: "ji12", job_id: "job14", estimate_item_id: null, position: 0,
    name: "Roof wash (tile)", description: "Soft wash tile roof, algae + oxidation", quantity: 1,
    line_total_cents: 38000, done: true,
  },
  // job15 — Hector's house wash + driveway (re-billed)
  {
    id: "ji13", job_id: "job15", estimate_item_id: null, position: 0,
    name: "House wash", description: "Soft wash of exterior siding", quantity: 1,
    line_total_cents: 26000, done: true,
  },
  {
    id: "ji14", job_id: "job15", estimate_item_id: null, position: 1,
    name: "Driveway wash", description: "Concrete driveway surface clean", quantity: 1,
    line_total_cents: 10000, done: true,
  },
];

export const DEMO_CALENDAR_EVENTS: CalendarEvent[] = [
  // Crew B off Friday afternoon (index +4 days) — shows the muted band + a
  // conflict-warn scenario if a job is dropped onto it.
  {
    id: "cev1", created_at: min(3000), title: "Crew B — afternoon off",
    starts_at: etAt(4, "12:00"), ends_at: etAt(4, "17:00"), all_day: false,
    crew_id: "crewB", kind: "time_off", notes: "Equipment maintenance.",
  },
];

// ── Phase 2.5 fixtures: invoices, invoice line items, payments ────────────────

export const DEMO_INVOICES: Invoice[] = [
  // inv1 — SENT, awaiting card payment (backs completed job6).
  {
    id: "inv1", created_at: min(1400), updated_at: min(1380),
    job_id: "job6", estimate_id: null, lead_id: "d6", contact_id: "ct1",
    number: "INV-000001", status: "sent",
    customer_name: "Priya Raman", customer_phone: "+15615550133", customer_email: "priya@example.com",
    job_address: "18 Coquina Ln, Palm Beach Gardens", job_name: "House wash",
    subtotal_cents: 42500, adjustment_cents: 0, tax_cents: 0, tax_rate_bps: 0,
    total_cents: 42500, amount_paid_cents: 0,
    message_to_customer:
      "Thanks for choosing Canes Pressure Washing! Your invoice is ready. Tap to view the details and pay securely online, or reply to this text with any questions.",
    terms:
      "Payment is due upon receipt. Thank you for your business. Canes Pressure Washing is not responsible for pre-existing damage, loose or failing surfaces, or oxidation revealed by cleaning.",
    internal_notes: null, public_token: "demo-token-inv1",
    square_invoice_id: null, square_order_id: null, hosted_payment_url: null,
    sent_at: min(1380), viewed_at: min(1200), paid_at: null, voided_at: null, employee: "Sebastian",
  },
  // inv2 — PAID in cash (backs job7 + payment pay2).
  {
    id: "inv2", created_at: min(2900), updated_at: min(2880),
    job_id: "job7", estimate_id: null, lead_id: null, contact_id: "ct2",
    number: "INV-000002", status: "paid",
    customer_name: "Frank Osei", customer_phone: "+15615550155", customer_email: null,
    job_address: "51 Marina Blvd, West Palm Beach", job_name: "Driveway wash",
    subtotal_cents: 25000, adjustment_cents: 0, tax_cents: 0, tax_rate_bps: 0,
    total_cents: 25000, amount_paid_cents: 25000,
    message_to_customer:
      "Thanks for choosing Canes Pressure Washing! Your invoice is ready.",
    terms:
      "Payment is due upon receipt. Thank you for your business.",
    internal_notes: null, public_token: "demo-token-inv2",
    square_invoice_id: null, square_order_id: null, hosted_payment_url: null,
    sent_at: null, viewed_at: null, paid_at: min(2880), voided_at: null, employee: "Sebastian",
  },
  // ── Historical paid invoices backing job8–job13 (Insights demo history).
  ...([
    { n: 3, job: "job8", name: "Elaine Brooks", phone: "+15615550161", addr: "12 Sailfish Ct, Palm Beach Gardens", jobName: "House wash + gutters", total: 42000, at: 6900, contact: "ct6", email: "elaine.brooks@example.com" },
    { n: 4, job: "job9", name: "Marcus Webb", phone: "+15615550148", addr: "406 Datura St, West Palm Beach", jobName: "Roof wash (tile)", total: 45000, at: 17100, contact: null, email: null },
    { n: 5, job: "job10", name: "Rosa Marino", phone: "+15615550183", addr: "88 Gardenia Isle Dr, Royal Palm Beach", jobName: "Driveway + patio", total: 32500, at: 27200, contact: null, email: null },
    { n: 6, job: "job11", name: "Ted Alvarez", phone: "+15615550127", addr: "27 Bimini Ln, West Palm Beach", jobName: "Paver sealing", total: 60000, at: 47300, contact: null, email: null },
    { n: 7, job: "job12", name: "Nina Kowalski", phone: "+15615550139", addr: "301 Flamingo Dr, West Palm Beach", jobName: "House wash", total: 30000, at: 67200, contact: null, email: null },
    { n: 8, job: "job13", name: "Owen Pratt", phone: "+15615550152", addr: "74 Ibis Blvd, Palm Beach Gardens", jobName: "Whole exterior", total: 78000, at: 90800, contact: null, email: null },
  ].map((r): Invoice => ({
    id: `inv${r.n}`, created_at: min(r.at + 60), updated_at: min(r.at),
    job_id: r.job, estimate_id: null, lead_id: null, contact_id: r.contact ?? null,
    number: `INV-${String(r.n).padStart(6, "0")}`, status: "paid",
    customer_name: r.name, customer_phone: r.phone, customer_email: r.email ?? null,
    job_address: r.addr, job_name: r.jobName,
    subtotal_cents: r.total, adjustment_cents: 0, tax_cents: 0, tax_rate_bps: 0,
    total_cents: r.total, amount_paid_cents: r.total,
    message_to_customer: "Thanks for choosing Canes Pressure Washing!",
    terms: "Payment is due upon receipt. Thank you for your business.",
    internal_notes: null, public_token: `demo-token-inv${r.n}`,
    square_invoice_id: null, square_order_id: null, hosted_payment_url: null,
    sent_at: min(r.at + 45), viewed_at: null, paid_at: min(r.at), voided_at: null, employee: "Sebastian",
  }))),
  // ── The void → re-bill pair on job15 (both rows share job_id; only one is
  //    live thanks to 0006's partial unique index). inv9 was billed at the wrong
  //    amount and voided; inv10 is the corrected re-bill, still unpaid + overdue.
  {
    id: "inv9", created_at: min(17000), updated_at: min(16500),
    job_id: "job15", estimate_id: null, lead_id: null, contact_id: "ct7",
    number: "INV-000009", status: "void",
    customer_name: "Hector Ruiz", customer_phone: "+15615550175", customer_email: "hector.ruiz@example.com",
    job_address: "63 Cypress Trace, Wellington", job_name: "House wash + driveway",
    subtotal_cents: 63000, adjustment_cents: 0, tax_cents: 0, tax_rate_bps: 0,
    total_cents: 63000, amount_paid_cents: 0,
    message_to_customer: "Thanks for choosing Canes Pressure Washing!",
    terms: "Payment is due upon receipt. Thank you for your business.",
    internal_notes: "Billed the wrong amount — voided and re-billed as INV-000010.",
    public_token: "demo-token-inv9",
    square_invoice_id: null, square_order_id: null, hosted_payment_url: null,
    sent_at: min(16900), viewed_at: null, paid_at: null, voided_at: min(16500), employee: "Sebastian",
  },
  {
    id: "inv10", created_at: min(16400), updated_at: min(16400),
    job_id: "job15", estimate_id: null, lead_id: null, contact_id: "ct7",
    number: "INV-000010", status: "sent",
    customer_name: "Hector Ruiz", customer_phone: "+15615550175", customer_email: "hector.ruiz@example.com",
    job_address: "63 Cypress Trace, Wellington", job_name: "House wash + driveway",
    subtotal_cents: 36000, adjustment_cents: 0, tax_cents: 0, tax_rate_bps: 0,
    total_cents: 36000, amount_paid_cents: 0,
    message_to_customer: "Thanks for choosing Canes Pressure Washing! Corrected invoice.",
    terms: "Payment is due upon receipt. Thank you for your business.",
    internal_notes: null, public_token: "demo-token-inv10",
    square_invoice_id: null, square_order_id: null, hosted_payment_url: null,
    sent_at: min(16400), viewed_at: null, paid_at: null, voided_at: null, employee: "Sebastian",
  },
  // inv11 — Priya's third job, settled by card (repeat-customer lifetime value).
  {
    id: "inv11", created_at: min(30600), updated_at: min(30500),
    job_id: "job14", estimate_id: null, lead_id: "d6", contact_id: "ct1",
    number: "INV-000011", status: "paid",
    customer_name: "Priya Raman", customer_phone: "+15615550133", customer_email: "priya@example.com",
    job_address: "18 Coquina Ln, Palm Beach Gardens", job_name: "Roof wash (tile)",
    subtotal_cents: 38000, adjustment_cents: 0, tax_cents: 0, tax_rate_bps: 0,
    total_cents: 38000, amount_paid_cents: 38000,
    message_to_customer: "Thanks for choosing Canes Pressure Washing!",
    terms: "Payment is due upon receipt. Thank you for your business.",
    internal_notes: null, public_token: "demo-token-inv11",
    square_invoice_id: null, square_order_id: null, hosted_payment_url: null,
    sent_at: min(30550), viewed_at: min(30520), paid_at: min(30500), voided_at: null, employee: "Sebastian",
  },
];

export const DEMO_INVOICE_ITEMS: InvoiceItem[] = [
  {
    id: "ii1", invoice_id: "inv1", job_item_id: "ji10", position: 0,
    name: "House wash (soft wash)", description: "Soft wash of exterior siding", quantity: 1,
    unit_price_cents: 42500, line_total_cents: 42500,
  },
  {
    id: "ii2", invoice_id: "inv2", job_item_id: "ji11", position: 0,
    name: "Driveway wash", description: "Concrete driveway surface clean", quantity: 1,
    unit_price_cents: 25000, line_total_cents: 25000,
  },
  // Historical paid line items — the "Top services" demo data. Names align with
  // the catalog so revenue-by-service groups cleanly.
  ...([
    { n: 3, inv: "inv3", lines: [["House wash", 30000], ["Gutter brightening", 12000]] },
    { n: 5, inv: "inv4", lines: [["Roof wash (tile)", 45000]] },
    { n: 7, inv: "inv5", lines: [["Driveway wash", 15000], ["Pool deck / paver clean", 17500]] },
    { n: 9, inv: "inv6", lines: [["Paver sealing", 60000]] },
    { n: 11, inv: "inv7", lines: [["House wash", 30000]] },
    { n: 12, inv: "inv8", lines: [["House wash", 30000], ["Driveway wash", 15000], ["Roof wash (tile)", 33000]] },
  ].flatMap((r) =>
    r.lines.map(([name, cents], i): InvoiceItem => ({
      id: `ii${r.n + i}`, invoice_id: r.inv, job_item_id: null, position: i,
      name: name as string, description: null, quantity: 1,
      unit_price_cents: cents as number, line_total_cents: cents as number,
    })),
  )),
  // inv9 (voided at the wrong price) / inv10 (corrected re-bill) / inv11 (Priya).
  {
    id: "ii20", invoice_id: "inv9", job_item_id: "ji13", position: 0,
    name: "House wash + driveway", description: null, quantity: 1,
    unit_price_cents: 63000, line_total_cents: 63000,
  },
  {
    id: "ii21", invoice_id: "inv10", job_item_id: "ji13", position: 0,
    name: "House wash", description: "Soft wash of exterior siding", quantity: 1,
    unit_price_cents: 26000, line_total_cents: 26000,
  },
  {
    id: "ii22", invoice_id: "inv10", job_item_id: "ji14", position: 1,
    name: "Driveway wash", description: "Concrete driveway surface clean", quantity: 1,
    unit_price_cents: 10000, line_total_cents: 10000,
  },
  {
    id: "ii23", invoice_id: "inv11", job_item_id: "ji12", position: 0,
    name: "Roof wash (tile)", description: "Soft wash tile roof, algae + oxidation", quantity: 1,
    unit_price_cents: 38000, line_total_cents: 38000,
  },
];

export const DEMO_PAYMENTS: Payment[] = [
  // inv2 was settled in cash — one manual ledger row.
  {
    id: "pay2", created_at: min(2880), invoice_id: "inv2", job_id: "job7",
    amount_cents: 25000, currency: "USD", method: "cash", source: "manual",
    status: "completed", square_payment_id: null, external_event_id: null,
    recorded_by: "owner", note: null,
  },
  // Historical ledger rows backing inv3–inv8 — cash/card mix spread over ~2
  // months so the Insights collected trend + method share have real shape.
  ...([
    { n: 3, inv: "inv3", job: "job8", cents: 42000, at: 6900, method: "card" },
    { n: 4, inv: "inv4", job: "job9", cents: 45000, at: 17100, method: "card" },
    { n: 5, inv: "inv5", job: "job10", cents: 32500, at: 27200, method: "cash" },
    { n: 6, inv: "inv6", job: "job11", cents: 60000, at: 47300, method: "card" },
    { n: 7, inv: "inv7", job: "job12", cents: 30000, at: 67200, method: "cash" },
    { n: 8, inv: "inv8", job: "job13", cents: 78000, at: 90800, method: "card" },
  ].map((r): Payment => ({
    id: `pay${r.n}`, created_at: min(r.at), invoice_id: r.inv, job_id: r.job,
    amount_cents: r.cents, currency: "USD", method: r.method as Payment["method"],
    source: r.method === "card" ? "square_webhook" : "manual",
    status: "completed",
    square_payment_id: r.method === "card" ? `demo-sq-pay-${r.n}` : null,
    external_event_id: null,
    recorded_by: r.method === "card" ? "square" : "owner", note: null,
  }))),
  // inv11 — Priya's repeat job, settled by card through Square.
  {
    id: "pay9", created_at: min(30500), invoice_id: "inv11", job_id: "job14",
    amount_cents: 38000, currency: "USD", method: "card", source: "square_webhook",
    status: "completed", square_payment_id: "demo-sq-pay-9", external_event_id: null,
    recorded_by: "square", note: null,
  },
  // Payments for the new-channel jobs (0008) — this-month collected.
  {
    id: "pay10", created_at: min(8600), invoice_id: null, job_id: "job16",
    amount_cents: 48500, currency: "USD", method: "card", source: "square_webhook",
    status: "completed", square_payment_id: "demo-sq-pay-10", external_event_id: null,
    recorded_by: "square", note: null,
  },
  {
    id: "pay11", created_at: min(5700), invoice_id: null, job_id: "job17",
    amount_cents: 55000, currency: "USD", method: "cash", source: "manual",
    status: "completed", square_payment_id: null, external_event_id: null,
    recorded_by: "owner", note: null,
  },
  {
    id: "pay12", created_at: min(2800), invoice_id: null, job_id: "job18",
    amount_cents: 62000, currency: "USD", method: "card", source: "square_webhook",
    status: "completed", square_payment_id: "demo-sq-pay-12", external_event_id: null,
    recorded_by: "square", note: null,
  },
];

// ── 0012 fixtures: review rewards on inv1 (the SENT invoice) ──────────────────
// One of each customer-visible state without an `approved` row — inv1's stored
// total_cents must keep matching its recompute (approved rewards subtract from
// the total, and fixtures are hand-maintained).
export const DEMO_INVOICE_REWARDS: InvoiceReward[] = [
  {
    id: "rw1", created_at: min(1395), updated_at: min(1395), invoice_id: "inv1",
    kind: "google_review", label: "Google review", amount_cents: 1500,
    status: "offered", claimed_at: null, resolved_at: null, resolved_by: null,
  },
  {
    id: "rw2", created_at: min(1395), updated_at: min(240), invoice_id: "inv1",
    kind: "facebook_review", label: "Facebook review", amount_cents: 1500,
    status: "claimed", claimed_at: min(240), resolved_at: null, resolved_by: null,
  },
  {
    id: "rw3", created_at: min(1395), updated_at: min(1395), invoice_id: "inv1",
    kind: "social_follow", label: "Instagram + Facebook follow", amount_cents: 1000,
    status: "offered", claimed_at: null, resolved_at: null, resolved_by: null,
  },
];
