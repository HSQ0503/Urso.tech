import { ET, etLocalToIso } from "@/lib/canes/types";
import type {
  CalendarEvent,
  Call,
  CatalogItem,
  Crew,
  Estimate,
  EstimateItem,
  Invoice,
  InvoiceItem,
  Job,
  JobItem,
  Lead,
  LeadEvent,
  Message,
  Payment,
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
    address: "902 Banyan Isle Dr, Palm Beach Gardens",
    service: "House wash + gutters",
    source: "lead_vendor",
    appointment_at: hrAhead(9),
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
    address: "77 Flagler Promenade, West Palm Beach",
    service: "Paver sealing",
    source: "lead_vendor",
    appointment_at: hrAhead(27),
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
];

export const DEMO_EVENTS: LeadEvent[] = [
  { id: "e1", created_at: min(6), lead_id: "d1", kind: "created", detail: "Parsed from lead vendor text (94% confidence)", data: {} },
  { id: "e2", created_at: min(6), lead_id: "d1", kind: "automation", detail: "Hold text sent", data: {} },
  { id: "e3", created_at: min(200), lead_id: "d3", kind: "created", detail: "Parsed from lead vendor text (97% confidence)", data: {} },
  { id: "e4", created_at: min(90), lead_id: "d3", kind: "automation", detail: "Confirmation text sent (T-12h)", data: {} },
  { id: "e5", created_at: min(55), lead_id: "d4", kind: "status", detail: "Customer replied YES — appointment confirmed", data: {} },
  { id: "e6", created_at: min(2800), lead_id: "d6", kind: "status", detail: "Closed won — $425", data: {} },
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
  // est2 — sent with options for Janet (lead d3): mandatory house wash + optional gutter.
  {
    id: "est2", created_at: min(130), updated_at: min(120),
    lead_id: "d3", contact_id: null, address_id: null,
    number: "EST-000002", estimate_type: "options", status: "sent",
    customer_name: "Janet Whitfield", customer_phone: "+15615550118", customer_email: null,
    job_address: "902 Banyan Isle Dr, Palm Beach Gardens", job_name: "House wash + gutters",
    subtotal_cents: 30000, discount_cents: 0, adjustment_cents: 0,
    tax_cents: 0, tax_rate_bps: 0, total_cents: 30000, deposit_percent: 25, deposit_cents: 7500,
    message_to_customer:
      "Thanks for having us out. Here is your estimate. The gutter brightening is optional — add it if you'd like. Reply with any questions.",
    terms:
      "Payment due on completion unless a deposit is agreed. Estimates are valid for 28 days. Canes Pressure Washing is not responsible for pre-existing damage, loose or failing surfaces, or oxidation revealed by cleaning. Access to water and power required. Reschedules due to weather are expected.",
    internal_notes: null, expires_at: hrAhead(28 * 24), public_token: "demo-token-est2",
    sent_at: min(120), viewed_at: null, approved_at: null,
    declined_at: null, decline_reason: null, signature_name: null, employee: "Sebastian",
  },
  // est3 — approved for Carl (lead d4): paver sealing, 50% deposit, signed.
  {
    id: "est3", created_at: min(60), updated_at: min(30),
    lead_id: "d4", contact_id: null, address_id: null,
    number: "EST-000003", estimate_type: "standard", status: "approved",
    customer_name: "Carl Jimenez", customer_phone: "+15615550166", customer_email: null,
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
  // est3 line
  {
    id: "ei5", estimate_id: "est3", catalog_id: "cat5", position: 0,
    name: "Paver sealing", description: "Clean and seal pavers", kind: "service", quantity: 1,
    unit_price_cents: 60000, discount_cents: 0, taxable: false, line_total_cents: 60000,
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
    id: "job1", created_at: min(30), estimate_id: "est3", lead_id: "d4", contact_id: null,
    status: "unscheduled", customer_name: "Carl Jimenez",
    job_address: "77 Flagler Promenade, West Palm Beach",
    total_cents: 60000, deposit_cents: 30000, scheduled_at: null, assigned_to: null, notes: null,
    duration_minutes: 180, ends_at: null, arrival_window_minutes: 0, crew_id: null,
    confirmed_at: null, customer_phone: "+15615550166", job_name: "Paver sealing",
    gate_code: "4417", site_notes: "Sealer needs 24h dry — no foot traffic after.", canceled_reason: null,
  },
  // job2 — unscheduled (tray): a second waiting job so the tray shows two.
  {
    id: "job2", created_at: min(20), estimate_id: null, lead_id: null, contact_id: null,
    status: "unscheduled", customer_name: "Maria Delgado",
    job_address: "214 Sandpiper Way, West Palm Beach",
    total_cents: 35000, deposit_cents: 0, scheduled_at: null, assigned_to: null, notes: null,
    duration_minutes: 120, ends_at: null, arrival_window_minutes: 0, crew_id: null,
    confirmed_at: null, customer_phone: "+15615550142", job_name: "Driveway + pool deck",
    gate_code: null, site_notes: "Backyard spigot; front hose bib is broken.", canceled_reason: null,
  },
  // job3 — scheduled TODAY, Crew A (populates the run sheet + Today strip).
  {
    id: "job3", created_at: min(500), estimate_id: null, lead_id: "d6", contact_id: null,
    status: "scheduled", customer_name: "Priya Raman",
    job_address: "18 Coquina Ln, Palm Beach Gardens",
    total_cents: 42500, deposit_cents: 0, scheduled_at: JOB3_START, assigned_to: "Crew A", notes: null,
    duration_minutes: 120, ends_at: addMinutes(JOB3_START, 120), arrival_window_minutes: 30,
    crew_id: "crewA", confirmed_at: null, customer_phone: "+15615550133", job_name: "House wash",
    gate_code: "0916", site_notes: "Two dogs in the yard — text on the way.", canceled_reason: null,
  },
  // job4 — scheduled +2 days, Crew B.
  {
    id: "job4", created_at: min(600), estimate_id: null, lead_id: null, contact_id: null,
    status: "scheduled", customer_name: "Dana Osei",
    job_address: "410 Lakeview Ct, Royal Palm Beach",
    total_cents: 78000, deposit_cents: 0, scheduled_at: JOB4_START, assigned_to: "Crew B", notes: null,
    duration_minutes: 240, ends_at: addMinutes(JOB4_START, 240), arrival_window_minutes: 0,
    crew_id: "crewB", confirmed_at: null, customer_phone: "+15615550190", job_name: "Whole exterior",
    gate_code: null, site_notes: "Graduation party Saturday — must finish by 2pm.", canceled_reason: null,
  },
  // job5 — confirmed tomorrow, Crew A (customer already replied YES).
  {
    id: "job5", created_at: min(700), estimate_id: null, lead_id: "d3", contact_id: null,
    status: "confirmed", customer_name: "Janet Whitfield",
    job_address: "902 Banyan Isle Dr, Palm Beach Gardens",
    total_cents: 30000, deposit_cents: 7500, scheduled_at: JOB5_START, assigned_to: "Crew A", notes: null,
    duration_minutes: 150, ends_at: addMinutes(JOB5_START, 150), arrival_window_minutes: 0,
    crew_id: "crewA", confirmed_at: min(120), customer_phone: "+15615550118", job_name: "House wash + gutters",
    gate_code: "4482", site_notes: "Gate code 4482. Two friendly dogs.", canceled_reason: null,
  },
  // job6 — completed yesterday, INVOICED and awaiting card payment (backs inv1).
  {
    id: "job6", created_at: min(1600), estimate_id: null, lead_id: null, contact_id: null,
    status: "invoiced", customer_name: "Priya Raman",
    job_address: "18 Coquina Ln, Palm Beach Gardens",
    total_cents: 42500, deposit_cents: 0, scheduled_at: etAt(-1, "09:00"), assigned_to: "Crew A", notes: null,
    duration_minutes: 120, ends_at: addMinutes(etAt(-1, "09:00"), 120), arrival_window_minutes: 0,
    crew_id: "crewA", confirmed_at: min(1700), customer_phone: "+15615550133", job_name: "House wash",
    gate_code: null, site_notes: null, canceled_reason: null,
  },
  // job7 — completed + PAID in cash (backs inv2 + payment pay2).
  {
    id: "job7", created_at: min(3000), estimate_id: null, lead_id: null, contact_id: null,
    status: "paid", customer_name: "Frank Osei",
    job_address: "51 Marina Blvd, West Palm Beach",
    total_cents: 25000, deposit_cents: 0, scheduled_at: etAt(-2, "14:00"), assigned_to: "Crew B", notes: null,
    duration_minutes: 90, ends_at: addMinutes(etAt(-2, "14:00"), 90), arrival_window_minutes: 0,
    crew_id: "crewB", confirmed_at: min(3100), customer_phone: "+15615550155", job_name: "Driveway wash",
    gate_code: null, site_notes: null, canceled_reason: null,
  },
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
    job_id: "job6", estimate_id: null, lead_id: null, contact_id: null,
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
    job_id: "job7", estimate_id: null, lead_id: null, contact_id: null,
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
];

export const DEMO_PAYMENTS: Payment[] = [
  // inv2 was settled in cash — one manual ledger row.
  {
    id: "pay2", created_at: min(2880), invoice_id: "inv2", job_id: "job7",
    amount_cents: 25000, currency: "USD", method: "cash", source: "manual",
    status: "completed", square_payment_id: null, external_event_id: null,
    recorded_by: "owner", note: null,
  },
];
