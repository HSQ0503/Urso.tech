// Shared, transport-safe contracts for the Woof Gang mobile API. These are
// intentionally plain data types: no Next.js, Supabase, or React Native APIs.

export type MobileApiSuccess<T> = { ok: true; data: T };
export type MobileApiFailure = { ok: false; notice: string };
export type MobileApiResult<T> = MobileApiSuccess<T> | MobileApiFailure;

export type WgStoreId = "wp" | "wg" | "lv" | "wm";
export type WgDashboardRole = "urso_admin" | "owner" | "manager";
export type MobilePlatformRole = "admin" | "member" | "crew";

export type MobileWorkspace = {
  id: "woof-gang" | "canes";
  name: string;
  role: WgDashboardRole | "owner" | "ops_manager" | "technician";
  storeId: WgStoreId | null;
};

export type MobileSession = {
  user: { id: string; name: string; email: string };
  platformRole: MobilePlatformRole;
  workspaces: MobileWorkspace[];
  currentWorkspace: MobileWorkspace;
};

export type WgMetric = {
  revenue: number;
  bookings: number;
  grooming: number;
  retail: number;
  groomingShare: number;
  avgTicket: number;
  rebook: number;
  noShow: number;
  attach: number;
  rating: number;
};

export type WgMobileHome = {
  workspace: "woof-gang";
  role: WgDashboardRole | "owner";
  storeId: "all" | WgStoreId;
  month: string;
  metrics: WgMetric;
  deltas: Record<string, number | null>;
  ownerRevenue: {
    total: number;
    source: "books" | "mixed" | "register";
    delta: number | null;
  };
  calls: { total: number; missed: number; missedPct: number; answeredPct: number };
  web: { visits: number; bookings: number; convRate: number };
  revenueSeries: {
    labels: string[];
    revenue: number[];
    callsTotal: number[];
    callsMissed: number[];
    webVisits: number[];
    webBookings: number[];
  };
  topAction: { title: string; detail: string; metric: string; pending: boolean };
  owner?: {
    brief: { headline: string; recommendation: string; actionsOpen: number };
    stores: Array<{
      id: WgStoreId;
      name: string;
      revenue: number;
      bookings: number;
      avgTicket: number;
      rebook: number;
      attach: number;
      missedPct: number;
    }>;
  };
  manager?: {
    focus: { title: string; detail: string; metric: string; pending: boolean };
    scorecard: Array<{ label: string; value: string; raw: number; avgLabel: string; delta: number | null; beatsAvg: boolean }>;
    rankings: Array<{ id: WgStoreId; name: string; value: number }>;
    team: Array<{ id: string; name: string; revenue: number; appts: number; rebook: number | null; attach: number | null }>;
    watchlist: Array<{ name: string; pet: string; lastVisit: number; segment: string; next: string }>;
    actions: Array<{ id: string; title: string; metric: string; status: string }>;
  };
};

export const WG_DASHBOARD_SECTIONS = [
  "brief",
  "performance",
  "revenue",
  "money",
  "compare",
  "customers",
  "products",
  "actions",
  "events",
  "stores",
  "team",
  "reviews",
] as const;

export type WgDashboardSection = (typeof WG_DASHBOARD_SECTIONS)[number];
export type WgValueFormat = "money" | "number" | "percent" | "decimal" | "text";
export type WgTone = "plain" | "accent" | "good" | "bad" | "muted" | "warning";

export type WgMobileMetric = {
  label: string;
  value: number | null;
  display: string;
  format: WgValueFormat;
  detail?: string;
  delta?: number | null;
  tone?: WgTone;
};

export type WgMobileChartSeries = {
  name: string;
  values: Array<number | null>;
  format: WgValueFormat;
  tone?: WgTone;
};

export type WgMobileTableRow = {
  id: string;
  cells: string[];
  detail?: string;
  tone?: WgTone;
};

export type WgMobileSectionBlock =
  | { id: string; type: "metrics"; title?: string; items: WgMobileMetric[] }
  | { id: string; type: "line"; title: string; detail?: string; labels: string[]; series: WgMobileChartSeries[] }
  | { id: string; type: "bars"; title: string; detail?: string; format: WgValueFormat; rows: Array<{ id: string; label: string; value: number; display: string; detail?: string; tone?: WgTone }> }
  | { id: string; type: "segments"; title: string; detail?: string; items: Array<{ label: string; value: number; display: string; tone?: WgTone }> }
  | { id: string; type: "funnel"; title: string; detail?: string; steps: Array<{ label: string; value: number; display: string; tone?: WgTone }> }
  | { id: string; type: "table"; title: string; detail?: string; columns: string[]; rows: WgMobileTableRow[] }
  | { id: string; type: "narrative"; title: string; body?: string; items?: string[]; tone?: WgTone }
  | { id: string; type: "brief"; headline: string; changes: WgMobileMetric[]; wins: string[]; risks: string[]; opportunity: { title: string; detail: string }; recommendation: string; actionsCompleted: number; actionsOpen: number }
  | { id: string; type: "actions"; title: string; items: Array<{ id: string; title: string; store: string; agent: string; detail: string; metric: string; status: string; result?: string; pending?: boolean }> }
  | { id: string; type: "events"; title: string; canEdit: boolean; managerStoreId: WgStoreId | null; items: Array<{ id: string; store: string; storeId: WgStoreId | null; eventType: string; title: string; detail: string | null; start: string; end: string | null; createdBy: string | null }> };

export type WgMobileSectionData = {
  workspace: "woof-gang";
  section: WgDashboardSection;
  title: string;
  eyebrow: string;
  scope: "all" | WgStoreId;
  period: string;
  ownerOnly: boolean;
  blocks: WgMobileSectionBlock[];
  controls?: {
    query?: string;
    sort?: string;
    direction?: "asc" | "desc";
    page?: number;
    pages?: number;
    total?: number;
    compareMode?: "stores" | "groomers" | "products";
    comparePreset?: "mom" | "yoy" | "years" | "30d" | "custom";
    compareMetric?: string;
    compareA?: string;
    compareB?: string;
  };
};
