// Tool belt for the urso.ai chat agent. Every tool is bound to the session's
// resolved scope at construction — a manager's tools physically cannot read
// another store, regardless of what the model asks for. Scope comes from the
// session, never from the model.

import { tool } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getMetrics,
  getKpiDeltas,
  storeComparison,
  getRevenueByService,
  getTeamRoster,
  getCustomerSegments,
  getCustomerIntel,
  getReturnRateTrend,
  getRetention,
  getWinbackList,
  getCustomersByValue,
  getRevenueNewVsRepeat,
  getAllAgentActions,
  getCrossSell,
  getEventsInRange,
} from "@/components/dashboard/data.server";
import { stores, type Scope, type StoreId, type MonthValue } from "@/components/dashboard/data";
import { BUSINESS_SECTIONS, BUSINESS_SECTION_KEYS, getBusinessSection } from "@/lib/ai/business";

const monthSchema = z
  .string()
  .regex(/^(all|\d{4}|\d{4}-\d{2})$/, 'use "YYYY-MM", "YYYY", or "all" (trailing 12 months)')
  .describe('Period: "YYYY-MM" for a month, "YYYY" for a year, "all" for the trailing 12 months');

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

const nyToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const r0 = (n: number) => Math.round(n);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function allowedIds(allowed: Scope): StoreId[] {
  return allowed === "all" ? stores.map((s) => s.id) : [allowed];
}

// Per-store rows from the metrics_monthly RPC, filtered to the allowed scope.
// The RPC's p_end is exclusive, so pass the first day of the month AFTER toMonth.
async function monthlySeries(allowed: Scope, fromMonth: string, toMonth: string) {
  const [y, m] = toMonth.split("-").map(Number);
  const endExclusive = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("metrics_monthly", {
    p_start: `${fromMonth}-01`,
    p_end: endExclusive,
  });
  if (error) throw new Error(`metrics_monthly failed: ${error.message}`);
  const ids = new Set<string>(allowedIds(allowed));
  type Row = {
    store_id: StoreId; month: string; revenue: number; grooming_revenue: number; retail_revenue: number;
    booking_revenue: number; bookings: number; identified_bookings: number; rebooks: number; retail_attached: number;
  };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => ids.has(r.store_id))
    .map((r) => ({
      store: r.store_id,
      month: r.month.slice(0, 7),
      revenue: r0(Number(r.revenue)),
      grooming: r0(Number(r.grooming_revenue)),
      retail: r0(Number(r.retail_revenue)),
      bookings: Number(r.bookings),
      avgVisit: Number(r.bookings) ? r0(Number(r.booking_revenue) / Number(r.bookings)) : 0,
      returnRate: Number(r.identified_bookings) ? r3(Number(r.rebooks) / Number(r.identified_bookings)) : null,
    }));
}

// Per-store aggregates for an arbitrary [start, endExclusive) window via the
// metrics_by_store RPC — the same rollup every dashboard page reads.
async function rangeMetrics(allowed: Scope, start: string, endExclusive: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("metrics_by_store", { p_start: start, p_end: endExclusive });
  if (error) throw new Error(`metrics_by_store failed: ${error.message}`);
  type Row = {
    store_id: StoreId; revenue: number; grooming_revenue: number; retail_revenue: number; booking_revenue: number;
    bookings: number; identified_bookings: number; rebooks: number; retail_attached: number;
  };
  const ids = new Set<string>(allowedIds(allowed));
  return ((data ?? []) as unknown as Row[])
    .filter((r) => ids.has(r.store_id))
    .map((r) => ({
      store: r.store_id,
      revenue: r0(Number(r.revenue)),
      grooming: r0(Number(r.grooming_revenue)),
      retail: r0(Number(r.retail_revenue)),
      bookings: Number(r.bookings),
      avgVisit: Number(r.bookings) ? r0(Number(r.booking_revenue) / Number(r.bookings)) : 0,
      returnRate: Number(r.identified_bookings) ? r3(Number(r.rebooks) / Number(r.identified_bookings)) : null,
      retailAttach: Number(r.bookings) ? r3(Number(r.retail_attached) / Number(r.bookings)) : null,
    }));
}

type Mover = { name: string; value: number; baseline: number; delta: number };
function movers(cur: { name: string; value: number }[], base: { name: string; value: number }[], top: number): { up: Mover[]; down: Mover[] } {
  const baseMap = new Map(base.map((p) => [p.name, p.value]));
  const names = new Set([...cur.map((p) => p.name), ...base.map((p) => p.name)]);
  const curMap = new Map(cur.map((p) => [p.name, p.value]));
  const all: Mover[] = [...names].map((name) => {
    const value = r0(curMap.get(name) ?? 0);
    const baseline = r0(baseMap.get(name) ?? 0);
    return { name, value, baseline, delta: value - baseline };
  });
  const sorted = [...all].sort((a, b) => b.delta - a.delta);
  return {
    up: sorted.filter((m) => m.delta > 0).slice(0, top),
    down: sorted.filter((m) => m.delta < 0).reverse().slice(0, top),
  };
}

export function buildAnalystTools(allowed: Scope, cross: Scope = allowed) {
  const ids = allowedIds(allowed);
  // `cross` widens the comparison/trend tools to every store an owner may see, so
  // an owner filtered to one store can still ask cross-store questions. For a
  // manager the caller passes cross === their store, so they stay fully locked.
  const crossIds = allowedIds(cross);

  return {
    metrics_overview: tool({
      description:
        "Headline metrics for the allowed scope in one period: revenue, grooming/retail split, bookings, avg visit, return rate, retail attach — plus deltas vs the prior comparable period.",
      inputSchema: z.object({ month: monthSchema }),
      execute: async ({ month }) => {
        const [m, deltas] = await Promise.all([
          getMetrics(allowed, month as MonthValue),
          getKpiDeltas(allowed, month as MonthValue),
        ]);
        return {
          revenue: m.revenue, grooming: m.grooming, retail: m.retail, groomingShare: r3(m.groomingShare),
          bookings: m.bookings, avgVisit: m.avgTicket, returnRate: r3(m.rebook), retailAttach: r3(m.attach),
          deltasVsPriorPeriod: deltas,
        };
      },
    }),

    monthly_series: tool({
      description:
        "Per-store monthly time series (revenue, grooming, retail, bookings, avg visit, return rate). Use for trends — slope, seasonality, when a change started. Data starts 2024-01.",
      inputSchema: z.object({
        fromMonth: z.string().regex(/^\d{4}-\d{2}$/).describe("inclusive start, YYYY-MM, earliest 2024-01"),
        toMonth: z.string().regex(/^\d{4}-\d{2}$/).describe("inclusive end, YYYY-MM"),
      }),
      execute: ({ fromMonth, toMonth }) => monthlySeries(cross, fromMonth, toMonth),
    }),

    store_comparison: tool({
      description:
        "Side-by-side store metrics for one CALENDAR period — a month (YYYY-MM), a year (YYYY), or the trailing 12 months (all). Only the stores the user may see. For a CUSTOM date window (e.g. May 1–June 16, a specific week, 'since the 5th'), use store_comparison_range instead.",
      inputSchema: z.object({ month: monthSchema }),
      execute: async ({ month }) => {
        const byStore = await storeComparison(month as MonthValue);
        return crossIds.map((id) => {
          const m = byStore[id];
          return {
            store: id, name: stores.find((s) => s.id === id)!.name,
            revenue: m.revenue, grooming: m.grooming, retail: m.retail, bookings: m.bookings,
            avgVisit: m.avgTicket, returnRate: r3(m.rebook), retailAttach: r3(m.attach),
          };
        });
      },
    }),

    store_comparison_range: tool({
      description:
        "Side-by-side metrics for ALL stores the user may see across an ARBITRARY date window (both dates inclusive): revenue, grooming/retail split, bookings, avg visit, return rate, retail attach — one row per store. Use THIS to compare stores over a custom period like 'May 1–June 16', a specific week, or any range that isn't a whole calendar month (store_comparison can't). To compare two periods, call it once per period and diff the rows. Data starts 2024-01-01.",
      inputSchema: z.object({
        startDate: dateSchema.describe("first day included, YYYY-MM-DD"),
        endDate: dateSchema.describe("last day included, YYYY-MM-DD"),
      }),
      execute: async ({ startDate, endDate }) => {
        const rows = await rangeMetrics(cross, startDate, addDays(endDate, 1));
        const byId = new Map(rows.map((row) => [row.store, row]));
        return crossIds.map((id) => {
          const m = byId.get(id);
          return {
            store: id, name: stores.find((s) => s.id === id)!.name,
            revenue: m?.revenue ?? 0, grooming: m?.grooming ?? 0, retail: m?.retail ?? 0,
            bookings: m?.bookings ?? 0, avgVisit: m?.avgVisit ?? 0,
            returnRate: m?.returnRate ?? null, retailAttach: m?.retailAttach ?? null,
          };
        });
      },
    }),

    product_performance: tool({
      description: "Top products and services by revenue for a period, tagged service vs retail.",
      inputSchema: z.object({
        month: monthSchema,
        top: z.number().int().min(5).max(40).default(20).describe("how many rows"),
      }),
      execute: async ({ month, top }) => {
        const rows = await getRevenueByService(allowed, month as MonthValue);
        return rows.slice(0, top).map((p) => ({ name: p.name, revenue: r0(p.value), line: p.line }));
      },
    }),

    team_performance: tool({
      description:
        "Groomer roster for a period: gross service revenue performed, appointments, avg ticket, lifetime return rate and retail attach — PLUS store-retained contribution after the groomer's commission (groomers keep 50%, the Winter Park manager-groomer 55%). Judge groomers on storeRetained (contribution to the store), not gross revenue. Null return/attach means too little history.",
      inputSchema: z.object({ month: monthSchema }),
      execute: async ({ month }) => {
        const rows = await getTeamRoster(allowed, month as MonthValue);
        return rows.slice(0, 20).map((g) => ({
          name: g.name, store: g.store, revenue: r0(g.revenue), appts: g.appts,
          avgTicket: r0(g.avgTicket), returnRate: g.rebook != null ? r3(g.rebook) : null,
          retailAttach: g.attach != null ? r3(g.attach) : null,
          commissionPct: r3(g.commissionRate), payout: r0(g.payout), storeRetained: r0(g.storeRetained),
        }));
      },
    }),

    customer_health: tool({
      description:
        "Customer base health: segment counts (VIP/Loyal/At risk/Lapsed/Dormant), average LTV, at-risk count, and the monthly return-rate trend over the trailing year.",
      inputSchema: z.object({}),
      execute: async () => {
        const [segments, intel, trend] = await Promise.all([
          getCustomerSegments(allowed),
          getCustomerIntel(allowed),
          getReturnRateTrend(allowed),
        ]);
        return {
          segments,
          avgLtv: intel.avgLtv,
          customersWithVisits: intel.count,
          atRiskOrLapsed: intel.atRisk,
          returnRateByMonth: trend?.map((t) => ({ month: t.label, rate: r3(t.value) })) ?? null,
        };
      },
    }),

    decompose_revenue_change: tool({
      description:
        "THE trend-attribution tool. Compares two periods and breaks the revenue change down: per-store contribution, grooming vs retail, bookings vs avg visit (volume vs ticket size), and the top product and groomer movers. Call this before explaining any rise or dip.",
      inputSchema: z.object({
        month: monthSchema.describe("the period in question"),
        baselineMonth: monthSchema.describe("the period to compare against (e.g. the prior month, or same month last year)"),
      }),
      execute: async ({ month, baselineMonth }) => {
        const [cur, base, curProducts, baseProducts, curTeam, baseTeam] = await Promise.all([
          storeComparison(month as MonthValue),
          storeComparison(baselineMonth as MonthValue),
          getRevenueByService(allowed, month as MonthValue),
          getRevenueByService(allowed, baselineMonth as MonthValue),
          getTeamRoster(allowed, month as MonthValue),
          getTeamRoster(allowed, baselineMonth as MonthValue),
        ]);

        const perStore = ids.map((id) => {
          const c = cur[id], b = base[id];
          return {
            store: id,
            revenue: c.revenue, revenueDelta: c.revenue - b.revenue,
            groomingDelta: c.grooming - b.grooming, retailDelta: c.retail - b.retail,
            bookings: c.bookings, bookingsDelta: c.bookings - b.bookings,
            avgVisit: c.avgTicket, avgVisitDelta: c.avgTicket - b.avgTicket,
          };
        });
        const totalDelta = perStore.reduce((s, r) => s + r.revenueDelta, 0);

        return {
          period: month, baseline: baselineMonth,
          totalRevenueDelta: r0(totalDelta),
          perStore,
          productMovers: movers(curProducts, baseProducts, 6),
          groomerMovers: movers(
            curTeam.map((g) => ({ name: `${g.name} (${g.store})`, value: g.revenue })),
            baseTeam.map((g) => ({ name: `${g.name} (${g.store})`, value: g.revenue })),
            5,
          ),
          note: "Store contributions are measured. WHY a store/groomer/product moved is not in POS data — label causes as hypotheses.",
        };
      },
    }),

    metrics_range: tool({
      description:
        "Per-store metrics for an ARBITRARY date window (both dates inclusive) — use for weeks, trailing 30 days, 'since the 5th', or any period that isn't a calendar month. Data starts 2024-01-01.",
      inputSchema: z.object({
        startDate: dateSchema.describe("first day included, YYYY-MM-DD"),
        endDate: dateSchema.describe("last day included, YYYY-MM-DD"),
      }),
      execute: ({ startDate, endDate }) => rangeMetrics(allowed, startDate, addDays(endDate, 1)),
    }),

    month_pace: tool({
      description:
        "Is the CURRENT month on track? Month-to-date per store, with day-matched windows from the prior month and the same month last year (same number of days, so a partial month doesn't read as a dip). No inputs.",
      inputSchema: z.object({}),
      execute: async () => {
        const today = nyToday();
        const dayOfMonth = Number(today.slice(8, 10));
        const monthStart = `${today.slice(0, 7)}-01`;
        const prevMonthStart = `${addDays(monthStart, -1).slice(0, 7)}-01`;
        const lastYearStart = `${Number(today.slice(0, 4)) - 1}${monthStart.slice(4)}`;
        const [current, priorMonth, lastYear] = await Promise.all([
          rangeMetrics(allowed, monthStart, addDays(today, 1)),
          rangeMetrics(allowed, prevMonthStart, addDays(prevMonthStart, dayOfMonth)),
          rangeMetrics(allowed, lastYearStart, addDays(lastYearStart, dayOfMonth)),
        ]);
        return { daysElapsed: dayOfMonth, monthToDate: current, sameDaysPriorMonth: priorMonth, sameDaysLastYear: lastYear };
      },
    }),

    retention_detail: tool({
      description:
        "Deep retention picture over recorded history: returning share, average visit cadence, one-and-done count, cohort survival curve (% still active N months after first visit), grooming-cycle gap histogram with median days, and the win-back pool size.",
      inputSchema: z.object({}),
      execute: async () => {
        const r = await getRetention(allowed, "all");
        return {
          returningShare: r3(r.returningPct),
          avgCadenceDays: r.cadenceDays,
          oneAndDoneCustomers: r.oneAndDone,
          winbackPool: r.winbackCount,
          cohortPctByMonthOffset: r.cohort,
          groomingCycle: {
            medianDays: r.cycle.medianDays,
            recurringShare: r3(r.cycle.recurringPct),
            histogram: r.cycle.histogram.map((h) => ({ gap: h.label, share: r3(h.value) })),
          },
        };
      },
    }),

    winback_targets: tool({
      description:
        "The actual win-back list: At-risk + Lapsed customers ranked by lifetime value — who to contact first and what they're worth. Dormant (>1yr) customers are excluded by design (too old to win back).",
      inputSchema: z.object({
        top: z.number().int().min(5).max(40).default(15).describe("how many targets"),
      }),
      execute: async ({ top }) => {
        const wb = await getWinbackList(allowed);
        return { poolSize: wb.count, targets: wb.list.slice(0, top).map((c) => ({ name: c.name, store: c.store, lastVisit: c.last, visits: c.visits, ltv: r0(c.ltv), segment: c.segment })) };
      },
    }),

    top_customers: tool({
      description: "Top customers by lifetime value: name, pet, visits, LTV, days since last visit, segment.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await getCustomersByValue(allowed);
        return rows.map((c) => ({ name: c.name, pet: c.pet, store: c.store, visits: c.visits, ltv: r0(c.ltv), daysSinceLastVisit: c.lastVisit, segment: c.segment }));
      },
    }),

    new_vs_repeat: tool({
      description:
        "Revenue split by customer type for a period: repeat customers vs first-time (first visit in recorded history, which starts 2024-01) vs anonymous walk-ins. Answers whether growth comes from acquisition or retention.",
      inputSchema: z.object({ month: monthSchema }),
      execute: async ({ month }) => {
        const r = await getRevenueNewVsRepeat(allowed, month as MonthValue);
        return { repeatRevenue: r.repeat, newCustomerRevenue: r.fresh, walkInRevenue: r.walkIn };
      },
    }),

    business_context: tool({
      description:
        "Look up how the business actually works — operations, pricing, groomer economics/commission, booking paths, the visit flow, retail tactics, customer/dog profiles, store org, or how Woof Gang differs from competitors. Call this for any question whose answer depends on business specifics not in the always-on context. This is qualitative knowledge, not metrics — use the data tools for numbers.",
      inputSchema: z.object({
        section: z
          .enum(BUSINESS_SECTION_KEYS as [string, ...string[]])
          .describe("the section key to retrieve (see the reference list in the system context)"),
      }),
      execute: ({ section }) => {
        const s = getBusinessSection(section);
        if (!s) return { error: `unknown section. Available: ${BUSINESS_SECTIONS.map((b) => b.key).join(", ")}` };
        return { title: s.title, body: s.body };
      },
    }),

    cross_sell: tool({
      description:
        "The cross-sell wall, measured: share of all tickets that are grooming+retail ('both' — the strategic north star), grooming-only, and retail-only, for a period. Use when discussing the everyone-grooms-and-buys-retail goal.",
      inputSchema: z.object({ month: monthSchema }),
      execute: async ({ month }) => {
        const x = await getCrossSell(allowed, month as MonthValue);
        return { bothShare: r3(x.both), groomingOnlyShare: r3(x.groomingOnly), retailOnlyShare: r3(x.retailOnly) };
      },
    }),

    list_actions: tool({
      description:
        "The current action items on the Actions page — suggested, approved, running and completed — with the metric that motivated each. Check this before recommending something, so you don't suggest work already in flight, and use completed actions' results to judge what worked.",
      inputSchema: z.object({}),
      execute: async () => {
        const actions = await getAllAgentActions();
        const allowedLabels = new Set(["All stores", ...allowedIds(allowed).map((id) => stores.find((s) => s.id === id)!.name)]);
        return actions
          .filter((a) => allowedLabels.has(a.store))
          .map((a) => ({ title: a.title, store: a.store, area: a.agent, status: a.status, metric: a.metric, result: a.result ?? null }));
      },
    }),

    events_in_range: tool({
      description:
        "Real-world events logged for the stores — staffing changes, promotions, price changes, closures, marketing pushes, weather — that overlap a date window. Use this to EXPLAIN why a metric moved instead of guessing: find where a number moved (e.g. with decompose_revenue_change), then check what events overlap that period. Returns events for the allowed scope only (a store's own events plus all-stores events).",
      inputSchema: z.object({
        startDate: dateSchema.describe("first day of the window, YYYY-MM-DD"),
        endDate: dateSchema.describe("last day of the window, YYYY-MM-DD"),
      }),
      execute: ({ startDate, endDate }) => getEventsInRange(allowed, startDate, endDate),
    }),
  };
}
