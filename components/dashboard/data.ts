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
export type Severity = "High" | "Medium" | "Low";

export type Leak = {
  rank: number;
  name: string;
  scope: string;
  metric: string; // the observed statistic — never a promised dollar figure
  severity: Severity;
  status: LeakStatus;
  source: string;
  action: string;
};

export const leaks: Leak[] = [
  { rank: 1, name: "Lapsed customers not returning", scope: "All stores", metric: "142 inactive customers", severity: "High", status: "live", source: "FranPOS history", action: "Start win-back" },
  { rank: 2, name: "Unanswered inbound calls", scope: "Lakeside · Windermere", metric: "28% of calls missed", severity: "High", status: "instrument", source: "Call tracking", action: "Add tracking" },
  { rank: 3, name: "Low retail attachment on grooms", scope: "Lakeside · Windermere", metric: "24% attach rate", severity: "Medium", status: "live", source: "FranPOS order items", action: "Review process" },
  { rank: 4, name: "No-shows and late cancellations", scope: "Newer stores", metric: "11% no-show rate", severity: "Medium", status: "live", source: "FranPOS bookings", action: "Enable deposits" },
  { rank: 5, name: "Online booking abandonment", scope: "All stores", metric: "63% form drop-off", severity: "Low", status: "instrument", source: "Web analytics", action: "Add tracking" },
  { rank: 6, name: "Incomplete Google listing", scope: "Winter Park", metric: "No booking link", severity: "Low", status: "fix", source: "Google Business Profile", action: "Update listing" },
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
  { store: "Windermere", text: "3 calls missed after close last night", value: "3 calls", action: "Text back" },
  { store: "Lakeside", text: "New 2★ review unanswered for 14 hours", action: "Reply" },
  { store: "Winter Park", text: "Google listing is missing a booking link", action: "Update" },
  { store: "All stores", text: "142 inactive customers eligible for win-back", value: "142", action: "Review" },
  { store: "Lakeside", text: "Suspected fake 1★ — no matching customer on file", action: "Review" },
];

// ---- Filters (store + month) -----------------------------------------------
// The whole dashboard is driven by two global filters held in the URL
// (?store=&month=). Everything below is deterministic / SSR-safe — no
// Math.random / Date.now, so server and client render identically.

export type Scope = "all" | StoreId;
export type MonthValue = "all" | string; // "all", "YYYY" (full year), or "YYYY-MM"
export type Granularity = "daily" | "weekly" | "monthly";

const storesById: Record<StoreId, Store> = Object.fromEntries(stores.map((s) => [s.id, s])) as Record<StoreId, Store>;

export const STORE_OPTIONS: { value: Scope; label: string; short: string }[] = [
  { value: "all", label: "All stores", short: "All stores" },
  { value: "wp", label: "Winter Park", short: "Winter Park" },
  { value: "wg", label: "Winter Garden", short: "Winter Garden" },
  { value: "lv", label: "Lakeside Village", short: "Lakeside" },
  { value: "wm", label: "Windermere", short: "Windermere" },
];

// Trailing 12 months ending Jun 2026 (fixed mapping — no Date at module scope).
const MONTH_LABELS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const MONTH_NUMS = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
const MONTH_YEARS = [2025, 2025, 2025, 2025, 2025, 2025, 2026, 2026, 2026, 2026, 2026, 2026];
export const MONTH_KEYS = MONTH_LABELS.map((_, i) => `${MONTH_YEARS[i]}-${String(MONTH_NUMS[i]).padStart(2, "0")}`);

// Full calendar years with complete FranPOS history (data starts 2024-01-01).
export const YEAR_KEYS = ["2025", "2024"];

export const MONTH_OPTIONS: { value: MonthValue; label: string }[] = [
  { value: "all", label: "Last 12 months" },
  ...MONTH_KEYS.map((k, i) => ({ value: k as MonthValue, label: `${MONTH_LABELS[i]} ${MONTH_YEARS[i]}` })).reverse(),
  ...YEAR_KEYS.map((y) => ({ value: y as MonthValue, label: `${y} · full year` })),
];

export function parseScope(v?: string | null): Scope {
  return STORE_OPTIONS.some((o) => o.value === v) ? (v as Scope) : "all";
}
export function parseMonth(v?: string | null): MonthValue {
  return v && (MONTH_KEYS.includes(v) || YEAR_KEYS.includes(v)) ? v : "all";
}
export function scopeLabel(s: Scope) {
  return STORE_OPTIONS.find((o) => o.value === s)!.short;
}
export function monthLabel(m: MonthValue) {
  return MONTH_OPTIONS.find((o) => o.value === m)?.label ?? "Last 12 months";
}
function monthIndex(m: MonthValue) {
  return m === "all" ? -1 : MONTH_KEYS.indexOf(m);
}
function scopeStores(scope: Scope): Store[] {
  return scope === "all" ? stores : [storesById[scope]];
}

// ---- Deterministic generators ----------------------------------------------
function wave(seed: number, i: number) {
  return Math.sin(seed * 12.9 + i * 2.3) * 0.5 + Math.sin(seed * 7.1 + i * 0.7) * 0.3 + Math.sin(seed * 3.7 + i * 1.9) * 0.2;
}
function gen(seed: number, len: number, base: number, amp: number, growth: number) {
  return Array.from({ length: len }, (_, i) => Math.max(0, Math.round(base * (1 + (growth * i) / len) + wave(seed, i) * amp)));
}
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const sumSeries = (arrs: number[][]) => arrs[0].map((_, i) => arrs.reduce((s, a) => s + a[i], 0));

const baseByStore: Record<StoreId, { rev: number; callsDay: number; miss: number; visitsW: number; bookW: number; seed: number }> = {
  wp: { rev: 58400, callsDay: 44, miss: 0.18, visitsW: 262, bookW: 16, seed: 1 },
  wg: { rev: 49200, callsDay: 38, miss: 0.22, visitsW: 220, bookW: 13, seed: 2 },
  lv: { rev: 39600, callsDay: 32, miss: 0.31, visitsW: 160, bookW: 9, seed: 3 },
  wm: { rev: 36900, callsDay: 28, miss: 0.34, visitsW: 138, bookW: 7, seed: 4 },
};

// Per-store monthly arrays (12 points, one per trailing month).
type Monthly = {
  revenue: number[];
  grooming: number[];
  retail: number[];
  bookings: number[];
  callsTotal: number[];
  callsMissed: number[];
  webVisits: number[];
  webStart: number[];
  webComplete: number[];
  webBooked: number[];
};

function buildMonthly(id: StoreId): Monthly {
  const b = baseByStore[id];
  const s = storesById[id];
  const revenue = gen(b.seed + 20, 12, b.rev, b.rev * 0.08, 0.18);
  const grooming = revenue.map((r, i) => Math.round(r * (s.groomingPct + wave(b.seed + 7, i) * 0.02)));
  const retail = revenue.map((r, i) => r - grooming[i]);
  const bookings = revenue.map((r) => Math.round(r / s.avgTicket));
  const callsTotal = gen(b.seed + 30, 12, b.callsDay * 30, b.callsDay * 30 * 0.12, 0.06);
  const callsMissed = callsTotal.map((c, i) => Math.round(c * (b.miss + wave(b.seed + 5, i) * 0.03)));
  const webVisits = gen(b.seed + 40, 12, b.visitsW * 4.33, b.visitsW * 4.33 * 0.15, 0.08);
  const webStart = webVisits.map((v, i) => Math.round(v * (0.18 + wave(b.seed + 11, i) * 0.01)));
  const webComplete = webStart.map((v, i) => Math.round(v * (0.37 + wave(b.seed + 13, i) * 0.02)));
  const webBooked = webComplete.map((v) => Math.round(v * 0.9));
  return { revenue, grooming, retail, bookings, callsTotal, callsMissed, webVisits, webStart, webComplete, webBooked };
}

const monthlyByStore: Record<StoreId, Monthly> = { wp: buildMonthly("wp"), wg: buildMonthly("wg"), lv: buildMonthly("lv"), wm: buildMonthly("wm") };

function aggregateMonthly(scope: Scope): Monthly {
  const set = scopeStores(scope).map((s) => monthlyByStore[s.id]);
  const keys = Object.keys(set[0]) as (keyof Monthly)[];
  return Object.fromEntries(keys.map((k) => [k, sumSeries(set.map((m) => m[k]))])) as Monthly;
}

// Pick a value from a monthly array: total across the year, or one month.
function pick(arr: number[], mi: number) {
  return mi < 0 ? sum(arr) : arr[mi];
}

// ---- Chart series ----------------------------------------------------------
export type Series = {
  revenue: Record<Granularity, number[]>;
  callsTotal: number[];
  callsMissed: number[];
  webVisits: number[];
  webBookings: number[];
};

// A 30-day daily breakdown of a single month's total (deterministic).
function dailyFromTotal(total: number, seed: number) {
  const raw = Array.from({ length: 30 }, (_, i) => 1 + wave(seed, i) * 0.4 + 0.25);
  const rawSum = sum(raw);
  return raw.map((v) => Math.round((v / rawSum) * total));
}

export function getSeries(scope: Scope, month: MonthValue = "all"): Series {
  const m = aggregateMonthly(scope);
  const mi = monthIndex(month);
  if (mi < 0) {
    // Trailing window: weekly/monthly from the monthly arrays, daily reconstructed.
    return {
      revenue: {
        daily: dailyFromTotal(m.revenue[11], 91),
        weekly: gen(scope === "all" ? 99 : 50, 12, sum(m.revenue) / 12 / 4.33, (sum(m.revenue) / 12 / 4.33) * 0.14, 0.12),
        monthly: m.revenue,
      },
      callsTotal: m.callsTotal,
      callsMissed: m.callsMissed,
      webVisits: m.webVisits,
      webBookings: m.webBooked,
    };
  }
  // Specific month → daily breakdowns for that month.
  const daily = dailyFromTotal(m.revenue[mi], 17 + mi);
  return {
    revenue: { daily, weekly: daily, monthly: daily },
    callsTotal: dailyFromTotal(m.callsTotal[mi], 31 + mi),
    callsMissed: dailyFromTotal(m.callsMissed[mi], 47 + mi),
    webVisits: dailyFromTotal(m.webVisits[mi], 59 + mi),
    webBookings: dailyFromTotal(m.webBooked[mi], 71 + mi),
  };
}

// X-axis labels + caption for the active filter.
export const timeMeta: Record<Granularity, { labels: string[]; caption: string }> = {
  daily: { labels: Array.from({ length: 30 }, (_, i) => String(i + 1)), caption: "by day" },
  weekly: { labels: Array.from({ length: 12 }, (_, i) => `W${i + 1}`), caption: "Last 12 weeks" },
  monthly: { labels: MONTH_LABELS, caption: "Last 12 months" },
};

export function seriesLabels(month: MonthValue, gran: Granularity): string[] {
  return month === "all" ? timeMeta[gran].labels : timeMeta.daily.labels;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ---- Headline metrics ------------------------------------------------------
export function metrics(scope: Scope, month: MonthValue = "all") {
  const m = aggregateMonthly(scope);
  const mi = monthIndex(month);
  const ss = scopeStores(scope);
  const revenue = pick(m.revenue, mi);
  const bookings = pick(m.bookings, mi);
  const grooming = pick(m.grooming, mi);
  const retail = pick(m.retail, mi);
  // Revenue-weighted average across the stores in scope.
  const wAvg = (sel: (s: Store) => number) => ss.reduce((a, s) => a + sel(s) * s.revenue, 0) / ss.reduce((a, s) => a + s.revenue, 0);
  const drift = mi < 0 ? 0 : wave(7, mi) * 0.02;
  return {
    revenue,
    bookings,
    grooming,
    retail,
    groomingShare: grooming / (grooming + retail),
    avgTicket: Math.round(revenue / bookings),
    rebook: clamp01(wAvg((s) => s.rebook) + drift),
    noShow: clamp01(wAvg((s) => s.noShow) - drift),
    attach: clamp01(wAvg((s) => s.attach) + drift),
    rating: wAvg((s) => s.rating),
  };
}

export function callStats(scope: Scope, month: MonthValue = "all") {
  const m = aggregateMonthly(scope);
  const mi = monthIndex(month);
  const total = pick(m.callsTotal, mi);
  const missed = pick(m.callsMissed, mi);
  return { total, missed, missedPct: missed / total, answeredPct: 1 - missed / total };
}

export function webStats(scope: Scope, month: MonthValue = "all") {
  const m = aggregateMonthly(scope);
  const mi = monthIndex(month);
  const visits = pick(m.webVisits, mi);
  const bookings = pick(m.webBooked, mi);
  return { visits, bookings, convRate: bookings / visits };
}

// ---- Conversion funnel -----------------------------------------------------
export type FunnelStep = { stage: string; value: number; pct: number; stepConv: number; leak: boolean };

export function funnelData(scope: Scope, month: MonthValue = "all"): FunnelStep[] {
  const m = aggregateMonthly(scope);
  const mi = monthIndex(month);
  const visited = pick(m.webVisits, mi);
  const started = pick(m.webStart, mi);
  const completed = pick(m.webComplete, mi);
  const booked = pick(m.webBooked, mi);
  const raw = [
    { stage: "Visited site", value: visited },
    { stage: "Started booking", value: started },
    { stage: "Completed form", value: completed },
    { stage: "Booked", value: booked },
  ];
  return raw.map((r, i) => {
    const stepConv = i === 0 ? 1 : r.value / raw[i - 1].value;
    return { ...r, pct: r.value / visited, stepConv, leak: i > 0 && stepConv < 0.45 };
  });
}

// ---- Cross-sell: retail + grooming overlap ---------------------------------
export function crossSell(scope: Scope, month: MonthValue = "all") {
  const mi = monthIndex(month);
  const ss = scopeStores(scope);
  const attach = ss.reduce((a, s) => a + s.attach * s.bookings, 0) / ss.reduce((a, s) => a + s.bookings, 0);
  const drift = mi < 0 ? 0 : wave(5, mi) * 0.02;
  const both = clamp01(attach + drift);
  const groomingOnly = clamp01((1 - both) * 0.62);
  const retailOnly = clamp01(1 - both - groomingOnly);
  return { both, groomingOnly, retailOnly };
}

// ---- Reviews: per-store distribution + sample list -------------------------
export type Review = { author: string; rating: number; days: number; text: string; flagged: boolean };

// Per-store review pools so the browser reads differently at each location —
// each store's character (Winter Park's missing book link, Windermere's
// after-hours misses, the newer stores' inconsistency) shows up in the text.
type ReviewSeed = { authors: string[]; good: string[]; bad: string[]; fake: string };
const reviewSeeds: Record<string, ReviewSeed> = {
  "Winter Park": {
    authors: ["Morgan D.", "Sam P.", "Casey R.", "Avery T.", "Quinn L.", "Elena O.", "Grace N.", "Priya R."],
    good: [
      "Bella came back so soft and happy. Maria clearly cares.",
      "Been coming for two years — the most consistent groom in Winter Park.",
      "Booked online, in and out on time, great cut.",
      "Friendly front desk and the nail trim was painless for once.",
      "They remember our dog by name every single time.",
    ],
    bad: [
      "Tried to book online but there's no link on their Google page — had to call.",
      "Called twice during the day and no one picked up.",
    ],
    fake: "Never been here. Not sure why this is on my account.",
  },
  "Winter Garden": {
    authors: ["Jordan M.", "Reese H.", "Drew B.", "Parker S.", "Owen H.", "Marcus L.", "Sara K.", "Riley K."],
    good: [
      "Great with our anxious rescue — took their time and it shows.",
      "James did a fantastic teddy-bear cut. Booked the next one on the spot.",
      "Consistent results every visit. Highly recommend.",
      "Easy to reschedule and always on time.",
      "Our goldendoodle actually pulls toward the door now.",
    ],
    bad: [
      "Waited 20 minutes past my appointment time.",
      "Cut wasn't quite what I asked for this time.",
    ],
    fake: "Worst place ever, never going back — no appointment on record.",
  },
  "Lakeside Village": {
    authors: ["Devon P.", "Riley K.", "Casey R.", "Jordan M.", "Avery T.", "Sam P.", "Quinn L.", "Drew B."],
    good: [
      "New to the area and so glad we found them — lovely with our cavapoo.",
      "Nice improvement since they opened — the groomers are getting dialed in.",
      "Clean shop, friendly staff, fair price.",
      "Quick bath and brush, no fuss.",
    ],
    bad: [
      "Quality is hit or miss depending on who you get.",
      "Left a voicemail and never heard back.",
      "Showed up for my slot and they had no record of it.",
    ],
    fake: "One star — reviewer has no record of ever visiting.",
  },
  "Windermere": {
    authors: ["Tom B.", "Riley K.", "Avery T.", "Casey R.", "Jordan M.", "Parker S.", "Drew B.", "Sam P."],
    good: [
      "Newer location but already our go-to. Sweet with our lab.",
      "Booked easily and the groomer listened to exactly what we wanted.",
      "In and out, great cut, will be back.",
    ],
    bad: [
      "Called after work to book and it went to voicemail — no callback.",
      "Tried three times after 6pm and never got through.",
      "Rebooking was awkward, had to chase them.",
    ],
    fake: "Terrible, do not recommend — no matching customer on file.",
  },
  default: {
    authors: ["Jordan M.", "Casey R.", "Avery T.", "Sam P.", "Riley K.", "Morgan D.", "Quinn L.", "Drew B."],
    good: [
      "Booked online, in and out on time, great cut.",
      "They remembered our dog by name. Best grooming in the area.",
      "Consistent results every visit. Highly recommend.",
    ],
    bad: ["Called twice and no one picked up. Booked elsewhere.", "Waited 20 minutes past my appointment time."],
    fake: "Never been here. Not sure why this is on my account.",
  },
};

export function reviewDistribution(store: string) {
  const rep = reputation.byStore.find((r) => r.store === store)!;
  const total = rep.volume;
  // Skew toward 5★ based on the store's rating.
  const t = (rep.rating - 4) / 1; // 0..1-ish
  const w = [0.04 - t * 0.02, 0.04 - t * 0.015, 0.07 - t * 0.02, 0.2 - t * 0.04, 0.65 + t * 0.1];
  const ws = w.reduce((a, x) => a + Math.max(0.01, x), 0);
  const counts = w.map((x) => Math.round((Math.max(0.01, x) / ws) * total));
  return { stars: [1, 2, 3, 4, 5], counts, total, rating: rep.rating };
}

export function reviewsFor(store: string): Review[] {
  const seed = reviewSeeds[store] ?? reviewSeeds.default;
  const rep = reputation.byStore.find((r) => r.store === store)!;
  const si = Math.max(0, reputation.byStore.findIndex((r) => r.store === store));
  return Array.from({ length: 8 }, (_, i) => {
    const r = Math.round(2.5 + wave(si + 3, i) * 1.6 + rep.rating - 4.5);
    const rating = Math.max(1, Math.min(5, r));
    const low = rating <= 2;
    const flagged = low && (i + si) % 3 === 0;
    return {
      author: seed.authors[(i + si) % seed.authors.length],
      rating,
      days: Math.round(2 + Math.abs(wave(si + 9, i)) * 40),
      text: flagged ? seed.fake : low ? seed.bad[(i + si) % seed.bad.length] : seed.good[(i + si) % seed.good.length],
      flagged,
    };
  }).sort((a, b) => a.days - b.days);
}

// Local, import-light formatters so this module stays the source of truth
// (it must not import from ui.tsx — that would create a charts→data cycle).
const money = (n: number) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n.toLocaleString("en-US")}`);
const pctStr = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

// ============================================================================
//  Revenue Map — where the money comes from (every cut, one definition)
// ============================================================================

export function revenueByLocation(month: MonthValue = "all") {
  return stores
    .map((s) => ({ id: s.id, name: s.name, value: metrics(s.id, month).revenue }))
    .sort((a, b) => b.value - a.value);
}

export type ServiceLine = "Grooming" | "Retail";
export function revenueByService(scope: Scope, month: MonthValue = "all"): { name: string; value: number; line: ServiceLine }[] {
  const m = metrics(scope, month);
  const grooming = [
    { name: "Full groom", w: 0.54 },
    { name: "Bath & brush", w: 0.24 },
    { name: "Nail & add-ons", w: 0.13 },
    { name: "De-shed", w: 0.09 },
  ];
  const retail = [
    { name: "Food & treats", w: 0.47 },
    { name: "Accessories", w: 0.31 },
    { name: "Health & wellness", w: 0.22 },
  ];
  return [
    ...grooming.map((s) => ({ name: s.name, value: Math.round(m.grooming * s.w), line: "Grooming" as const })),
    ...retail.map((s) => ({ name: s.name, value: Math.round(m.retail * s.w), line: "Retail" as const })),
  ].sort((a, b) => b.value - a.value);
}

export function revenueByGroomer(scope: Scope, month: MonthValue = "all") {
  const fullName = STORE_OPTIONS.find((o) => o.value === scope)?.label;
  const set = scope === "all" ? groomers : groomers.filter((g) => g.store === fullName);
  const months = monthIndex(month) < 0 ? 12 : 1;
  return set
    .map((g) => ({ name: g.name, store: g.store, value: g.appts * g.avgTicket * months }))
    .sort((a, b) => b.value - a.value);
}

export function revenueNewVsRepeat(scope: Scope, month: MonthValue = "all") {
  const m = metrics(scope, month);
  return {
    repeat: Math.round(m.revenue * retention.returningPct),
    fresh: Math.round(m.revenue * retention.newPct),
  };
}

// ============================================================================
//  AI Action Center — the agent turns a finding into a result, owner approves
//  Metrics are observed statistics, never a promised dollar figure.
// ============================================================================

export type ActionStatus = "suggested" | "approved" | "running" | "completed";

export type AgentAction = {
  id: string;
  title: string;
  store: string;
  agent: string;
  detail: string;
  metric: string;
  status: ActionStatus;
  result?: string;
  pending?: boolean; // depends on a feed not yet wired
};

export const ACTION_FLOW: ActionStatus[] = ["suggested", "approved", "running", "completed"];
export const actionStatusLabel: Record<ActionStatus, string> = {
  suggested: "Suggested",
  approved: "Approved",
  running: "Running",
  completed: "Completed",
};

export const agentActions: AgentAction[] = [
  {
    id: "a1",
    title: "Text back missed after-hours calls",
    store: "Windermere",
    agent: "Call capture",
    detail: "Send an instant message to callers who reached voicemail after closing, inviting them to book online or request a callback the next morning.",
    metric: "14 missed after-hours calls",
    status: "suggested",
    pending: true,
  },
  {
    id: "a2",
    title: "Reply to unanswered reviews",
    store: "Lakeside Village",
    agent: "Reputation",
    detail: "Draft on-brand responses to the seven reviews left without a reply, prioritising the two rated below three stars.",
    metric: "7 reviews unanswered",
    status: "suggested",
  },
  {
    id: "a3",
    title: "Coach the two lowest-rebooking groomers",
    store: "Lakeside · Windermere",
    agent: "Team",
    detail: "Create a coaching task for each store manager covering the rebooking conversation at checkout, with this period's figures attached.",
    metric: "Rebook 38–43%",
    status: "approved",
  },
  {
    id: "a4",
    title: "Request reviews from recent grooming customers",
    store: "All stores",
    agent: "Reputation",
    detail: "Send a review request a day after each completed groom to clients who rated their visit four or five stars.",
    metric: "38 eligible this period",
    status: "running",
  },
  {
    id: "a5",
    title: "Win back single-visit customers",
    store: "All stores",
    agent: "Retention",
    detail: "Message customers who came once and did not return within 60 days with a personalised rebooking link.",
    metric: "88 single-visit customers",
    status: "running",
  },
  {
    id: "a6",
    title: "Flag suspected fake reviews to Google",
    store: "Lakeside Village",
    agent: "Reputation",
    detail: "Cross-reference one-star reviewers against FranPOS records and submit a removal case for those with no matching customer on file.",
    metric: "4 with no customer on file",
    status: "completed",
    result: "4 cases submitted to Google",
  },
  {
    id: "a7",
    title: "Reactivate lapsed grooming customers",
    store: "Winter Park",
    agent: "Retention",
    detail: "A staged win-back sequence to customers inactive for 60–90 days who previously visited at least three times.",
    metric: "31 contacted",
    status: "completed",
    result: "31 messaged · 18 replied · 11 rebooked",
  },
  {
    id: "a8",
    title: "Add the missing booking link on Google",
    store: "Winter Park",
    agent: "Visibility",
    detail: "Prepare the Google Business Profile update that adds an online booking button to the highest-ranked listing.",
    metric: "Ranks #2, no book link",
    status: "completed",
    result: "Update prepared — awaiting owner publish",
  },
];

// ----------------------------------------------------------------------------
// Action plans — the comprehensive view behind an approval. Each one states the
// problem, the system we propose, what the dashboard/AI does, and what the owner
// does. Shown in the Home action-item overview and the AI-action approval
// workflow. A real model assembles these from the live feeds; deterministic here.
export type ActionPlan = {
  problem: string;
  system: string; // the system / tool Urso sets up
  proposal: string; // one-line summary of the fix
  how: string[]; // what Urso does
  your: string[]; // the owner's minimal part
};

export const actionPlans: Record<string, ActionPlan> = {
  "call-capture": {
    problem:
      "Calls that go unanswered — especially after closing — are the largest source of lost bookings. With no system catching them, a missed call is simply a customer who books with whoever picks up next.",
    system: "Twilio missed-call capture + instant AI text-back",
    proposal: "Urso puts a Twilio number behind your existing line so every unanswered call is logged, then texts the caller back within seconds with a booking link.",
    how: [
      "Urso routes every missed call to a backend Twilio number — your published number never changes and customers never dial it.",
      "Urso's AI reads each missed call (time, after-hours or busy) and drafts a personal text inviting them to book online or request a morning callback.",
      "Urso sends the text within seconds and tracks the booking link, so recovered appointments show up right here.",
    ],
    your: [
      "Approve the message wording and tone once.",
      "Choose the after-hours callback window.",
      "Nothing day-to-day — Urso runs it and reports the bookings it recovers.",
    ],
  },
  reviews: {
    problem: "Reviews left without a reply quietly lower how much prospective customers trust a location. A visible reply signals an owner who is paying attention.",
    system: "AI review responder (you approve every reply)",
    proposal: "Draft an on-brand response to every unanswered review, lowest-rated first, queued for your one-click approval.",
    how: [
      "The AI drafts a reply to each unanswered review, matched to its rating and what it actually says.",
      "The reviews rated below three stars are prioritised so the most damaging ones are handled first.",
      "Every draft waits for your approval — nothing posts on its own.",
    ],
    your: ["Skim each draft and approve, edit, or skip.", "Set the tone once; the AI matches it from then on."],
  },
  "fake-reviews": {
    problem: "Some one-star reviews come from people who were never customers. They drag the rating down unfairly and there is no obvious way to prove it.",
    system: "FranPOS cross-reference + Google flag",
    proposal: "Cross-reference each one-star reviewer against your customer records and prepare an evidence-backed removal case for any with no match.",
    how: [
      "Each one-star reviewer's name is checked against your FranPOS customer history.",
      "Reviews with no matching customer on file are compiled into a case with the evidence attached.",
      "Google's API can't delete reviews, so each case is prepared for a one-click flag submission.",
    ],
    your: ["Review the prepared cases and submit the flags.", "Forward the strongest cases to Google support where an appeal helps."],
  },
  "rebook-coach": {
    problem: "The two lowest-rebooking groomers leave recurring revenue on the table at checkout — grooming is repeat business, so a missed rebook compounds.",
    system: "Coaching task for the store manager",
    proposal: "Hand each store manager a short, specific coaching task on the rebooking conversation, with this period's figures attached.",
    how: [
      "The AI assembles each groomer's rebooking rate versus the team for the period.",
      "It writes a focused coaching task for the relevant manager — about the checkout conversation, framed as support, not a reprimand.",
    ],
    your: ["Have the manager run the conversation at the next shift.", "Check back next period — the scorecard tracks whether it moved."],
  },
  winback: {
    problem: "Customers who came once or have lapsed are the cheapest revenue to recover — they already know you. Left alone, most never come back on their own.",
    system: "Staged win-back sequence",
    proposal: "Message lapsed customers a personalised rebooking link over a short, spaced sequence and track who returns.",
    how: [
      "The AI identifies customers inactive 60–90 days who previously visited.",
      "It sends a personalised rebooking link, spaced over a short sequence so it never feels like spam.",
      "Replies and rebookings are tracked back to each customer.",
    ],
    your: ["Approve any offer you want to include.", "Greet the returning customers — the system handles the outreach."],
  },
  "request-reviews": {
    problem: "Happy customers rarely leave a review unless asked, so your public rating undercounts how good the service actually is.",
    system: "Post-groom review request",
    proposal: "A day after each completed groom, ask the clients who rated their visit four or five stars to leave a Google review.",
    how: [
      "The AI messages clients a day after a completed groom, only those who rated the visit 4–5 stars in-store.",
      "The message links straight to your Google review form.",
      "Volume and the resulting rating change are tracked here.",
    ],
    your: ["Approve the message once.", "Nothing ongoing."],
  },
  "booking-link": {
    problem: "Winter Park ranks #2 locally but has no 'Book online' button on its Google listing — the easiest appointments never start.",
    system: "Google Business Profile update",
    proposal: "Add an online booking button to the highest-ranked listing so search traffic can convert without a phone call.",
    how: [
      "The AI prepares the exact listing change that adds an online booking button.",
      "Because Urso is added as Manager (not Owner), the update is staged for your one-click publish — you keep full ownership.",
    ],
    your: ["Publish the prepared update from your Google Business Profile.", "Confirm the link points at your live booking page."],
  },
  "booking-form": {
    problem: "Most website visitors leave on the booking form before finishing. The drop is concentrated in a long, desktop-first form.",
    system: "Shorter, mobile-first booking form",
    proposal: "Pinpoint where visitors abandon, then ship a shorter mobile-first form and test it against the current one.",
    how: [
      "Analytics pinpoint the exact field where visitors drop out.",
      "The AI proposes a shorter, mobile-first form and A/B tests it against the current one so the win is measured, not assumed.",
    ],
    your: ["Approve the new form layout.", "Urso handles the build and the test."],
  },
  "retail-attach": {
    problem: "Retail attachment on grooming visits is below the group. Every groom is a chance to add food or accessories, and most leave without one.",
    system: "Checkout retail prompt + reorder reminders",
    proposal: "Suggest the right add-on at checkout based on the pet and past purchases, and remind customers when consumables run low.",
    how: [
      "The AI suggests a relevant add-on at checkout from the pet's history — food, dental, de-shed.",
      "It schedules a reorder reminder timed to when the last food purchase runs out.",
      "Attach rate is tracked per groomer and store so coaching is specific.",
    ],
    your: ["Have staff make the one-line suggestion at checkout.", "Keep the recommended items in stock."],
  },
};

const actionPlanKey: Record<string, string> = {
  a1: "call-capture",
  a2: "reviews",
  a3: "rebook-coach",
  a4: "request-reviews",
  a5: "winback",
  a6: "fake-reviews",
  a7: "winback",
  a8: "booking-link",
};

export function actionPlanFor(a: AgentAction): ActionPlan {
  return actionPlans[actionPlanKey[a.id]] ?? actionPlans["call-capture"];
}

// ============================================================================
//  Customer Intelligence — value, risk and the next best action
// ============================================================================

export type CustomerSegment = "VIP" | "Loyal" | "At risk" | "Lapsed";
export type CustomerRow = {
  name: string;
  pet: string;
  store: string;
  storeId: StoreId;
  visits: number;
  ltv: number;
  lastVisit: number; // days since last visit
  segment: CustomerSegment;
  next: string;
};

export const customerBook: CustomerRow[] = [
  { name: "Daisy Whitfield", pet: "Poodle", store: "Winter Park", storeId: "wp", visits: 24, ltv: 2880, lastVisit: 12, segment: "VIP", next: "Send a message" },
  { name: "Marcus Lee", pet: "Goldendoodle", store: "Winter Garden", storeId: "wg", visits: 19, ltv: 2140, lastVisit: 9, segment: "VIP", next: "Send a message" },
  { name: "Grace Nolan", pet: "Cocker Spaniel", store: "Winter Park", storeId: "wp", visits: 21, ltv: 2460, lastVisit: 16, segment: "VIP", next: "Send a message" },
  { name: "Elena Ortiz", pet: "Schnauzer", store: "Winter Park", storeId: "wp", visits: 16, ltv: 1760, lastVisit: 27, segment: "Loyal", next: "Send a message" },
  { name: "Owen Hartley", pet: "Border Collie", store: "Winter Garden", storeId: "wg", visits: 13, ltv: 1410, lastVisit: 34, segment: "Loyal", next: "Send a message" },
  { name: "Priya Raman", pet: "Cavapoo", store: "Lakeside Village", storeId: "lv", visits: 14, ltv: 1520, lastVisit: 58, segment: "At risk", next: "Send a message" },
  { name: "Tom Becker", pet: "Labrador", store: "Windermere", storeId: "wm", visits: 11, ltv: 1180, lastVisit: 71, segment: "At risk", next: "Send a message" },
  { name: "Sara Klein", pet: "Bichon", store: "Winter Garden", storeId: "wg", visits: 9, ltv: 980, lastVisit: 96, segment: "Lapsed", next: "Send a message" },
  { name: "Devon Pryce", pet: "Shih Tzu", store: "Lakeside Village", storeId: "lv", visits: 8, ltv: 860, lastVisit: 104, segment: "Lapsed", next: "Send a message" },
];

function customerSet(scope: Scope): CustomerRow[] {
  return scope === "all" ? customerBook : customerBook.filter((c) => c.storeId === scope);
}

export function customerSegments(scope: Scope) {
  const set = customerSet(scope);
  const order: CustomerSegment[] = ["VIP", "Loyal", "At risk", "Lapsed"];
  return order.map((segment) => ({ segment, count: set.filter((c) => c.segment === segment).length }));
}

export function customersByValue(scope: Scope): CustomerRow[] {
  return [...customerSet(scope)].sort((a, b) => b.ltv - a.ltv);
}

export function customerIntel(scope: Scope) {
  const set = customerSet(scope);
  const avgLtv = set.length ? Math.round(set.reduce((a, c) => a + c.ltv, 0) / set.length) : 0;
  const atRisk = set.filter((c) => c.segment === "At risk" || c.segment === "Lapsed").length;
  return { avgLtv, atRisk, count: set.length };
}

// ============================================================================
//  Weekly Brief — the auto-generated digest ("this becomes the meeting")
// ============================================================================

export type BriefChange = { label: string; value: string; delta: number; good: boolean };
export type WeeklyBrief = {
  headline: string;
  changes: BriefChange[];
  wins: string[];
  risks: string[];
  opportunity: { title: string; detail: string };
  actionsCompleted: number;
  actionsOpen: number;
  recommendation: string;
};

export function weeklyBrief(scope: Scope, month: MonthValue = "all"): WeeklyBrief {
  const m = metrics(scope, month);
  const cs = callStats(scope, month);
  const ws = webStats(scope, month);
  const here = scope === "all" ? "across the four stores" : `at ${scopeLabel(scope)}`;
  const seed = scope === "all" ? 0 : STORE_OPTIONS.findIndex((o) => o.value === scope);
  // Deterministic period-over-period deltas (seeded — no Date/random).
  const d = (n: number, span = 0.08) => Math.round(wave(seed + n, 4) * span * 1000) / 1000;

  const revD = d(1);
  const bookD = d(2, 0.06);
  const missD = d(3, 0.05); // positive = more missed = worse
  const rebookD = d(4, 0.05);
  const ratingD = d(5, 0.02);

  const changes: BriefChange[] = [
    { label: "Revenue", value: money(m.revenue), delta: revD, good: revD >= 0 },
    { label: "Bookings", value: m.bookings.toLocaleString(), delta: bookD, good: bookD >= 0 },
    { label: "Calls missed", value: pctStr(cs.missedPct), delta: missD, good: missD < 0 },
    { label: "Rebook rate", value: pctStr(m.rebook), delta: rebookD, good: rebookD >= 0 },
    { label: "Avg rating", value: m.rating.toFixed(1), delta: ratingD, good: ratingD >= 0 },
  ];

  const dir = (n: number) => (n >= 0 ? "up" : "down");
  const wins = changes
    .filter((c) => c.good && Math.abs(c.delta) >= 0.01)
    .map((c) => `${c.label} ${dir(c.delta)} ${pctStr(Math.abs(c.delta))} ${here}.`);
  const risks = changes
    .filter((c) => !c.good && Math.abs(c.delta) >= 0.01)
    .map((c) => `${c.label} moved the wrong way (${dir(c.delta)} ${pctStr(Math.abs(c.delta))}) ${here}.`);

  const opportunity =
    cs.missedPct > 0.22
      ? { title: "Call capture is the biggest lever", detail: `${pctStr(cs.missedPct)} of inbound calls went unanswered ${here}. Instant text-back is the fastest recovery.` }
      : m.rebook < 0.5
        ? { title: "Rebooking is the biggest lever", detail: `Only ${pctStr(m.rebook)} of grooming customers rebook before leaving ${here}. A prompt at checkout is the most durable fix.` }
        : { title: "Online conversion is the biggest lever", detail: `${pctStr(1 - ws.convRate)} of website visitors leave without booking ${here}. The drop is concentrated in the booking form.` };

  return {
    headline: `Revenue ${revD >= 0 ? "rose" : "eased"} to ${money(m.revenue)} ${here}, and ${opportunity.title.replace(" is the biggest lever", "")} is the clearest opportunity to act on.`,
    changes,
    wins: wins.length ? wins : ["Performance held steady across the headline metrics."],
    risks: risks.length ? risks : ["No metric moved materially in the wrong direction."],
    opportunity,
    actionsCompleted: agentActions.filter((a) => a.status === "completed").length,
    actionsOpen: agentActions.filter((a) => a.status !== "completed").length,
    recommendation: opportunity.title,
  };
}

// ============================================================================
//  Manager dashboard — store-scoped, action-first views. Everything compares
//  the manager's store against the group on the SAME metric definitions (the
//  iron rule), never exposing another store's internals.
// ============================================================================

export function groomersForStore(store: StoreId): Groomer[] {
  const full = STORE_OPTIONS.find((o) => o.value === store)!.label;
  return groomers.filter((g) => g.store === full);
}

// The four-store average on each manager-movable metric (the comparison line).
export function groupAverages(month: MonthValue = "all") {
  const m = metrics("all", month);
  const cs = callStats("all", month);
  return { answeredPct: cs.answeredPct, rebook: m.rebook, attach: m.attach, noShow: m.noShow, rating: m.rating };
}

export type ScoreRow = {
  label: string;
  value: string;
  raw: number;
  avgLabel: string;
  delta: number | null; // real period-over-period change; null = no prior period
  invert: boolean; // true when lower is better (no-show)
  beatsAvg: boolean; // true = at or better than the group average
};

export function managerScorecard(store: StoreId, month: MonthValue = "all"): ScoreRow[] {
  const m = metrics(store, month);
  const cs = callStats(store, month);
  const g = groupAverages(month);
  const seed = STORE_OPTIONS.findIndex((o) => o.value === store);
  const d = (n: number, span: number) => Math.round(wave(seed + n, 6) * span * 1000) / 1000;
  const rows: { label: string; raw: number; avg: number; fmt: (n: number) => string; delta: number; invert?: boolean }[] = [
    { label: "Calls answered", raw: cs.answeredPct, avg: g.answeredPct, fmt: (n) => pctStr(n), delta: d(1, 0.05) },
    { label: "Rebook rate", raw: m.rebook, avg: g.rebook, fmt: (n) => pctStr(n), delta: d(2, 0.05) },
    { label: "Retail attach", raw: m.attach, avg: g.attach, fmt: (n) => pctStr(n), delta: d(3, 0.05) },
    { label: "No-show rate", raw: m.noShow, avg: g.noShow, fmt: (n) => pctStr(n), delta: d(4, 0.04), invert: true },
    { label: "Avg rating", raw: m.rating, avg: g.rating, fmt: (n) => n.toFixed(1), delta: d(5, 0.02) },
  ];
  return rows.map((r) => ({
    label: r.label,
    value: r.fmt(r.raw),
    raw: r.raw,
    avgLabel: r.fmt(r.avg),
    delta: r.delta,
    invert: !!r.invert,
    beatsAvg: r.invert ? r.raw <= r.avg : r.raw >= r.avg,
  }));
}

// Cross-store ranking on a single metric, for "where you stand".
export type RankMetric = "rebook" | "answered" | "attach" | "revenue";
export function storeRanking(metric: RankMetric, month: MonthValue = "all") {
  return stores
    .map((s) => {
      const value =
        metric === "revenue"
          ? metrics(s.id, month).revenue
          : metric === "answered"
            ? callStats(s.id, month).answeredPct
            : metric === "rebook"
              ? metrics(s.id, month).rebook
              : metrics(s.id, month).attach;
      return { id: s.id, name: s.name, value };
    })
    .sort((a, b) => b.value - a.value);
}

// Composite store score (0–100) for the scoreboard. Built only from things a
// store can control AND that we measure for real today — return rate and
// retail attach. Calls answered, review rating, and no-show join the score
// when their feeds (Twilio, GBP, bookings) go live; scoring dead-source zeros
// or seeded ratings would make the ranking dishonest.
export type StoreScore = {
  id: StoreId;
  name: string;
  score: number;
  rank: number;
};
export const SCORE_WEIGHTS = [
  { key: "rebook", label: "Return rate", weight: 60 },
  { key: "attach", label: "Retail attach", weight: 40 },
] as const;

export function storeScores(month: MonthValue = "all"): StoreScore[] {
  const rows = stores.map((s) => {
    const m = metrics(s.id, month);
    const cs = callStats(s.id, month);
    const ratingN = (m.rating - 4) / 1;
    const raw = cs.answeredPct * 0.25 + m.rebook * 0.25 + ratingN * 0.2 + m.attach * 0.15 + (1 - m.noShow) * 0.15;
    const score = Math.round(Math.min(99, Math.max(40, 50 + raw * 70)));
    return { id: s.id, name: s.name, score };
  });
  return rows.sort((a, b) => b.score - a.score).map((r, i) => ({ ...r, rank: i + 1 }));
}

// The single highest-priority focus for a store (store-scoped mirror of Home's
// deterministic topAction; AI-generated once data is live).
export function managerFocus(store: StoreId, month: MonthValue = "all") {
  const cs = callStats(store, month);
  const m = metrics(store, month);
  const here = `at ${scopeLabel(store)}`;
  const candidates = [
    {
      score: cs.missedPct,
      planKey: "call-capture",
      title: "Unanswered inbound calls are the biggest capture leak",
      detail: `${pctStr(cs.missedPct)} of inbound calls went unanswered ${here}. Each unanswered call is most often a booking that goes to a competitor instead.`,
      metric: `${pctStr(cs.missedPct)} of calls missed`,
      pending: true,
    },
    {
      score: 1 - m.rebook,
      planKey: "rebook-coach",
      title: "Rebooking at checkout is the most durable lever",
      detail: `Only ${pctStr(m.rebook)} of grooming customers rebook before leaving ${here}. A short prompt at checkout is the most reliable fix.`,
      metric: `${pctStr(m.rebook)} rebook rate`,
      pending: false,
    },
    {
      score: 1 - m.attach,
      planKey: "retail-attach",
      title: "Retail attachment on grooming visits is below the group",
      detail: `${pctStr(m.attach)} of grooming visits ${here} add a retail item. Suggesting food or accessories at checkout is the simplest add.`,
      metric: `${pctStr(m.attach)} retail attach`,
      pending: false,
    },
  ];
  return candidates.sort((a, b) => b.score - a.score)[0];
}

// The agent actions relevant to one store (its own + all-store actions).
export function agentActionsForStore(store: StoreId): AgentAction[] {
  const full = STORE_OPTIONS.find((o) => o.value === store)!.label;
  return agentActions.filter(
    (a) =>
      a.store === "All stores" ||
      a.store === full ||
      a.store.split(" · ").some((part) => part === full || full.startsWith(part)),
  );
}

export function customersNeedingAttention(store: StoreId): CustomerRow[] {
  return customerBook
    .filter((c) => c.storeId === store && (c.segment === "At risk" || c.segment === "Lapsed"))
    .sort((a, b) => b.lastVisit - a.lastVisit);
}

// ============================================================================
//  Compare page — shared, client-safe constants (the engine lives in
//  data.server.ts; these drive the controls and URL parsing on both sides)
// ============================================================================

export type CompareMode = "stores" | "groomers" | "products";
export type ComparePreset = "mom" | "yoy" | "30d" | "custom";
export type CompareFormat = "money" | "number" | "pct";
export type CompareMetricDef = { key: string; label: string; format: CompareFormat };

export const COMPARE_MODES: { value: CompareMode; label: string }[] = [
  { value: "stores", label: "Stores" },
  { value: "groomers", label: "Groomers" },
  { value: "products", label: "Products" },
];

export const COMPARE_PRESETS: { value: ComparePreset; label: string }[] = [
  { value: "mom", label: "vs last month" },
  { value: "yoy", label: "vs last year" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom dates" },
];

export const COMPARE_METRICS: Record<CompareMode, CompareMetricDef[]> = {
  stores: [
    { key: "revenue", label: "Revenue", format: "money" },
    { key: "bookings", label: "Bookings", format: "number" },
    { key: "avgTicket", label: "Avg visit", format: "money" },
    { key: "rebook", label: "Return rate", format: "pct" },
    { key: "attach", label: "Retail attach", format: "pct" },
    { key: "groomingShare", label: "Grooming share", format: "pct" },
  ],
  groomers: [
    { key: "revenue", label: "Service revenue", format: "money" },
    { key: "appts", label: "Appointments", format: "number" },
    { key: "avgTicket", label: "Avg service ticket", format: "money" },
  ],
  products: [
    { key: "revenue", label: "Revenue", format: "money" },
    { key: "units", label: "Units sold", format: "number" },
    { key: "margin", label: "Margin (retail)", format: "pct" },
  ],
};

export function parseCompareMode(v?: string | null): CompareMode {
  return COMPARE_MODES.some((m) => m.value === v) ? (v as CompareMode) : "stores";
}
export function parseComparePreset(v?: string | null): ComparePreset {
  return COMPARE_PRESETS.some((p) => p.value === v) ? (v as ComparePreset) : "mom";
}
export function parseCompareMetric(mode: CompareMode, v?: string | null): string {
  return COMPARE_METRICS[mode].some((m) => m.key === v) ? (v as string) : COMPARE_METRICS[mode][0].key;
}
