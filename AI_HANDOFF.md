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

## What changed 2026-06-17 (this session)

- **General analyst console** — `/dashboard/actions` is now an open-ended urso.ai analyst (replaces the
  static pipeline/agent sections). New `app/api/ai/agent/route.ts` + `components/dashboard/analyst-console.tsx`.
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

## Operational gotchas — READ before touching anything

- **Verification gate:** `npm run lint && npm run build` (from `C:\Dev\Urso.tech`).
- **Model ids are real & current:** `claude-opus-4-8`, `gemini-2.5-flash`. `gemini-3.5-flash` is real but
  currently DOWN (Google 503). Don't "correct" ids to older training-data ones. If an Anthropic call 404s,
  check `ANTHROPIC_BASE_URL` (pinned in `models.ts`), not the model.
- **gemini-3.x flash family is broken for the tool loop** (over-calls, empty answers) even when it's up —
  verify ANY chat-model swap in the FULL tool loop (a 200 ping is not enough), or bump the step budget /
  `@ai-sdk/google` first.
- **Migrations are applied MANUALLY** in the Supabase SQL editor (no CLI). 0017/0019/0020 applied. New ones:
  write the file, ask Han to run it.
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
lib/ai/tools.ts         buildAnalystTools(allowed, cross) — 17 scope-locked tools (16 data + business_context)
lib/ai/weekly.ts        runWeekly + WEEKLY_SYSTEM + memory + events fold-in · lib/ai/outcomes.ts metric-verified learning · lib/ai/events.ts "why" layer
app/api/ai/chat/route.ts    graph chat (gemini-2.5-flash; onError + dev trace)
app/api/ai/agent/route.ts   general console (Opus; onError + dev trace)        ← NEW
components/dashboard/analyst-console.tsx   console UI (full-screen-capable)     ← NEW
components/dashboard/rich-text.tsx         shared answer renderer               ← NEW
components/dashboard/ask-ai.tsx            graph-chat modal (renders via RichText)
app/dashboard/actions/page.tsx             renders AnalystConsole
components/dashboard/data.server.ts        the functions every tool wraps
```

## Data facts you'll need

- `metrics_by_store(p_start, p_end)` RPC (p_end **exclusive**) → per store: `revenue, grooming_revenue,
  retail_revenue, booking_revenue, identified_bookings, bookings, rebooks, retail_attached` (+ `calls_*`/`web_*`
  which are 0 — not live). The workhorse for any window's metrics.
- Metric formulas: return rate = `rebooks/identified_bookings`; attach = `retail_attached/bookings`; avg visit =
  `booking_revenue/bookings`. FranPOS range: 2024-01-02 → today. Four stores: `wp wg lv wm`.
- Owner = Rubens Campos; pilot = Woof Gang Bakery & Grooming (4 Orlando pet grooming + retail stores).
