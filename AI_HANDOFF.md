# AI Layer — Agent Handoff (updated 2026-06-17)

> **Canonical reference:** the Obsidian vault doc `03 - Product & Build/AI Layer — urso.ai Analyst.md`
> (in `C:\Users\HSQ05\OneDrive\Desktop\Obby Vault\Urso\`). Read it for the full design, rationale, and
> locked decisions. **This file is the short, current "where we are + how to continue + gotchas."**
> When you finish a chunk of work, update *both* this file and the vault doc.

---

## TL;DR — where we are

`urso.ai` is an embedded data analyst over real, validated FranPOS data, now with **four surfaces** sharing
one brain: the **graph chats** (orange spark buttons), the **weekly brief** (Monday cron, Opus 4.8), the
**AI actions** (same cron), and — new 2026-06-17 — a **general strategy console** on the AI-actions page that
the owner just talks to. Memory layer + metric-verified learning + the events "why" layer are all live
(migrations 0017 / 0019 / 0020 applied). Committed on `main`; pushing to `main` deploys to Vercel prod.

## What changed 2026-06-26 (this session) — ticket-level tool + Money tab fix

Two things: the analyst got a **ticket / line-item tool**, and the **Money tab's open-month render** was fixed.

- **New tool `store_day_tickets` (tool #26).** The analyst can now pull the ACTUAL tickets + line items that
  sold at a store on a day (or ≤7-day window): per-ticket lines (name, qty, line revenue, retail-vs-grooming
  tag, groomer), the time, the customer when known (Walk-in / Unknown otherwise), plus a summary with the
  day's top retail items by revenue (the reorder-cycle signal). Answers "what sold at Windermere yesterday?",
  "what did this customer buy?", "itemize this day" — which the aggregated tools (monthly product rankings,
  daily store totals) physically can't reach. Files:
  - **`supabase/migrations/0025_store_day_lineitems.sql`** — a **SECURITY DEFINER** RPC `store_day_lineitems`
    that reads the RLS-locked raw staging (`franpos_order_items`) and reuses the EXACT iron-rule helpers
    (`franpos_item_is_passthrough` exclude deposits/gift cards · `franpos_item_is_service` retail-vs-service ·
    `franpos_walkin_accounts` TAG anonymous house tickets), so ticket sums reconcile with headline revenue.
    `p_end` is INCLUSIVE (a single day = p_start = p_end — do NOT addDays here, unlike the other range RPCs).
    **⚠️ NEEDS MANUAL APPLY** — this machine's `.env` has the service key but no `SUPABASE_ACCESS_TOKEN`, so
    `node scripts/apply-migration.mjs 0025` can't run here. Apply via the Supabase SQL editor (or with an
    access token). **The app is SAFE until then:** the loader returns null on "function does not exist" and
    the tool replies "ticket-level data isn't available yet (pending deploy)."
  - `getStoreDayLineItems(scope, startDate, endDate)` in `data.server.ts` — groups lines → tickets, resolves
    owner names via the `customers` temp-read table, flags `truncated` at the 1,000-row PostgREST cap and
    drops a possibly-partial last ticket.
  - `store_day_tickets` tool in `lib/ai/tools.ts` — **scope-locked**: an optional `store` arg is validated
    against `crossIds` (owner = any visible store, manager = their store only); default scope = the current
    filter. 7-day window cap, top-30 tickets + summary, rounds dollars, keeps fractional units.
  - Prompt wiring in `analyst.ts` (graph-chat closing + console strategist tool list); types
    `DayTicket`/`DayTicketLine`/`DayTickets` in `data.ts`.
  - **Verified against LIVE data** (service-role probe replicating the RPC): wm 2026-06-25 → 37 tickets,
    $3,801 ($1,708 retail); top baskets were food stock-ups (a $324 ticket of 6× Small Batch pork 5#) —
    exactly the reorder-cycle evidence the tool is meant to surface.
  - This is NOT the deferred "free-text customer-name lookup" — it's day/store-scoped itemization (no
    person-history search), consistent with `top_customers`/`winback_targets` already exposing names.

- **Money / profit tab fix.** Root cause of "the profit tab is not working": the open current month
  (2026-06) has `Total Income = 0` but real expenses in `quickbooks_pnl_totals`, so selecting it rendered a
  misleading **$0 revenue / large net loss**. Fix in `app/dashboard/money/page.tsx`: a `provisionalEmpty`
  guard (`openSelected && overview.revenue === 0`) shows an honest "books still open — income posts after
  expenses; pick a closed month / Last 12 months" notice instead of the numbers. Closed months and the
  default "Last 12 months" view are unaffected (the default already excludes the open month). The data path
  was otherwise sound — `quickbooks_pnl` (5,100 rows) / `quickbooks_pnl_totals` (1,350 rows) are fresh, all
  reads use the service-role admin client, build/lint green.
  - Also hardened `components/dashboard/chart.tsx`: `ResponsiveContainer` now takes a `minHeight` from the
    wrapper's numeric height — kills the Recharts `width(-1)/height(-1)` blank-flash on the trend chart.
    Additive: charts without a numeric style height are unchanged.
  - **NOT an auth problem.** The dev log's `Invalid Refresh Token` is a revoked/cleared session cookie
    (re-login fixes it), not a code bug — the middleware (`updateSession`) already refreshes tokens and writes
    the cookies back. No auth code was changed (would risk breaking working auth).

## What changed 2026-06-17 (this session)

- **General analyst console** — `/dashboard/actions` leads with an open-ended urso.ai analyst as the
  prominent hero (page header + ~72vh frame), with the AI suggested-actions pipeline restored below it —
  both live on the page. New `app/api/ai/agent/route.ts` + `components/dashboard/analyst-console.tsx`.
  Runs on **Opus 4.8** (`agentModel()`), strategist prompt `buildAgentSystemPrompt`, the same scope-locked
  17-tool belt, an 8-step budget, and richer context (seed + full brief + action pipeline). Full-screen
  capable, premium styling. Verified: Opus chains tools, sizes leaks in dollars, and always finalizes with text.
- **Chat model: gemini-3.5-flash → gemini-2.5-flash.** 3.5-flash is unusable two ways — it 503s on Google
  capacity (NOT our rate limit; `503 UNAVAILABLE` while other models return 200 on the same key), and even
  when up the whole gemini-3.x flash family over-calls and exhausts the step budget without writing an answer
  (empty reply), reproduced 3/3 in the full tool loop. Only `gemini-2.5-flash` (GA) is reliable. A health-aware
  fallback (`resolveChatModel` + `isModelHealthy` + `markChatModelDown`) is in `models.ts` but **dormant by
  default** (a 200 ping can't detect the 3.x over-calling failure).
- **Errors unmasked** — chat + agent routes pass `onError` to `toUIMessageStreamResponse` (logs the real
  cause; returns a useful client message); `ask-ai.tsx` shows it instead of a hardcoded "try asking again."
- **Dev trace** — both routes log each step's tool calls/args/results + text via `onStepFinish`/`onFinish`
  (on in dev, or `AI_CHAT_DEBUG=1` in prod).
- **Formatting** — shared `components/dashboard/rich-text.tsx` renders **bold**/*italic*/`code`/bullets in
  ALL chats (fixes literal asterisks). Graph-chat logic unchanged; only presentation.

## What changed 2026-06-17 (b) — console memory + Summerport alias

- **The general console now has MEMORY** (was fully ephemeral). Two layers: **persisted multi-thread
  conversations** (ChatGPT-style — a thread rail with new/select/rename/delete, auto-titled from the first
  message) and a **rolling, distilled long-term memory per user**, injected into every new conversation so the
  analyst recalls durable facts/decisions across threads (the weekly-brief memory idea, applied to chat). New
  `lib/ai/memory.ts` (`getAnalystMemory` · `getOwnedThread` · `persistTurn` + `distillMemory`), new tables in
  **migration `0023_analyst_chat.sql`** (`analyst_threads` / `analyst_messages` / `analyst_memory`), new routes
  `app/api/ai/threads/route.ts` (+`[id]`). `app/api/ai/agent/route.ts` now loads memory → prompt, verifies thread
  ownership, and persists each turn via `toUIMessageStreamResponse({ originalMessages, generateMessageId, onFinish })`.
  Distillation runs every 6 messages on a **cheap model** (`gemini-2.5-flash`, `AI_MEMORY_MODEL`) — numbers are
  NEVER stored (they go stale; tools re-fetch live), only durable qualitative context. **Tables are RLS-on /
  no-policies / server-only via the service-role client, ownership enforced in code** (same as `quickbooks_pnl`).
  **Degrades gracefully: until `0023` is applied the console still works ephemerally** (thread-create fails →
  sends with no threadId → no persistence). **Migrations 0022 + 0023 are now APPLIED** (DB exercised end-to-end:
  insert / idempotent upsert / jsonb round-trip / cascade delete / ordered hydration all pass).

- **Hardening pass (2026-06-17 adversarial review, 14 findings fixed).** A multi-agent review caught real
  runtime bugs lint/build missed; all fixed (code-only, no new migration):
  - **CRITICAL cross-tenant IDOR** — the user-message id was taken from the client and upserted against a global
    PK, so a crafted request could overwrite/steal another user's message row. FIX: the user-message id is now
    **generated server-side** (`generateId()` in `agent/route.ts` onFinish); the client id is never trusted.
  - **Dangling tool-call / un-resumable thread** — a Stopped/step-capped turn persisted a tool-call with no
    result → Anthropic 400 on every later send. FIX: persist a turn **only if it produced final text**, and pass
    `convertToModelMessages(body.messages, { tools, ignoreIncompleteToolCalls: true })` to strip any stored
    dangling calls. This also kills the "stuck reading-the-numbers spinner" + blank-bubble on reload.
  - **Double-send race** created duplicate threads → `sendingRef` synchronous guard in `send`.
  - **Intra-turn ordering** — user+assistant shared one `now()` timestamp → `persistTurn` now stamps distinct
    `created_at` (user, user+1ms) so hydration order is deterministic.
  - **Delete active thread mid-stream** → `deleteThread` now `chat.stop()`s a live stream first.
  - **Distill blocking** → bounded with `AbortSignal.timeout(20s)` + a fast Google-key skip.
  - The "reading the numbers" label is now gated on `status==="streaming" && last message` (hydrated turns show a
    neutral note). Known low: a thread's scope can drift if the owner changes the dashboard filter mid-thread.
- **Console hard-requires an agent key.** Locally `ANTHROPIC_API_KEY` is absent, so the console defaulted to Opus
  → 503. Added **`AI_AGENT_MODEL=gemini-2.5-flash` to `.env.local`** (runs on the Google key locally); prod leaves
  it unset → Opus. Without one of these the console 503s `assertAgentKey`.
- **Summerport alias.** The Windermere (`wm`) store is also called **Summerport** — wired into both analyst
  prompts + `business.ts` (stores-and-org) + the `stores` constant (`aliases: ["Summerport"]`), and **migration
  `0022_store_aliases.sql`** (adds `stores.aliases text[]`). The AI reads store names from the prompts/constant,
  NOT the DB `stores.name`, so the prompt edits are what make "how's Summerport doing?" resolve to `wm`.
- **Migration numbering:** the old `0020` collision is resolved — the QBO totals migration was renumbered to
  `0021_quickbooks_pnl_totals.sql` (was `0020_…`, which clashed with `0020_business_events.sql`). The table name
  (`quickbooks_pnl_totals`) is unchanged and the migration is `CREATE TABLE IF NOT EXISTS`, so the rename is
  file-only — no DB re-apply needed. `0022_store_aliases.sql` + `0023_analyst_chat.sql` follow.
- **`npm install` was needed** — `resend` + `@react-email/components` were in `package.json` but missing from
  `node_modules`, breaking `npm run build` in the cron-email path (nothing to do with the AI work). Installed.

## Operational gotchas — READ before touching anything

- **Verification gate:** `npm run lint && npm run build` (from `C:\Dev\Urso.tech`).
- **Model ids are real & current:** `claude-opus-4-8`, `gemini-2.5-flash`. `gemini-3.5-flash` is real but
  currently DOWN (Google 503). Don't "correct" ids to older training-data ones. If an Anthropic call 404s,
  check `ANTHROPIC_BASE_URL` (pinned in `models.ts`), not the model.
- **gemini-3.x flash family is broken for the tool loop** (over-calls, empty answers) even when it's up —
  verify ANY chat-model swap in the FULL tool loop (a 200 ping is not enough), or bump the step budget /
  `@ai-sdk/google` first.
- **Migrations are applied MANUALLY** in the Supabase SQL editor (no CLI). 0017/0019/0020/**0022/0023 applied**.
  New ones: write the file, ask Han to run it.
- **Read-only DB checks:** hit Supabase REST with `SUPABASE_SECRET_KEY` (service role). Parse `.env` by
  splitting lines + `startsWith`, NOT a `\s` regex through bash (it eats the leading `s` of `sb_secret_…`).
- **The weekly cron MUTATES + costs Opus tokens** (`/api/ai/weekly?secret=$CRON_SECRET`) — don't fire casually.
- **The console costs Opus tokens per message.** Set `AI_AGENT_MODEL=gemini-2.5-flash` to make it cheap/fast.
- **Han's style:** make calls and ship; be direct; verify against real data before claiming done.

## Remaining (priority order)

1. **Connect the sample feeds** — calls (Twilio), web funnel (GA4), reviews (GBP) are sample data the AI
   refuses to treat as real; wiring each live (+ its tools) is the biggest data-completeness lever.
2. **Real QuickBooks** — `quickbooks_pnl` holds Intuit sandbox data; blocked on connecting Woof Gang's real QBO.
3. **Auth hardening** — replace the temp `using(true)` public-read RLS on `ai_briefs` / `agent_actions` /
   `action_events` / `business_events` before multi-tenant.
4. **(Optional) gemini-3.x flash for the chat** — only after a full-tool-loop re-verify or a step-budget / SDK bump.

## Key files (AI layer) — full map in the vault doc §11

```
lib/ai/models.ts        resolveChatModel (chat=2.5-flash + health fallback) · agentModel (console=Opus) · reportModel (weekly=Opus) · key asserts
lib/ai/analyst.ts       buildSystemPrompt (graph chats) + buildAgentSystemPrompt (console) — share METRIC_DEFINITIONS, DATA_SOURCES, VOICE
lib/ai/tools.ts         buildAnalystTools(allowed, cross) — 18 scope-locked tools (17 data + business_context); store_comparison_range = all stores over an arbitrary date window (cross scope)
lib/ai/weekly.ts        runWeekly + WEEKLY_SYSTEM + memory + events fold-in · lib/ai/outcomes.ts metric-verified learning · lib/ai/events.ts "why" layer
lib/ai/memory.ts        console memory — getAnalystMemory · getOwnedThread · persistTurn + distillMemory (gemini-2.5-flash)   ← NEW
app/api/ai/chat/route.ts    graph chat (gemini-2.5-flash; onError + dev trace)
app/api/ai/agent/route.ts   general console (Opus; loads memory + persists turns; onError + dev trace)
app/api/ai/threads/route.ts + [id]/route.ts   thread list/create + messages/rename/delete (user-scoped)   ← NEW
components/dashboard/analyst-console.tsx   console UI — thread rail + persistence + full-screen-capable
components/dashboard/rich-text.tsx         shared answer renderer               ← NEW
components/dashboard/ask-ai.tsx            graph-chat modal (renders via RichText)
app/dashboard/actions/page.tsx             renders ActionsClient (suggested-actions pipeline) + AnalystConsole
components/dashboard/data.server.ts        the functions every tool wraps
```

## Data facts you'll need

- `metrics_by_store(p_start, p_end)` RPC (p_end **exclusive**) → per store: `revenue, grooming_revenue,
  retail_revenue, booking_revenue, identified_bookings, bookings, rebooks, retail_attached` (+ `calls_*`/`web_*`
  which are 0 — not live). The workhorse for any window's metrics.
- Metric formulas: return rate = `rebooks/identified_bookings`; attach = `retail_attached/bookings`; avg visit =
  `booking_revenue/bookings`. FranPOS range: 2024-01-02 → today. Four stores: `wp wg lv wm`.
- Owner = Rubens Campos; pilot = Woof Gang Bakery & Grooming (4 Orlando pet grooming + retail stores).
