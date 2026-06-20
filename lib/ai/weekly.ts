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
import { FULL_BUSINESS_CONTEXT } from "@/lib/ai/business";
import { gatherVerifiedOutcomes, verifiedOutcomesBlock } from "@/lib/ai/outcomes";
import { gatherEvents, eventLabel, type EventRecord } from "@/lib/ai/events";
import { getCostSpikes } from "@/components/dashboard/data.server";
import { stores, scopeLabel, actionPlans, SOLUTION_KEYS, type Scope, type StoreId, type CostSpike } from "@/components/dashboard/data";

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

// ── Memory: what the system said and did last time ──────────────────────────
// The generator reads its own history so each week builds on the last — it can
// grade last week's recommendation and won't re-pitch work that's already in
// motion or that the owner dismissed. Numbers still come from the metrics above;
// this is the qualitative continuity layer.

type PriorBrief = { headline: string; recommendation: string; opportunityTitle: string | null };

// Newest brief strictly BEFORE this run's week, per scope. lt(week_start)
// tolerates skipped weeks — it grabs the most recent prior brief, not exactly 7
// days back. Runs before this week's upsert, so it never reads the row we're
// about to write.
async function gatherPriorBriefs(supabase: Admin, weekStart: string): Promise<Map<string, PriorBrief>> {
  const { data, error } = await supabase
    .from("ai_briefs")
    .select("scope, headline, recommendation, opportunity, week_start")
    .lt("week_start", weekStart)
    .order("week_start", { ascending: false });
  if (error) throw new Error(`ai_briefs history read failed: ${error.message}`);
  const map = new Map<string, PriorBrief>();
  for (const row of (data ?? []) as { scope: string; headline: string; recommendation: string; opportunity: { title?: string } | null }[]) {
    if (!map.has(row.scope)) {
      map.set(row.scope, { headline: row.headline, recommendation: row.recommendation, opportunityTitle: row.opportunity?.title ?? null });
    }
  }
  return map;
}

type ActionMemo = { title: string; agent: string; store: string; result: string | null };
type ActionMemory = { active: ActionMemo[]; completed: ActionMemo[]; dismissed: ActionMemo[] };

// Actions that survive the weekly suggested-row wipe: in-flight (approved /
// running), completed (with results, to learn from), and recently dismissed.
async function gatherActionMemory(supabase: Admin): Promise<ActionMemory> {
  const { data, error } = await supabase
    .from("agent_actions")
    .select("title, agent, store_label, status, result, updated_at")
    .in("status", ["approved", "running", "completed", "dismissed"]);
  if (error) throw new Error(`agent_actions history read failed: ${error.message}`);
  const rows = (data ?? []) as { title: string; agent: string; store_label: string; status: string; result: string | null; updated_at: string }[];
  const dismissedCutoff = addDays(nyToday(), -45); // don't suppress old dismissals forever
  const memo = (r: (typeof rows)[number]): ActionMemo => ({ title: r.title, agent: r.agent, store: r.store_label, result: r.result });
  return {
    active: rows.filter((r) => r.status === "approved" || r.status === "running").map(memo).slice(0, 20),
    completed: rows.filter((r) => r.status === "completed").map(memo).slice(0, 12),
    dismissed: rows.filter((r) => r.status === "dismissed" && r.updated_at.slice(0, 10) >= dismissedCutoff).map(memo).slice(0, 12),
  };
}

// Prompt fragment: last week's brief for this scope, asked to be graded in a clause.
const priorBriefBlock = (scope: Scope, prior: PriorBrief | undefined): string =>
  prior
    ? `\n\nLast week's brief for ${scopeLabel(scope)} — say in one clause whether it played out (you have this week's vs last week's numbers):\n` +
      `- Headline: ${prior.headline}\n- You recommended: ${prior.recommendation}` +
      (prior.opportunityTitle ? `\n- Biggest lever you named: ${prior.opportunityTitle}` : "")
    : "";

// Prompt fragment: action history — only added to the "all" run, which makes the actions.
function actionMemoryBlock(mem: ActionMemory): string {
  const fmt = (a: ActionMemo) => `- "${a.title}" (${a.agent} · ${a.store})`;
  const parts: string[] = [];
  if (mem.active.length) parts.push(`Already in motion — do NOT suggest these again:\n${mem.active.map(fmt).join("\n")}`);
  if (mem.dismissed.length) parts.push(`Recently dismissed by the owner — do NOT suggest these again:\n${mem.dismissed.map(fmt).join("\n")}`);
  if (mem.completed.length) parts.push(`Already completed — do NOT re-suggest these:\n${mem.completed.map(fmt).join("\n")}`);
  return parts.length ? `\n\n--- What you've already suggested ---\n${parts.join("\n\n")}` : "";
}

// Prompt fragment: real-world events overlapping the week, so the brief can
// explain moves instead of hypothesizing. Added to every scope's prompt.
function eventsBlock(events: EventRecord[]): string {
  if (!events.length) return "";
  return (
    `\n\n--- Logged real-world events overlapping this week (use these to explain moves; don't just relist them) ---\n` +
    events.map((e) => `- ${eventLabel(e)}${e.detail ? ` — ${e.detail}` : ""}`).join("\n")
  );
}

// Prompt fragment: QuickBooks expense categories that jumped month-over-month, so
// the brief can flag a real cost risk (live accrual data, not POS).
function costSpikesBlock(spikes: CostSpike[]): string {
  if (!spikes.length) return "";
  return (
    `\n\n--- Cost alerts (QuickBooks: month-over-month jumps in expense categories, two most recent closed months) ---\n` +
    spikes.map((s) => `- ${s.category}: $${Math.round(s.prevAmount).toLocaleString("en-US")} → $${Math.round(s.curAmount).toLocaleString("en-US")} (+${Math.round(s.pctJump * 100)}%)`).join("\n") +
    `\nIf a jump is material, flag it as a risk with the numbers; a logged event may explain it.`
  );
}

// Normalized title for code-level dedup (belt-and-suspenders to the prompt rule).
const normTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// The Urso solutions catalog, handed to the model so every suggested action maps
// to a real Urso build (its plan_key) — never a generic "tell staff to do X".
function solutionsCatalogBlock(): string {
  const lines = SOLUTION_KEYS.map((k) => `- ${k}: ${actionPlans[k].system} — ${actionPlans[k].proposal}`).join("\n");
  return `\n\n--- Urso solutions catalog (pick the "solution" key for each suggested action) ---\n${lines}`;
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
        solution: z.enum(SOLUTION_KEYS as [string, ...string[]]).describe("the Urso solution that implements this fix — pick the matching key from the catalog below"),
        title: z.string().describe('imperative, the Urso build, under 10 words (e.g. "Set up automated rebooking reminders")'),
        detail: z.string().describe("1-2 sentences: the evidence and what Urso ships"),
        metric: z.string().describe('the number that motivated it, e.g. "Return rate 58% (down 4pts)"'),
      }),
    )
    .max(6)
    .describe("Suggested actions ranked by expected impact, most impactful first — aim for 3 to 6"),
});

const WEEKLY_SYSTEM = `You write the Monday morning brief for the owner of Woof Gang Bakery & Grooming.

${FULL_BUSINESS_CONTEXT}

${METRIC_DEFINITIONS}

Rules:
- Plain, direct, second person. No hype, no jargon. The owner reads this in two minutes.
- Every claim carries its number, copied exactly from the data provided — never compute new figures or extrapolate.
- Format dollars as "$16,988" (or "$17k" in headlines) and rates as percentages ("0.857" in the data → "86%"). Never show raw unformatted values.
- A week is a small sample: call out a move only if it's large enough to matter (roughly 5%+ on revenue/bookings); otherwise say things held steady.
- Causes you can't see in POS data are hypotheses — label them as such or leave them out. BUT if a logged real-world event (listed below, when present) overlaps a move, cite it as the likely cause instead of hypothesizing (e.g. "grooming dipped because a groomer's been on leave since May 3").
- Every suggested action is an Urso solution we implement WITH the owner — pick the matching "solution" key from the Urso solutions catalog (listed below). Title it as the Urso build (e.g. "Set up automated rebooking reminders"); the detail is the evidence + what Urso ships. Never pricing, hiring/firing, or anything irreversible; never promise recovered dollars.
- The brief's biggest-lever and recommendation should point to the Urso solution that addresses it, not generic advice.
- Phone calls, website funnel and Google reviews are NOT tracked yet — never reference them as data.
- A "Cost alerts" section (when present) lists QuickBooks expense categories that jumped month-over-month — costs ARE live now. If a jump is material, surface it as a risk with the exact numbers (and note if a logged event explains it); never invent cost figures beyond what's listed.

Memory & continuity:
- If last week's brief is provided, open by briefly noting whether last week's recommendation played out — compare this week's numbers to last week's. One clause, then move on; don't force it if nothing's comparable.
- Never suggest an action that duplicates one already in motion or one the owner recently dismissed (both are listed for you) — propose something new instead.
- Rank actions by MEASURED results: a "Measured results of past actions" section may show, from POS data, which completed actions actually moved their target metric. Favor playbook areas with measured wins; ease off ones that showed no measurable effect; and if a past action reads "no signal — may not have been done," that lever is still open — propose a fresh, differently-worded action for it, not a copy of the completed one. Don't re-pitch a dismissed idea.
- Never imply a past action recovered revenue unless its metric measurably moved.
- If a measured past result is flagged "confounded" (a logged event overlapped its window), treat it as weak evidence — the event may explain the move rather than the action.`;

export async function runWeekly(): Promise<{ briefs: number; actions: number; weekStart: string; failed: string[] }> {
  assertReportKey();
  const supabase = createAdminClient();
  const data = await gatherWeeklyData(supabase);
  const [priorBriefs, actionMemory, verifiedOutcomes, weekEvents] = await Promise.all([
    gatherPriorBriefs(supabase, data.weekStart),
    gatherActionMemory(supabase),
    // Verification is an enhancement — a failure must not lose the whole run.
    gatherVerifiedOutcomes(supabase, data.weekEnd).catch((e) => {
      console.warn(`[weekly] verified outcomes failed: ${e instanceof Error ? e.message : e}`);
      return [];
    }),
    // Events are an enhancement too (table may not exist pre-migration) — never
    // let a failure lose the run.
    gatherEvents(supabase, data.weekStart, data.weekEnd).catch((e) => {
      console.warn(`[weekly] events read failed: ${e instanceof Error ? e.message : e}`);
      return [] as EventRecord[];
    }),
  ]);

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
      const scopedEvents = scope === "all" ? weekEvents : weekEvents.filter((e) => e.storeId === scope || e.storeId === null);
      const scopedSpikes = await getCostSpikes(scope).catch(() => [] as CostSpike[]);
      try {
        const { object } = await generateObject({
          model: reportModel(),
          schema: scope === "all" ? briefSchema.extend(actionsSchema.shape) : briefSchema,
          system: WEEKLY_SYSTEM,
          prompt:
            `Write the weekly brief for: ${scopeLabel(scope)}.\n` +
            `The week covered is ${data.weekStart} to ${data.weekEnd} (vs the 7 days before it).` +
            priorBriefBlock(scope, priorBriefs.get(scope)) +
            `\n\nData:\n${JSON.stringify(scoped, null, 1)}` +
            eventsBlock(scopedEvents) +
            costSpikesBlock(scopedSpikes) +
            (scope === "all"
              ? `${actionMemoryBlock(actionMemory)}${verifiedOutcomesBlock(verifiedOutcomes)}${solutionsCatalogBlock()}\n\nAlso produce the ranked suggested actions.`
              : ""),
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
  const rawActions = succeeded.find((r) => r.scope === "all")?.object.actions ?? [];

  // Dedup safety net: drop any suggestion duplicating work already in motion,
  // completed, or recently dismissed. The prompt asks for this; this enforces it
  // even if the model slips.
  const taken = new Set(
    [...actionMemory.active, ...actionMemory.completed, ...actionMemory.dismissed].map((a) => normTitle(a.title)),
  );
  const actions = rawActions.filter((a) => !taken.has(normTitle(a.title)));
  const droppedDup = rawActions.length - actions.length;
  if (droppedDup > 0) console.warn(`[weekly] dropped ${droppedDup} duplicate suggestion(s) already in-flight/dismissed`);

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
    plan_key: a.solution,
    status: "suggested",
    pending: false,
  }));
  const { error: actErr } = await supabase.from("agent_actions").insert(actionRows);
  if (actErr) throw new Error(`agent_actions insert failed: ${actErr.message}`);

  return { briefs: rows.length, actions: actionRows.length, weekStart: data.weekStart, failed };
}
