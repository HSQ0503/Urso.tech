import type { Call, Lead, LeadEvent, Message } from "@/lib/canes/types";

// Demo fixtures — shown whenever CANES_SUPABASE_SECRET_KEY is absent so the
// dashboard is reviewable before the database and Twilio exist. Every phone
// number uses the reserved 555-01XX fictional range.

const now = Date.now();
const min = (n: number) => new Date(now - n * 60_000).toISOString();
const hrAhead = (n: number) => new Date(now + n * 3_600_000).toISOString();

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
];

export const DEMO_EVENTS: LeadEvent[] = [
  { id: "e1", created_at: min(6), lead_id: "d1", kind: "created", detail: "Parsed from lead vendor text (94% confidence)", data: {} },
  { id: "e2", created_at: min(6), lead_id: "d1", kind: "automation", detail: "Hold text sent", data: {} },
  { id: "e3", created_at: min(200), lead_id: "d3", kind: "created", detail: "Parsed from lead vendor text (97% confidence)", data: {} },
  { id: "e4", created_at: min(90), lead_id: "d3", kind: "automation", detail: "Confirmation text sent (T-12h)", data: {} },
  { id: "e5", created_at: min(55), lead_id: "d4", kind: "status", detail: "Customer replied YES — appointment confirmed", data: {} },
  { id: "e6", created_at: min(2800), lead_id: "d6", kind: "status", detail: "Closed won — $425", data: {} },
];
