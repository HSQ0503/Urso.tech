import { getAdminToken } from "@/session";
import { clearWgSession, getWgAccessToken } from "@/wg-auth";
import type { WgDashboardSection, WgMobileSectionData } from "@urso/types";

// This adapter is deliberately separate from src/api.ts. Woof Gang has its own
// identity, tenant routes, and data contract; the Urso token is only a verified
// support-mode fallback, never a client-side credential.
const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "https://urso.ws";

export type WgRole = "owner" | "manager";

export type WgStore = { id: string; name: string };

export type WgSession = {
  role: WgRole;
  name: string | null;
  stores: WgStore[];
  defaultStoreId: string | null;
  supportMode: boolean;
};

export type WgKpi = {
  label: string;
  value: string;
  change: string | null;
  tone: "good" | "bad" | "neutral";
  accent?: boolean;
};

export type WgTrendPoint = { label: string; value: number };

export type WgRanking = {
  id: string;
  name: string;
  value: string;
  detail: string | null;
  score: number | null;
};

export type WgAction = {
  id: string;
  title: string;
  detail: string | null;
  severity: "urgent" | "watch" | "normal";
};

export type WgStorePerformance = {
  id: string;
  name: string;
  revenue: string;
  avgTicket: string;
  rebook: number;
  attach: number;
};

export type WgFeed = {
  live: boolean;
  primary: string;
  secondary: string;
};

export type WgHome = {
  periodLabel: string;
  source: "ready" | "pending" | "unavailable";
  sourceNotice: string | null;
  headlineRevenue: string;
  headlineRevenueChange: string | null;
  revenueSource: "books" | "mixed" | "register";
  kpis: WgKpi[];
  trend: WgTrendPoint[];
  calls: WgFeed;
  web: WgFeed;
  rankings: WgRanking[];
  actions: WgAction[];
  brief: { headline: string; recommendation: string; actionsOpen: number } | null;
  stores: WgStorePerformance[];
  focus: string | null;
  team: WgRanking[];
  watchlist: WgAction[];
};

export type WgAiPart = { type: string; text?: string; [key: string]: unknown };
export type WgAiMessage = { id: string; role: "user" | "assistant"; parts: WgAiPart[] };
export type WgAiThread = { id: string; title: string; updatedAt: string };

export class WgApiError extends Error {
  readonly transient: boolean;

  constructor(message: string, transient = false) {
    super(message);
    this.name = "WgApiError";
    this.transient = transient;
  }
}

type Envelope = { ok?: boolean; data?: unknown; notice?: string };
type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function text(value: unknown, fallback = "—"): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function ratioPercent(value: unknown): number | null {
  const point = number(value);
  return point === null ? null : point * 100;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickArray(source: UnknownRecord, ...keys: string[]): unknown[] {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normaliseRole(value: unknown): WgRole {
  return value === "manager" ? "manager" : "owner";
}

function normaliseStore(value: unknown, index: number): WgStore {
  const item = record(value);
  return {
    id: text(item.id ?? item.storeId ?? item.slug, `store-${index}`),
    name: text(item.name ?? item.label ?? item.storeName, "Unnamed store"),
  };
}

function normaliseSession(value: unknown): WgSession {
  const data = record(value);
  const person = record(data.user ?? data.actor);
  const workspace = record(data.currentWorkspace);
  const workspaceRole = text(workspace.role ?? data.role, "owner");
  const defaultStoreId = text(workspace.storeId ?? data.defaultStoreId ?? data.storeId, "");
  // The API authorizes this list independently; showing the known locations is
  // just a mobile control affordance. A manager's route still pins itself to
  // the store carried by its backing account.
  const knownStoreNames: Record<string, string> = {
    wp: "Winter Park", wg: "Winter Garden", lv: "Lakeside Village", wm: "Windermere",
  };
  const stores = workspaceRole === "manager"
    ? [normaliseStore({ id: defaultStoreId, name: knownStoreNames[defaultStoreId] ?? "My store" }, 0)]
    : [
        { id: "all", name: "All stores" },
        { id: "wp", name: "Winter Park" },
        { id: "wg", name: "Winter Garden" },
        { id: "lv", name: "Lakeside Village" },
        { id: "wm", name: "Windermere" },
      ];
  return {
    role: normaliseRole(workspaceRole),
    name: text(person.name ?? data.name ?? data.displayName, "") || null,
    stores,
    defaultStoreId: defaultStoreId || null,
    supportMode: data.platformRole === "admin" || data.supportMode === true,
  };
}

function normaliseKpi(value: unknown): WgKpi {
  const item = record(value);
  const rawTone = text(item.tone ?? item.direction, "neutral");
  return {
    label: text(item.label ?? item.name ?? item.metric, "Metric"),
    value: text(item.displayValue ?? item.value ?? item.current),
    change: text(item.change ?? item.delta ?? item.comparison, "") || null,
    tone: rawTone === "good" || rawTone === "up" || rawTone === "positive"
      ? "good"
      : rawTone === "bad" || rawTone === "down" || rawTone === "negative"
        ? "bad"
        : "neutral",
  };
}

function normaliseTrend(value: unknown, index: number): WgTrendPoint {
  const item = record(value);
  return {
    label: text(item.label ?? item.date ?? item.day ?? item.month, String(index + 1)),
    value: number(item.value ?? item.revenue ?? item.amount) ?? 0,
  };
}

function normaliseRanking(value: unknown, index: number): WgRanking {
  const item = record(value);
  return {
    id: text(item.id ?? item.storeId ?? item.employeeId, `row-${index}`),
    name: text(item.name ?? item.storeName ?? item.employeeName, "Unnamed"),
    value: text(item.displayValue ?? item.value ?? item.revenue ?? item.score),
    detail: text(item.detail ?? item.subtitle ?? item.comparison, "") || null,
    score: number(item.score ?? item.percent ?? item.progress),
  };
}

function normaliseAction(value: unknown, index: number): WgAction {
  const item = record(value);
  const rawSeverity = text(item.severity ?? item.tone ?? item.priority, "normal");
  return {
    id: text(item.id ?? item.key, `action-${index}`),
    title: text(item.title ?? item.label ?? item.name, "Needs review"),
    detail: text(item.detail ?? item.description ?? item.reason, "") || null,
    severity: rawSeverity === "urgent" || rawSeverity === "high"
      ? "urgent"
      : rawSeverity === "watch" || rawSeverity === "medium"
        ? "watch"
        : "normal",
  };
}

function normaliseHome(value: unknown): WgHome {
  const data = record(value);
  const metrics = record(data.metrics);
  const deltas = record(data.deltas);
  const series = record(data.revenueSeries);
  const owner = record(data.owner);
  const ownerRevenue = record(data.ownerRevenue);
  const callStats = record(data.calls);
  const webStats = record(data.web);
  const manager = record(data.manager);
  const focus = record(manager.focus);
  const topAction = record(data.topAction);
  const periodLabel = (() => {
    const explicit = text(data.monthLabel ?? data.periodLabel, "");
    if (explicit) return explicit;
    const month = text(data.month, "");
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) return month || "This month";
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  })();
  const money = (amount: unknown): string => {
    const value = number(amount);
    return value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  };
  const percentage = (value: unknown): string => {
    const percent = ratioPercent(value);
    if (percent === null) return "—";
    return `${Math.round(percent)}%`;
  };
  const delta = (key: string): string | null => {
    const value = number(deltas[key]);
    if (value === null) return null;
    const percent = value * 100;
    return `${percent > 0 ? "+" : ""}${Math.round(percent)}% vs prior month`;
  };
  const revenueSource = text(ownerRevenue.source, "register");
  // Closed-books revenue must only use its like-for-like books delta. Mixed or
  // open periods intentionally fall back to the register comparison, matching
  // the web dashboard's accounting-basis rule.
  const revenueDeltaValue = revenueSource === "books" ? number(ownerRevenue.delta) : number(deltas.revenue);
  const exactKpis: WgKpi[] = [
    { label: "Revenue", value: money(ownerRevenue.total ?? metrics.revenue), change: revenueDeltaValue === null ? null : `${revenueDeltaValue > 0 ? "+" : ""}${Math.round(revenueDeltaValue * 100)}% vs prior month`, tone: (revenueDeltaValue ?? 0) >= 0 ? "good" : "bad" },
    { label: "Bookings", value: text(metrics.bookings), change: delta("bookings"), tone: (number(deltas.bookings) ?? 0) >= 0 ? "good" : "bad" },
    { label: "Avg visit", value: money(metrics.avgTicket), change: delta("avgTicket"), tone: (number(deltas.avgTicket) ?? 0) >= 0 ? "good" : "bad" },
    { label: "Return rate", value: percentage(metrics.rebook), change: delta("rebook"), tone: (number(deltas.rebook) ?? 0) >= 0 ? "good" : "bad" },
    { label: "Retail attach", value: percentage(metrics.attach), change: delta("attach"), tone: (number(deltas.attach) ?? 0) >= 0 ? "good" : "bad" },
    { label: "Grooming share", value: percentage(metrics.groomingShare), change: delta("groomingShare"), tone: (number(deltas.groomingShare) ?? 0) >= 0 ? "good" : "bad" },
  ];
  const strongestGain = exactKpis
    .map((item, index) => ({ index, value: index === 0 ? revenueDeltaValue : number(deltas[["revenue", "bookings", "avgTicket", "rebook", "attach", "groomingShare"][index]]) }))
    .filter((item): item is { index: number; value: number } => item.value !== null && item.value > 0)
    .sort((a, b) => b.value - a.value)[0];
  if (strongestGain) exactKpis[strongestGain.index].accent = true;
  const managerScorecard = pickArray(manager, "scorecard").map((item) => {
    const score = record(item);
    const change = number(score.delta);
    return {
      label: text(score.label, "Metric"),
      value: text(score.value),
      change: [
        change === null ? null : `${change > 0 ? "+" : ""}${Math.round(change * 100)}% vs prior`,
        text(score.avgLabel, "") ? `Group ${text(score.avgLabel)}` : null,
      ].filter((part): part is string => part !== null).join(" · ") || null,
      tone: score.beatsAvg === true ? "good" as const : score.beatsAvg === false ? "bad" as const : "neutral" as const,
    };
  });
  const ownerRankings = pickArray(owner, "stores").map((item, index) => {
    const store = record(item);
    return {
      id: text(store.id, `store-${index}`),
      name: text(store.name, "Store"),
      value: money(store.revenue),
      detail: `${text(store.bookings, "0")} bookings · ${percentage(store.rebook)} rebook`,
      score: ratioPercent(store.rebook),
    };
  });
  const ownerStores: WgStorePerformance[] = pickArray(owner, "stores").map((item, index) => {
    const store = record(item);
    return {
      id: text(store.id, `store-${index}`),
      name: text(store.name, "Store"),
      revenue: money(store.revenue),
      avgTicket: money(store.avgTicket),
      rebook: ratioPercent(store.rebook) ?? 0,
      attach: ratioPercent(store.attach) ?? 0,
    };
  });
  const brief = record(owner.brief);
  const managerTeam = pickArray(manager, "team").map((item, index) => {
    const member = record(item);
    return {
      id: text(member.id, `team-${index}`),
      name: text(member.name, "Team member"),
      value: money(member.revenue),
      detail: `${text(member.appts, "0")} appointments · ${percentage(member.rebook)} rebook`,
      score: ratioPercent(member.attach),
    };
  });
  const managerWatchlist = pickArray(manager, "watchlist").map((item, index) => {
    const customer = record(item);
    return {
      id: `watch-${index}`,
      title: text(customer.name, "Customer"),
      detail: `${text(customer.pet, "Pet")} · ${text(customer.next, "Review next visit")}`,
      severity: "watch" as const,
    };
  });
  const managerActions = pickArray(manager, "actions").map((item, index) => {
    const action = record(item);
    return {
      id: text(action.id, `action-${index}`),
      title: text(action.title, "Needs review"),
      detail: text(action.metric ?? action.status, "") || null,
      severity: text(action.status).toLowerCase().includes("urgent") ? "urgent" as const : "normal" as const,
    };
  });
  const source = record(data.source);
  const sourceStatus = text(source.status ?? data.sourceStatus, topAction.pending === true || focus.pending === true ? "pending" : "ready");
  return {
    periodLabel,
    source: sourceStatus === "pending" ? "pending" : sourceStatus === "ready" ? "ready" : "unavailable",
    sourceNotice: text(source.notice ?? source.message ?? data.sourceNotice, "") || (sourceStatus === "pending" ? "An automated recommendation is still being prepared; current performance figures are available." : null),
    headlineRevenue: money(ownerRevenue.total ?? metrics.revenue),
    headlineRevenueChange: revenueDeltaValue === null ? null : `${revenueDeltaValue > 0 ? "+" : ""}${Math.round(revenueDeltaValue * 100)}%`,
    revenueSource: revenueSource === "books" || revenueSource === "mixed" ? revenueSource : "register",
    kpis: managerScorecard.length ? managerScorecard : exactKpis,
    trend: array(series.revenue).map((amount, index) => ({ label: text(array(series.labels)[index], String(index + 1)), value: number(amount) ?? 0 })),
    calls: {
      live: (number(callStats.total) ?? 0) > 0,
      primary: `${text(callStats.total, "0")} calls`,
      secondary: `${Math.round((ratioPercent(callStats.missedPct) ?? 0))}% missed`,
    },
    web: {
      live: (number(webStats.visits) ?? 0) > 0,
      primary: `${text(webStats.visits, "0")} visits`,
      secondary: `${Math.round((ratioPercent(webStats.convRate) ?? 0))}% book online`,
    },
    rankings: ownerRankings.length ? ownerRankings : pickArray(manager, "rankings").map(normaliseRanking),
    actions: topAction.title ? [normaliseAction({ id: "top-action", title: topAction.title, detail: topAction.detail, severity: topAction.pending ? "watch" : "normal" }, 0)] : managerActions,
    brief: brief.headline ? {
      headline: text(brief.headline),
      recommendation: text(brief.recommendation, ""),
      actionsOpen: number(brief.actionsOpen) ?? 0,
    } : null,
    stores: ownerStores,
    focus: focus.title ? `${text(focus.title)}${focus.detail ? ` — ${text(focus.detail)}` : ""}` : null,
    team: managerTeam,
    watchlist: managerWatchlist.length ? managerWatchlist : managerActions,
  };
}

function normaliseAiThread(value: unknown): WgAiThread | null {
  const item = record(value);
  const id = text(item.id, "");
  if (!id) return null;
  return { id, title: text(item.title, "New conversation"), updatedAt: text(item.updated_at ?? item.updatedAt, "") };
}

function normaliseAiMessage(value: unknown): WgAiMessage | null {
  const item = record(value);
  const id = text(item.id, "");
  const role = item.role === "user" || item.role === "assistant" ? item.role : null;
  if (!id || !role) return null;
  const parts = array(item.parts)
    .map(record)
    .filter((part) => typeof part.type === "string")
    .map((part) => ({ ...part, type: part.type as string, text: typeof part.text === "string" ? part.text : undefined }));
  return { id, role, parts };
}

type Credential = { token: string; source: "woof-gang" | "admin" };

async function credentials(): Promise<Credential[]> {
  const [wgToken, adminToken] = await Promise.all([getWgAccessToken(), getAdminToken()]);
  const available: Credential[] = [];
  if (wgToken) available.push({ token: wgToken, source: "woof-gang" });
  if (adminToken && adminToken !== wgToken) available.push({ token: adminToken, source: "admin" });
  if (!available.length) throw new WgApiError("Sign in to a Woof Gang workspace first.");
  return available;
}

async function get(path: string): Promise<unknown> {
  const available = await credentials();
  for (let index = 0; index < available.length; index += 1) {
    const credential = available[index];
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/api/v1${path}`, {
        headers: { authorization: `Bearer ${credential.token}` },
      });
    } catch {
      throw new WgApiError("No connection. Pull down to try again.", true);
    }

    let body: Envelope;
    try {
      body = (await response.json()) as Envelope;
    } catch {
      throw new WgApiError("The workspace sent an unexpected response.", true);
    }
    if (response.ok && body.ok === true) return body.data;

    // A revoked/expired tenant JWT must not shadow a still-valid Urso support
    // credential. Drop it and retry exactly once with the HMAC admin token.
    if (response.status === 401 && credential.source === "woof-gang") {
      await clearWgSession();
      if (index + 1 < available.length) continue;
    }
    throw new WgApiError(body.notice ?? "This workspace is unavailable right now.", response.status >= 500);
  }
  throw new WgApiError("Sign in again.");
}

async function write(method: "POST" | "PATCH" | "DELETE", path: string, payload?: unknown): Promise<unknown> {
  const available = await credentials();
  for (let index = 0; index < available.length; index += 1) {
    const credential = available[index];
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/api/v1${path}`, {
        method,
        headers: {
          authorization: `Bearer ${credential.token}`,
          "content-type": "application/json",
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
    } catch {
      throw new WgApiError("No connection. Try again when you're back online.", true);
    }

    let body: Envelope;
    try {
      body = (await response.json()) as Envelope;
    } catch {
      throw new WgApiError("The workspace sent an unexpected response.", true);
    }
    if (response.ok && body.ok === true) return body.data;
    if (response.status === 401 && credential.source === "woof-gang") {
      await clearWgSession();
      if (index + 1 < available.length) continue;
    }
    throw new WgApiError(body.notice ?? "The request could not be completed.", response.status >= 500);
  }
  throw new WgApiError("Sign in again.");
}

const post = (path: string, payload: unknown) => write("POST", path, payload);
const patch = (path: string, payload: unknown) => write("PATCH", path, payload);
const remove = (path: string) => write("DELETE", path);

async function responseNotice(response: Response): Promise<string> {
  try {
    const body = JSON.parse(await response.text()) as Envelope;
    return body.notice ?? "The analyst request could not be completed.";
  } catch {
    return "The analyst request could not be completed.";
  }
}

async function stream(path: string, payload: unknown, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
  const available = await credentials();
  for (let index = 0; index < available.length; index += 1) {
    const credential = available[index];
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/api/v1${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${credential.token}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new WgApiError("No connection. Try again when you're back online.", true);
    }
    if (response.status === 401 && credential.source === "woof-gang") {
      await clearWgSession();
      if (index + 1 < available.length) continue;
    }
    if (!response.ok) throw new WgApiError(await responseNotice(response), response.status >= 500);

    const reader = response.body?.getReader();
    if (!reader) {
      const answer = await response.text();
      if (answer) onChunk(answer);
      return answer;
    }
    const decoder = new TextDecoder();
    let answer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (!chunk) continue;
      answer += chunk;
      onChunk(chunk);
    }
    const tail = decoder.decode();
    if (tail) {
      answer += tail;
      onChunk(tail);
    }
    return answer;
  }
  throw new WgApiError("Sign in again.");
}

export const woofGangApi = {
  session: async (): Promise<WgSession> => normaliseSession(await get("/mobile/session")),
  home: async (storeId: string | null, month: string): Promise<WgHome> => {
    const params = new URLSearchParams({ month });
    if (storeId) params.set("store", storeId);
    return normaliseHome(await get(`/workspaces/woof-gang/home?${params.toString()}`));
  },
  askAi: async (message: string, storeId: string | null, month: string, topic?: string): Promise<string> => {
    const data = record(await post("/workspaces/woof-gang/ai/chat", { message, store: storeId, month, topic }));
    return text(data.answer, "The analyst did not return an answer.");
  },
  aiThreads: async (): Promise<WgAiThread[]> => {
    const data = record(await get("/workspaces/woof-gang/ai/threads"));
    return pickArray(data, "threads").map(normaliseAiThread).filter((thread): thread is WgAiThread => thread !== null);
  },
  createAiThread: async (scope: string): Promise<WgAiThread> => {
    const data = record(await post("/workspaces/woof-gang/ai/threads", { scope }));
    const thread = normaliseAiThread(data.thread);
    if (!thread) throw new WgApiError("The server did not return a conversation.", true);
    return thread;
  },
  aiMessages: async (threadId: string): Promise<WgAiMessage[]> => {
    const data = record(await get(`/workspaces/woof-gang/ai/threads/${encodeURIComponent(threadId)}`));
    return pickArray(data, "messages").map(normaliseAiMessage).filter((message): message is WgAiMessage => message !== null);
  },
  renameAiThread: async (threadId: string, title: string): Promise<void> => {
    await patch(`/workspaces/woof-gang/ai/threads/${encodeURIComponent(threadId)}`, { title });
  },
  deleteAiThread: async (threadId: string): Promise<void> => {
    await remove(`/workspaces/woof-gang/ai/threads/${encodeURIComponent(threadId)}`);
  },
  streamAi: (
    messages: WgAiMessage[],
    threadId: string | null,
    storeId: string | null,
    month: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<string> => stream("/workspaces/woof-gang/ai/agent", { messages, threadId: threadId ?? undefined, store: storeId ?? undefined, month }, onChunk, signal),
  section: async (
    section: WgDashboardSection,
    storeId: string | null,
    month: string,
    options: Record<string, string | number | undefined> = {},
  ): Promise<WgMobileSectionData> => {
    const params = new URLSearchParams({ section, month });
    if (storeId) params.set("store", storeId);
    for (const [key, value] of Object.entries(options)) if (value !== undefined) params.set(key, String(value));
    const value = await get(`/workspaces/woof-gang/dashboard?${params.toString()}`);
    const data = record(value);
    if (data.section !== section || !Array.isArray(data.blocks)) throw new WgApiError("The dashboard sent an unexpected response.", true);
    return value as WgMobileSectionData;
  },
  updateAction: async (id: string, status: "approved" | "dismissed"): Promise<void> => {
    await post("/workspaces/woof-gang/actions", { id, status });
  },
  createEvent: async (input: { store: string; eventType: string; title: string; detail: string; start: string; end: string }): Promise<void> => {
    await post("/workspaces/woof-gang/events", input);
  },
  deleteEvent: async (id: string): Promise<void> => {
    await post("/workspaces/woof-gang/events", { action: "delete", id });
  },
};
