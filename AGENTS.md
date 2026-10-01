<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Dependencies are installed by the startup update script (`npm install`, Node 22). This is the Next.js 16 web app only; the Expo app under `apps/mobile/` is a separate toolchain (its own `package.json`/lockfile) and is not part of the root workspace or `next dev`.

Standard commands live in `package.json` (`dev`, `build`, `lint`, `start`). The documented verification gate is `npm run lint && npm run build` (see `AI_HANDOFF.md`). `lint` currently reports 3 pre-existing warnings in `scripts/verify-qbo-pnl.mjs` (0 errors) — that is the clean baseline.

Non-obvious environment behavior (verified during setup):
- There is NO startup env validation, so `next dev` and `npm run build` both succeed with zero env vars. Missing config only throws at request time on the specific route that needs it.
- With no secrets, these surfaces work fully: the marketing site (`/`, `/how-it-works`, `/capabilities`, `/what-we-find`, `/contact`, `/discovery`, `/reports/*`, `/mf/*`), and the flagship analytics-dashboard showcase at `/demo` (real dashboard UI + charts, invented sample data, no auth).
- Routes that hard-require secrets (throw 500 without them): `/login` and `/dashboard/*` need the Woof Gang Supabase keys (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`); AI chat/analyst needs `GOOGLE_GENERATIVE_AI_API_KEY` (set `AI_AGENT_MODEL=gemini-2.5-flash` / `AI_REPORT_MODEL=gemini-2.5-flash` to avoid needing an Anthropic key); the `/CanesPressure/(app)/*` crew portal needs the Canes Supabase keys even in demo mode (`app/CanesPressure/(app)/layout.tsx` calls the auth client, which throws when `NEXT_PUBLIC_CANES_SUPABASE_URL`/key are absent). Contact/discovery/lead forms POST successfully but the send fails without `RESEND_API` / Supabase.
- Secrets are read from `.env.local` (git-ignored, not committed; no root `.env.example` exists — only `apps/mobile/.env.example`). There are three separate Supabase projects (Woof Gang dashboard, Canes, Urso HQ/Brain), each with its own `NEXT_PUBLIC_*` + secret-key pair.
- No local Supabase/Docker stack. Migrations in `supabase/` are applied MANUALLY against hosted projects (per `AI_HANDOFF.md`); the `brain:*` acceptance/eval scripts in `package.json` need real credentials (or a `SUPABASE_ACCESS_TOKEN`) to run.
