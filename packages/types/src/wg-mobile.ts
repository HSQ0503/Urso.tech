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
  revenueSeries: { labels: string[]; revenue: number[] };
  topAction: { title: string; detail: string; metric: string; pending: boolean };
  owner?: {
    brief: { headline: string; recommendation: string; actionsOpen: number };
    stores: Array<{ id: WgStoreId; name: string; revenue: number; bookings: number; rebook: number; attach: number; missedPct: number }>;
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
