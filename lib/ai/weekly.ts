// Weekly AI run (Monday cron): writes the brief narrative for every scope and
// regenerates the suggested AI actions. Runs without a user session, so all
// reads/writes go through the service-role client — the same RPCs the
// dashboard uses, called directly. Numbers are computed here and handed to the
// model; the model writes prose and priorities, never arithmetic.

import { generateObject } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportModel, assertReportKey } from "@/lib/ai/models";
import { METRIC_DEFINITIONS } from "@/lib/ai/analyst";
import { BUSINESS_CONTEXT } from "@/lib/ai/business";
import { stores, scopeLabel, type Scope, type StoreId } from "@/components/dashboard/data";

const nyToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Admin = ReturnType<typeof createAdminClient>;

type StoreWeek = {
  store: StoreId; revenue: number; bookings: number; avgVisit: number; returnRate: number | null; retailAttach: number | null;
  prevRevenue: number; prevBookings: number; prevAvgVisit: number; prevReturnRate: number | null; prevRetailAttach: number | null;
};

type WeeklyData = {
  weekStart: string;
  weekEnd: string;
  perStore: StoreWeek[];
  monthlyContext: { store: string; month: string; revenue: number; bookings: number }[];
  productMovers: { name: string; line: string; revenue: number; prevRevenue: number }[];
  groomers: { name: string; store: string; revenue: number; appts: number }[];
  segments: { segment: string; customers: number }[];
};

const r0 = (n: number) => Math.round(n);

type MetricsRow = {
  store_id: StoreId; revenue: number; bookings: number; booking_revenue: number;
  identified_bookings: number; rebooks: number; retail_attached: number;
};

async function metricsByStore(supabase: Admin, start: string, end: string): Promise<Map<StoreId, MetricsRow>> {
  const { data, error } = await supabase.rpc("metrics_by_store", { p_start: start, p_end: end });
  if (error) throw new Error(`metrics_by_store failed: ${error.message}`);
  return new Map(((data ?? []) as MetricsRow[]).map((r) => [r.store_id, r]));
}

export async function gatherWeeklyData(supabase: Admin): Promise<WeeklyData> {
  const today = nyToday();
  const weekStart = addDays(today, -7);
  const prevStart = addDays(today, -14);
  const monthStart = `${today.slice(0, 7)}-01`;
  const threeMonthsAgo = addDays(monthStart, -92).slice(0, 7) + "-01";
  const prevMonthStart = addDays(monthStart, -1).slice(0, 7) + "-01";
  const allIds = stores.map((s) => s.id);

  const [cur, prev, monthly, curProducts, prevProducts, groomers, segs] = await Promise.all([
    metricsByStore(supabase, weekStart, today),
    metricsByStore(supabase, prevStart, weekStart),
    supabase.rpc("metrics_monthly", { p_start: threeMonthsAgo, p_end: today }),
    supabase.rpc("product_revenue_by_name", { p_store_ids: allIds, p_start: monthStart, p_end: today }),
    supabase.rpc("product_revenue_by_name", { p_store_ids: allIds, p_start: prevMonthStart, p_end: monthStart }),
    supabase.rpc("groomer_revenue", { p_store_ids: allIds, p_start: weekStart, p_end: today }),
    supabase.rpc("customer_segment_counts", { p_store_ids: allIds }),
  ]);

  const rate = (r?: MetricsRow) =>
    r && Number(r.identified_bookings) > 0 ? Math.round((Number(r.rebooks) / Number(r.identified_bookings)) * 1000) / 1000 : null;
  const avgVisit = (r?: MetricsRow) => (r && Number(r.bookings) > 0 ? r0(Number(r.booking_revenue) / Number(r.bookings)) : 0);
  const attach = (r?: MetricsRow) =>
    r && Number(r.bookings) > 0 ? Math.round((Number(r.retail_attached) / Number(r.bookings)) * 1000) / 1000 : null;

  const perStore: StoreWeek[] = stores.map((s) => {
    const c = cur.get(s.id), p = prev.get(s.id);
    return {
      store: s.id,
      revenue: r0(Number(c?.revenue ?? 0)), bookings: Number(c?.bookings ?? 0), avgVisit: avgVisit(c), returnRate: rate(c), retailAttach: attach(c),
      prevRevenue: r0(Number(p?.revenue ?? 0)), prevBookings: Number(p?.bookings ?? 0), prevAvgVisit: avgVisit(p), prevReturnRate: rate(p), prevRetailAttach: attach(p),
    };
  });

  type MonthlyRow = { store_id: string; month: string; revenue: number; bookings: number };
  type ProductRow = { name: string; is_service: boolean; revenue: number };
  type GroomerRow = { store_id: StoreId; name: string; revenue: number; appts: number };
  type SegRow = { segment: string; customers: number };

  const prevByName = new Map(((prevProducts.data ?? []) as ProductRow[]).map((p) => [p.name, r0(Number(p.revenue))]));
  const productMovers = ((curProducts.data ?? []) as ProductRow[])
    .map((p) => ({
      name: p.name, line: p.is_service ? "Grooming" : "Retail",
      revenue: r0(Number(p.revenue)), prevRevenue: prevByName.get(p.name) ?? 0,
    }))
    .sort((a, b) => Math.abs(b.revenue - b.prevRevenue) - Math.abs(a.revenue - a.prevRevenue))
    .slice(0, 12);

  return {
    weekStart,
    weekEnd: today,
    perStore,
    monthlyContext: ((monthly.data ?? []) as MonthlyRow[]).map((m) => ({
      store: m.store_id, month: m.month.slice(0, 7), revenue: r0(Number(m.revenue)), bookings: Number(m.bookings),
    })),
    productMovers,
    groomers: ((groomers.data ?? []) as GroomerRow[])
      .map((g) => ({ name: g.name, store: g.store_id, revenue: r0(Number(g.revenue)), appts: Number(g.appts) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15),
    segments: ((segs.data ?? []) as SegRow[]).map((s) => ({ segment: s.segment, customers: Number(s.customers) })),
  };
}

// No hard minimums — a quiet week can honestly have zero wins or risks, and a
// failed validation would kill the scope's brief; the page falls back to the
// template strings for any empty array.
const briefSchema = z.object({
  headline: z.string().describe("One sentence: the week in plain English, leading with revenue direction. No hype."),
  wins: z.array(z.string()).max(4).describe("What moved the right way, one sentence each, with the figure"),
  risks: z.array(z.string()).max(3).describe("What to watch, one sentence each, with the figure"),
  opportunity: z.object({
    title: z.string().describe("The single biggest lever right now, as a short title"),
    detail: z.string().describe("2-3 sentences: the evidence and the operational move"),
  }),
  recommendation: z.string().describe("The one thing worth doing next week, one sentence"),
});

const actionsSchema = z.object({
  actions: z
    .array(
      z.object({
        store: z.enum(["all", "wp", "wg", "lv", "wm"]).describe('"all" if it applies everywhere'),
        agent: z.enum(["Retention", "Team", "Revenue", "Retail", "Call capture", "Reputation"]).describe("which playbook area"),
        title: z.string().describe("imperative, under 10 words"),
        detail: z.string().describe("1-2 sentences: the evidence and the move"),
        metric: z.string().describe('the number that motivated it, e.g. "Return rate 58% (down 4pts)"'),
      }),
    )
    .max(6)
    .describe("Suggested actions ranked by expected impact, most impactful first — aim for 3 to 6"),
});

const WEEKLY_SYSTEM = `You write the Monday morning brief for the owner of Woof Gang Bakery & Grooming.

${BUSINESS_CONTEXT}

${METRIC_DEFINITIONS}

Rules:
- Plain, direct, second person. No hype, no jargon. The owner reads this in two minutes.
- Every claim carries its number, copied exactly from the data provided — never compute new figures or extrapolate.
- Format dollars as "$16,988" (or "$17k" in headlines) and rates as percentages ("0.857" in the data → "86%"). Never show raw unformatted values.
- A week is a small sample: call out a move only if it's large enough to matter (roughly 5%+ on revenue/bookings); otherwise say things held steady.
- Causes you can't see in POS data (weather, a groomer leaving, holidays) are hypotheses — label them as such or leave them out.
- Suggested actions must be operational (outreach, checkout prompts, schedule tweaks) — never pricing, hiring/firing, or anything irreversible. Never promise recovered dollars.
- Phone calls, website funnel and Google reviews are NOT tracked yet — never reference them as data.`;

export async function runWeekly(): Promise<{ briefs: number; actions: number; weekStart: string; failed: string[] }> {
  assertReportKey();
  const supabase = createAdminClient();
  const data = await gatherWeeklyData(supabase);

  const { data: client, error: clientErr } = await supabase.from("clients").select("id").limit(1).single();
  if (clientErr || !client) throw new Error(`clients read failed: ${clientErr?.message ?? "no client row"}`);

  const scopes: Scope[] = ["all", ...stores.map((s) => s.id)];

  // The "all" run also produces the suggested actions; store runs are brief-only.
  const results = await Promise.all(
    scopes.map(async (scope) => {
      const scoped =
        scope === "all"
          ? data
          : {
              ...data,
              perStore: data.perStore.filter((s) => s.store === scope),
              monthlyContext: data.monthlyContext.filter((m) => m.store === scope),
              groomers: data.groomers.filter((g) => g.store === scope),
            };
      try {
        const { object } = await generateObject({
          model: reportModel(),
          schema: scope === "all" ? briefSchema.extend(actionsSchema.shape) : briefSchema,
          system: WEEKLY_SYSTEM,
          prompt:
            `Write the weekly brief for: ${scopeLabel(scope)}.\n` +
            `The week covered is ${data.weekStart} to ${data.weekEnd} (vs the 7 days before it).\n\n` +
            `Data:\n${JSON.stringify(scoped, null, 1)}` +
            (scope === "all" ? "\n\nAlso produce the ranked suggested actions." : ""),
        });
        return { scope, object };
      } catch (e) {
        // One scope failing must not kill the others — its brief just falls
        // back to the template this week.
        return { scope, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  const succeeded = results.filter((r): r is { scope: Scope; object: z.infer<typeof briefSchema> & Partial<z.infer<typeof actionsSchema>> } => "object" in r);
  const failed = results.filter((r) => "error" in r).map((r) => `${r.scope}: ${(r as { error: string }).error}`);

  const modelId = process.env.AI_REPORT_MODEL ?? "claude-opus-4-8";
  const rows = succeeded.map(({ scope, object }) => ({
    client_id: client.id,
    scope,
    week_start: data.weekStart,
    headline: object.headline,
    wins: object.wins,
    risks: object.risks,
    opportunity: object.opportunity,
    recommendation: object.recommendation,
    model: modelId,
  }));
  if (rows.length) {
    const { error: briefErr } = await supabase.from("ai_briefs").upsert(rows);
    if (briefErr) throw new Error(`ai_briefs upsert failed: ${briefErr.message}`);
  }

  // Suggestions are regenerated weekly: anything still "suggested" is replaced
  // (including the original seeds); approved/running/completed rows stay. If
  // the "all" run failed or returned nothing, keep last week's suggestions.
  const actions = succeeded.find((r) => r.scope === "all")?.object.actions ?? [];
  if (!actions.length) return { briefs: rows.length, actions: 0, weekStart: data.weekStart, failed };

  const { error: delErr } = await supabase.from("agent_actions").delete().eq("status", "suggested");
  if (delErr) throw new Error(`agent_actions cleanup failed: ${delErr.message}`);

  const actionRows = actions.map((a) => ({
    client_id: client.id,
    store_id: a.store === "all" ? null : a.store,
    store_label: a.store === "all" ? "All stores" : stores.find((s) => s.id === a.store)!.name,
    agent: a.agent,
    title: a.title,
    detail: a.detail,
    metric: a.metric,
    status: "suggested",
    pending: false,
  }));
  const { error: actErr } = await supabase.from("agent_actions").insert(actionRows);
  if (actErr) throw new Error(`agent_actions insert failed: ${actErr.message}`);

  return { briefs: rows.length, actions: actionRows.length, weekStart: data.weekStart, failed };
}
