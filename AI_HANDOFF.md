# AI Layer — Agent Handoff (updated 2026-06-15)

> **Canonical reference:** the Obsidian vault doc `03 - Product & Build/AI Layer — urso.ai Analyst.md`
> (in `C:\Users\HSQ05\OneDrive\Desktop\Obby Vault\Urso\`). Read it for the full design, rationale, and
> locked decisions. **This file is the short, current "where we are + how to continue + gotchas"** — kept
> lean on purpose so it doesn't clog context. When you finish a chunk of work, update *both* this file and
> the vault doc.

---

## TL;DR — where we are

`urso.ai` is an embedded data analyst over real FranPOS data, with 3 surfaces (chat, weekly brief, AI actions)
sharing one brain. It's **committed on `main`, runs on Claude Opus 4.8 for real**, and as of 2026-06-15 has a
full **memory layer** (brief/actions build on prior weeks) and **metric-verified learning** (it checks from POS
data whether past actions actually moved their metric). Logic is validated + adversarially reviewed. As of
2026-06-16 the **events / "why" layer is built** (lint+build green) — a `business_events` table + an
`events_in_range` chat tool + events folded into the weekly run + a confounding flag in metric-verified
learning + a self-serve "Events" page. **It needs migration `0020` applied in Supabase before it functions.**
The Home "what to fix first" card and the weekly AI actions are now **memory-aware and Urso-solution-led** — every fix routes to an Urso build (Twilio call tracking, automated rebooking, etc.) and weekly actions carry real `plan_key`s (2026-06-16). Remaining work is deployment (Vercel env).

## Committed vs uncommitted (check `git status` first)

- **Committed** — `2d1456d Added memory to the Ai layer`: action-loop persistence (migration `0019`, server
  actions, `actions-client.tsx`), weekly read-side memory, chat brief-awareness, the `models.ts` Anthropic
  base-URL pin.
- **Uncommitted right now** — `lib/ai/outcomes.ts` (new) + `lib/ai/weekly.ts` (modified) = the
  **metric-verified learning**. Lint + build are green. **First action: commit these two** (branch first if on
  `main`; descriptive message).

## What was built this session (detail lives in the vault §"What changed 2026-06-15")

- **A. Memory layer.** `0019_action_persistence.sql` (`set_action_status` RPC = atomic move + audit, SECURITY
  DEFINER; `action_events` trail; `'dismissed'` status). Server actions in `app/dashboard/actions/actions.ts`.
  `weekly.ts` now reads its own history: `gatherPriorBriefs` (grade last week) + `gatherActionMemory`
  (dedup/no-repeat). Chat is fed the current brief + action queue (`analyst.ts` + chat route).
- **B. Metric-verified learning** (`lib/ai/outcomes.ts`). Maps a completed action → a measurable metric (cited
  metric, else playbook domain; calls/reviews/web → `unverifiable`), compares a **full 28-day window before vs
  after** the completion date, gated on `lag + window + settle` so windows are always full-length AND fully
  counted. **Return rate is right-censored** by the 90-day rebook horizon → needs **118 days** to settle; fast
  metrics (attach/avg-visit/bookings/revenue) settle at **28 days**. Verdicts: `worked` / `backfired` /
  `no_effect` / `no_signal` / `pending` / `unverifiable` / `insufficient_data`, plus a per-playbook scoreboard
  fed into the weekly ranking. **Honest boundary:** confirms the needle MOVED, not that the action CAUSED it.
- **C. Opus base-URL fix** (`lib/ai/models.ts`). A stray ambient `ANTHROPIC_BASE_URL=https://api.anthropic.com`
  (no `/v1`) was 404-ing every Opus call. Pinned via `createAnthropic({ baseURL: AI_ANTHROPIC_BASE_URL ??
  "https://api.anthropic.com/v1" })`. Weekly run now: 5 Opus 4.8 briefs + actions, 0 failures.

## Verification status — important nuance

- ✅ **Logic proven on real data** (synthetic settled action → correct verdict from real FranPOS numbers;
  too-recent → `pending`). Adversarial multi-lens review found 10 real bugs, all fixed + re-validated.
- ⏳ **Not yet seen in a live brief.** With current data **every verdict is `pending`/`unverifiable`** (only
  completed actions are 7-day-old seeds; two are on not-live feeds). Real measured verdicts appear only as
  actions age (~28d fast, ~118d return rate). This is the honest nature of the metrics, **not a gap** — don't
  "fix" it by shortening the windows (that was a real bug the review caught).

## Operational gotchas — READ before touching anything

- **Verification gate:** `npm run lint && npm run build`. **Claude Preview tooling is banned** (Han's rule).
- **Migrations are applied MANUALLY** in the Supabase SQL editor (no CLI, no DB connection string, no
  `config.toml`). `0019` is already applied. New migrations: write the file, then ask Han to run it / paste the
  SQL.
- **Model IDs are real and current** (`claude-opus-4-8`, `gemini-3.5-flash`). Do **not** "correct" them to
  older IDs from training data. If an Anthropic call 404s, check `ANTHROPIC_BASE_URL` in the env, not the model.
- **Read-only DB checks:** hit Supabase REST with `SUPABASE_SECRET_KEY` (service role, bypasses RLS). Parse
  `.env` by **splitting lines + `startsWith`**, NOT a `\s` regex through bash (the `\s` escaping collapses and
  eats the leading `s` of `sb_secret_...`).
- **Running the live app:** `npx next start -p 3939` in the background (needs a build first), poll readiness,
  curl, then kill the port via PowerShell (`Get-NetTCPConnection -LocalPort 3939 ... | Stop-Process`). No
  foreground `sleep`.
- **The weekly cron MUTATES + costs Opus tokens:** `curl ".../api/ai/weekly?secret=$CRON_SECRET"` regenerates
  all 5 briefs and the suggested actions (deletes `status='suggested'`, keeps approved/running/completed/
  dismissed). Don't fire it casually.
- **Han's working style:** make calls and ship, don't present option A/B/C approval gates; be direct; "flawless
  logic" matters — verify against real data + adversarially review before claiming done.

## Next steps (priority order)

1. **Commit** `outcomes.ts` + `weekly.ts` (the only uncommitted work).
2. **Deploy:** add runtime env vars to **Vercel prod** (`GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`,
   `CRON_SECRET`, Supabase/FranPOS/QBO/Twilio/Resend; leave `AI_REPORT_MODEL` unset for Opus). `.env` is
   local-only — the deployed Monday cron has none of it. Redeploy after.
3. ~~**The events / "why" layer**~~ ✅ **BUILT 2026-06-16** (code; lint+build green). `business_events` table
   (typed/scoped/dated: staffing, promo, price_change, closure, marketing, weather, other) + the `events_in_range`
   chat tool + events folded into the weekly run + a **`confounded`** flag in metric-verified learning (an event
   overlapping an action's after-window tempers the credit) + a self-serve **Events** page (owner logs any store,
   manager their own). The honesty rule now lets the AI cite a logged event as a cause instead of hedging.
   **To finish: (a) apply migration `0020` in the Supabase SQL editor, (b) log a couple of real events to test.**
   Until `0020` is applied the layer no-ops safely (reads are best-effort/caught; the Events page itself will
   error until the table exists).
4. **Other roadmap levers** (from the session's plan): use the `action_events` trail more richly; let chat
   *write* a suggested action back into the pipeline (memory is currently read-only for chat); ~~make the Home action-item heuristic memory-aware~~ ✅ DONE 2026-06-16
   (`getTopAction`/`getManagerFocus` skip approved/running/completed/dismissed via `getHandledSolutionKeys`, route every
   fix to an Urso solution, and weekly actions are catalog-bound — new `solution` enum → `plan_key`, fixing the
   missing-plan_key bug); make `business.ts` more **diagnostic** (if-metric-moves-check-these
   patterns mapped to tool names); the **QuickBooks money layer** — pipeline is built but `quickbooks_pnl` holds
   Intuit **sandbox** data (a landscaping demo company), so it's **blocked on connecting Woof Gang's real QBO**,
   then a small read path (`pnl_summary` RPC → `getProfitAndLoss()` → `profit_and_loss` tool).

## Key files (AI layer)

```
lib/ai/models.ts        chat=Gemini, report=Opus 4.8; Anthropic baseURL pinned; key asserts
lib/ai/analyst.ts       chat system prompt (buildSystemPrompt) — defs/voice + injected brief + action queue
lib/ai/business.ts      BUSINESS_CORE (+manifest) · BUSINESS_SECTIONS[] (retrieved) · FULL_BUSINESS_CONTEXT
lib/ai/tools.ts         buildAnalystTools(scope) — 17 scope-locked tools (16 data + business_context); events_in_range added
lib/ai/weekly.ts        gatherWeeklyData + gatherPriorBriefs + gatherActionMemory + runWeekly + WEEKLY_SYSTEM
lib/ai/outcomes.ts      metric-verified learning (gatherVerifiedOutcomes + verifiedOutcomesBlock) + confounding flag  ← NEW
app/api/ai/chat/route.ts    POST — auth, scope, seed + brief + actions, streamText + tools
app/api/ai/weekly/route.ts  GET — CRON_SECRET auth, runWeekly, maxDuration 300
app/dashboard/actions/actions.ts   server actions: approve/dismiss/setActionStatus
components/dashboard/actions-client.tsx   approve/dismiss call server actions (was local useState)
components/dashboard/data.server.ts   getWeeklyBrief overlay; getAllAgentActions; getTopAction/getManagerFocus; getBusinessEvents + getEventsInRange
supabase/migrations/0017_ai_briefs.sql            ai_briefs
supabase/migrations/0019_action_persistence.sql   action_events + set_action_status RPC + 'dismissed'
supabase/migrations/0020_business_events.sql      business_events + create/delete RPCs  ← NEW, APPLY THIS
lib/ai/events.ts          events "why" layer: gatherEvents + eventsOverlapping + eventLabel  ← NEW
app/dashboard/events/*    Events page (page + events-client + actions) — store-scoped  ← NEW
```

## Data facts you'll need

- `metrics_by_store(p_start, p_end)` RPC (p_end **exclusive**) returns per store: `revenue, grooming_revenue,
  retail_revenue, booking_revenue, identified_bookings, bookings, rebooks, retail_attached` (+ `calls_*`/`web_*`
  which are **0 — not live**). This is the workhorse for any window's metrics.
- Metric formulas: return rate = `rebooks/identified_bookings`; attach = `retail_attached/bookings`; avg visit =
  `booking_revenue/bookings`. FranPOS data range: 2024-01-02 → today. Four stores: `wp wg lv wm`.
- Owner = Rubens Campos; pilot = Woof Gang Bakery & Grooming (4 Orlando pet grooming + retail stores).
