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
} from "@/components/dashboard/data.server";
import { stores, type Scope, type StoreId, type MonthValue } from "@/components/dashboard/data";

const monthSchema = z
  .string()
  .regex(/^(all|\d{4}|\d{4}-\d{2})$/, 'use "YYYY-MM", "YYYY", or "all" (trailing 12 months)')
  .describe('Period: "YYYY-MM" for a month, "YYYY" for a year, "all" for the trailing 12 months');

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

export function buildAnalystTools(allowed: Scope) {
  const ids = allowedIds(allowed);

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
      execute: ({ fromMonth, toMonth }) => monthlySeries(allowed, fromMonth, toMonth),
    }),

    store_comparison: tool({
      description: "Side-by-side store metrics for one period (only the stores the user may see).",
      inputSchema: z.object({ month: monthSchema }),
      execute: async ({ month }) => {
        const byStore = await storeComparison(month as MonthValue);
        return ids.map((id) => {
          const m = byStore[id];
          return {
            store: id, name: stores.find((s) => s.id === id)!.name,
            revenue: m.revenue, grooming: m.grooming, retail: m.retail, bookings: m.bookings,
            avgVisit: m.avgTicket, returnRate: r3(m.rebook), retailAttach: r3(m.attach),
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
        "Groomer roster for a period: service revenue performed, appointments, avg ticket, lifetime return rate and retail attach. Null return/attach means too little history.",
      inputSchema: z.object({ month: monthSchema }),
      execute: async ({ month }) => {
        const rows = await getTeamRoster(allowed, month as MonthValue);
        return rows.slice(0, 20).map((g) => ({
          name: g.name, store: g.store, revenue: r0(g.revenue), appts: g.appts,
          avgTicket: r0(g.avgTicket), returnRate: g.rebook != null ? r3(g.rebook) : null,
          retailAttach: g.attach != null ? r3(g.attach) : null,
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
  };
}
