// Seed data for the Woof Gang admin dashboard mockup.
// Numbers are plausible placeholders shaped like the real FranPOS / Twilio /
// Google feeds will be, so the UI can be designed before data is wired.

export type StoreId = "wp" | "wg" | "lv" | "wm";

export type Store = {
  id: StoreId;
  name: string;
  tier: "Established" | "Newer";
  rating: number;
  reviews: number;
  revenue: number; // monthly $
  groomingPct: number; // share of revenue from grooming
  bookings: number; // monthly appointments
  noShow: number; // 0..1
  rebook: number; // 0..1
  attach: number; // 0..1 retail attach on grooming visits
  avgTicket: number;
  leak: number; // est. recoverable $/mo
  trend: number[]; // revenue sparkline
};

export const stores: Store[] = [
  { id: "wp", name: "Winter Park", tier: "Established", rating: 4.6, reviews: 232, revenue: 58400, groomingPct: 0.64, bookings: 384, noShow: 0.06, rebook: 0.64, attach: 0.38, avgTicket: 96, leak: 1900, trend: [42, 45, 44, 48, 51, 53, 55, 58] },
  { id: "wg", name: "Winter Garden", tier: "Established", rating: 4.5, reviews: 199, revenue: 49200, groomingPct: 0.67, bookings: 332, noShow: 0.07, rebook: 0.58, attach: 0.31, avgTicket: 89, leak: 2300, trend: [40, 41, 43, 42, 45, 46, 48, 49] },
  { id: "lv", name: "Lakeside Village", tier: "Newer", rating: 4.4, reviews: 121, revenue: 39600, groomingPct: 0.71, bookings: 286, noShow: 0.11, rebook: 0.41, attach: 0.24, avgTicket: 82, leak: 3400, trend: [28, 30, 33, 34, 35, 37, 38, 40] },
  { id: "wm", name: "Windermere", tier: "Newer", rating: 4.4, reviews: 118, revenue: 36900, groomingPct: 0.73, bookings: 261, noShow: 0.13, rebook: 0.38, attach: 0.21, avgTicket: 79, leak: 3800, trend: [26, 27, 29, 31, 32, 33, 35, 37] },
];

export const totals = {
  revenue: stores.reduce((s, x) => s + x.revenue, 0),
  bookings: stores.reduce((s, x) => s + x.bookings, 0),
  leak: stores.reduce((s, x) => s + x.leak, 0),
  noShow: 0.09,
  rebook: 0.5,
  attach: 0.29,
  groomingShare: 0.68,
  revenueTrend: [148, 152, 159, 163, 168, 172, 178, 184],
  bookingsTrend: [1180, 1190, 1205, 1220, 1232, 1240, 1255, 1263],
};

export type LeakStatus = "live" | "instrument" | "fix";

export type Leak = {
  rank: number;
  name: string;
  scope: string;
  amount: number; // $/mo
  status: LeakStatus;
  source: string;
  trend: "up" | "down" | "flat";
  action: string;
};

export const leaks: Leak[] = [
  { rank: 1, name: "Lapsed customers never won back", scope: "All stores", amount: 4200, status: "live", source: "FranPOS history", trend: "up", action: "Start win-back" },
  { rank: 2, name: "Missed calls (open + after-hours)", scope: "Lakeside · Windermere", amount: 3400, status: "instrument", source: "Twilio call tracking", trend: "up", action: "Add tracking" },
  { rank: 3, name: "Low retail attach on grooms", scope: "Lakeside · Windermere", amount: 1900, status: "live", source: "FranPOS order items", trend: "flat", action: "Coach front desk" },
  { rank: 4, name: "No-shows & late cancels", scope: "Newer stores", amount: 1100, status: "live", source: "FranPOS bookings", trend: "down", action: "Turn on deposits" },
  { rank: 5, name: "Web booking abandonment", scope: "All stores", amount: 800, status: "instrument", source: "Web analytics", trend: "flat", action: "Add tracking" },
  { rank: 6, name: "Winter Park has no 'Book online' button", scope: "Winter Park", amount: 600, status: "fix", source: "Google Business Profile", trend: "flat", action: "Fix listing" },
];

export type FunnelStage = {
  stage: string;
  value: number;
  note: string;
  dropLeak?: boolean;
};

export const funnel: FunnelStage[] = [
  { stage: "Found you", value: 14200, note: "search impressions" },
  { stage: "Reached out", value: 2100, note: "calls + web", dropLeak: true },
  { stage: "Booked", value: 1360, note: "appointments", dropLeak: true },
  { stage: "Showed up", value: 1240, note: "9% no-show", dropLeak: true },
  { stage: "Bought", value: 1240, note: "service + retail" },
  { stage: "Rebooked", value: 620, note: "50% rebook", dropLeak: true },
];

export const calls = {
  perDay: 142,
  perDayDelta: 0.06,
  perDayTrend: [128, 131, 134, 130, 138, 142, 140, 142],
  missedPct: 0.28,
  openMissPct: 0.16,
  afterMissPct: 0.12,
  afterMissPerWeek: 19,
  afterMissValue: 3400,
  recovery: { texted: 14, replied: 9, booked: 6 },
  closeHour: 19,
  // calls per hour (8am..9pm), and missed portion
  hourly: [4, 9, 14, 16, 15, 12, 13, 15, 14, 11, 9, 7, 5, 4],
  missedHourly: [1, 2, 3, 4, 3, 2, 3, 5, 5, 4, 4, 5, 4, 3],
  startHour: 8,
};

export const web = {
  visits: 3120,
  formStart: 540,
  formComplete: 198,
  booked: 176,
  abandonRate: 0.63,
};

export const grooming = {
  attach: 0.29,
  avgService: 64,
  avgTicketWithRetail: 88,
  addOnAttach: 0.34,
  byMonth: [
    { m: "Jan", grooming: 96, retail: 38 },
    { m: "Feb", grooming: 101, retail: 41 },
    { m: "Mar", grooming: 108, retail: 47 },
    { m: "Apr", grooming: 112, retail: 52 },
    { m: "May", grooming: 119, retail: 58 },
    { m: "Jun", grooming: 125, retail: 59 },
  ],
};

export const retention = {
  newPct: 0.34,
  returningPct: 0.66,
  rebook: 0.5,
  rebookTrend: [0.44, 0.46, 0.47, 0.48, 0.49, 0.5],
  winbackCount: 142,
  winbackValue: 9800,
  oneAndDone: 88,
  cadenceDays: 47,
  cohort: [100, 82, 71, 63, 58, 54, 51, 49],
};

export type Groomer = {
  id: string;
  name: string;
  store: string;
  revPerHr: number;
  appts: number;
  rebook: number;
  attach: number;
  avgTicket: number;
  util: number;
  flag?: "star" | "coach";
};

export const groomers: Groomer[] = [
  { id: "maria", name: "Maria Reyes", store: "Winter Park", revPerHr: 118, appts: 96, rebook: 0.68, attach: 0.41, avgTicket: 102, util: 0.88, flag: "star" },
  { id: "james", name: "James Cole", store: "Winter Garden", revPerHr: 104, appts: 88, rebook: 0.61, attach: 0.34, avgTicket: 94, util: 0.82 },
  { id: "sofia", name: "Sofia Nunes", store: "Winter Park", revPerHr: 99, appts: 84, rebook: 0.59, attach: 0.36, avgTicket: 91, util: 0.79 },
  { id: "priya", name: "Priya Shah", store: "Winter Garden", revPerHr: 92, appts: 79, rebook: 0.54, attach: 0.3, avgTicket: 87, util: 0.76 },
  { id: "dana", name: "Dana Brooks", store: "Windermere", revPerHr: 88, appts: 81, rebook: 0.43, attach: 0.19, avgTicket: 80, util: 0.71, flag: "coach" },
  { id: "tyler", name: "Tyler Wood", store: "Lakeside Village", revPerHr: 84, appts: 74, rebook: 0.38, attach: 0.22, avgTicket: 78, util: 0.69, flag: "coach" },
];

// Expanded individual profile (Maria)
export const groomerProfile = {
  id: "maria",
  name: "Maria Reyes",
  store: "Winter Park",
  tenure: "3y 2mo",
  services: ["Full groom", "De-shed", "Nail grind", "Teeth"],
  revPerHr: 118,
  appts: 96,
  rebook: 0.68,
  attach: 0.41,
  avgTicket: 102,
  util: 0.88,
  requestRate: 0.52, // clients who request her by name
  clientBook: 214,
  loyalClients: 96, // 4+ visits
  redoRate: 0.02,
  cohort: [100, 88, 81, 76, 72, 70, 68, 67],
  winback: [
    { name: "Bella (Goldendoodle)", last: "63d ago", value: 92 },
    { name: "Max (Schnauzer)", last: "71d ago", value: 84 },
    { name: "Luna (Cavapoo)", last: "58d ago", value: 96 },
  ],
};

export const reputation = {
  byStore: [
    { store: "Winter Park", rating: 4.6, volume: 232, responseRate: 0.81, responseHrs: 9 },
    { store: "Winter Garden", rating: 4.5, volume: 199, responseRate: 0.74, responseHrs: 14 },
    { store: "Lakeside Village", rating: 4.4, volume: 121, responseRate: 0.52, responseHrs: 26 },
    { store: "Windermere", rating: 4.4, volume: 118, responseRate: 0.48, responseHrs: 31 },
  ],
  suspectedFakes: 4,
  unanswered: 7,
};

export const findability = [
  { store: "Winter Park", rank: 2, listing: 0.86, bookButton: false },
  { store: "Winter Garden", rank: 3, listing: 0.95, bookButton: true },
  { store: "Lakeside Village", rank: 5, listing: 0.78, bookButton: true },
  { store: "Windermere", rank: 6, listing: 0.74, bookButton: true },
];

export type ActionItem = {
  store: string;
  text: string;
  value?: string;
  action: string;
};

export const actions: ActionItem[] = [
  { store: "Windermere", text: "3 missed calls after close last night", value: "~$540", action: "Text back" },
  { store: "Lakeside", text: "New 2★ review, unanswered 14 hrs", action: "Reply" },
  { store: "Winter Park", text: "Still no 'Book online' button on Google", value: "~$600/mo", action: "Fix" },
  { store: "All stores", text: "142 lapsed clients ready for win-back", value: "~$9,800", action: "Start" },
  { store: "Lakeside", text: "Suspected fake 1★ — no matching customer", action: "Review" },
];
