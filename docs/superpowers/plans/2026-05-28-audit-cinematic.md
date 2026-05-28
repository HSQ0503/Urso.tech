# Audit Cinematic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 25-second slider-triggered cinematic on `/book-an-audit` plus the static landing page beneath it (per the content brief Han provided in chat), wired to the existing homepage slider.

**Architecture:** Module-level flag (`armIntro` / `consumeIntro`) set by the homepage slider, consumed once by an `AuditPageGate` client component on the audit route. When armed, gate renders an `<AuditCinematic>` fixed overlay over the always-mounted static page. A single `useMasterClock` hook drives a declarative `TIMELINE` of scene beats; each beat is a React component that mounts/unmounts based on master progress. Camera-pull-back handoff at the end shrinks the cinematic toward the static page's hero CTA.

**Tech Stack:** Next.js 16 App Router (no `tailwind.config.js` — Tailwind v4 with `@theme` in `globals.css`), React 19 client components, `requestAnimationFrame` for the master clock, pure CSS keyframes for scene animations, zero new runtime dependencies.

**Reference spec:** `docs/superpowers/specs/2026-05-28-audit-cinematic-design.md` — the single source of truth for choreography, timing, visual treatment, and edge cases.

---

## File structure

### New files (cinematic)

```
lib/
  intro-state.ts                        ← armIntro / consumeIntro module-level flag

components/audit-cinematic/
  index.tsx                             ← <AuditCinematic> — master orchestrator
  audit-page-gate.tsx                   ← <AuditPageGate> — reads consumeIntro, mounts cinematic
  timeline.ts                           ← TIMELINE constant + Beat types
  use-master-clock.ts                   ← useMasterClock hook (rAF + pause/resume)
  cinematic.css                         ← all keyframes specific to the cinematic
  ui/
    act-tag.tsx                         ← top-left "Act 01 · Problem"
    timer.tsx                           ← top-right "00:14"
    skip-control.tsx                    ← bottom-right "esc · skip"
    intro-card.tsx                      ← reusable card primitive
  scenes/
    establish-scene.tsx                 ← Act 1 cursor + first chrome fade-in
    card-scene.tsx                      ← Act 1 cards (wraps IntroCard)
    tagline-scene.tsx                   ← Act 1 tagline beat
    collapse-scene.tsx                  ← Act 2 FLIP cards → grid cells
    grid-scene.tsx                      ← Act 2 8×6 grid hold
    grid-overlay-scene.tsx              ← Act 2 "best/worst" overlay
    process-step-scene.tsx              ← Act 3 three sub-beats
    leak-card-scene.tsx                 ← Act 3 single big card
    silence-scene.tsx                   ← Act 4 dot/line/cta phases
    handoff-scene.tsx                   ← Act 4 camera-pull-back
```

### New files (static page)

```
app/api/request-audit/
  route.ts                              ← form POST handler (stubbed; Resend code commented in)

components/audit-page/
  hero.tsx                              ← Section A
  problem.tsx                           ← Section B
  process.tsx                           ← Section C (three steps)
  deliverables.tsx                      ← Section D (two artifacts)
  who-its-for.tsx                       ← Section E (one line)
  form.tsx                              ← Section F (client component, form state)
```

### Modified files

```
app/book-an-audit/page.tsx              ← replace 26-line placeholder with real page
components/hero/slide-to-book.tsx       ← add armIntro() call before fireWipe
components/audit-cta.tsx                ← gut embedded funnel, replace with single "Request an audit" button linking to /book-an-audit
```

### Files deleted

```
components/audit-cta/slide-to-confirm.tsx   ← old slider-to-confirm, no longer used
components/audit-cta/stepper.tsx            ← old multi-step indicator, no longer used
```

---

## Conventions for this plan

- **Dev server stays running across tasks.** Start with `npm run dev` once; Next.js HMR picks up changes.
- **Verify visually in browser** after each task. The "expected" outcomes describe what to look for on screen.
- **Commit after every task.** Small commits make rollback easy if a beat doesn't feel right.
- **No tests are written.** The project has no test framework (only `next` / `react` / `react-dom` / `ogl`). Per the spec §12, the test plan is manual. Adding a test framework for one feature is out of scope.
- **Run `npm run lint && npm run build` before the final commit** of each task that touches a new file to catch type errors.
- **All client components must start with `"use client";`** (Next.js App Router requirement). Server components must NOT.
- **Tailwind v4 is CSS-first.** No `tailwind.config.js`. Tokens live in `app/globals.css` `@theme {}`. Cinematic keyframes go in a new `cinematic.css` imported from the cinematic component (NOT in `globals.css` — keeps the marketing CSS lean).

---

## Task 1: Module-level intro state

**Files:**
- Create: `lib/intro-state.ts`

- [ ] **Step 1: Create the module**

Create `lib/intro-state.ts`:

```ts
// Module-level flag set by the homepage slider just before it navigates
// to /book-an-audit, consumed once by AuditPageGate on mount.
// Lives in the same JS context across client-side navigation, so it
// survives router.push but resets on full page reload (intentional).

let pendingIntro = false;

export function armIntro() {
  pendingIntro = true;
}

export function consumeIntro() {
  const was = pendingIntro;
  pendingIntro = false;
  return was;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/intro-state.ts
git commit -m "Add module-level intro arm/consume flag"
```

---

## Task 2: Wire armIntro into the homepage slider

**Files:**
- Modify: `components/hero/slide-to-book.tsx` (the existing `fireWipe` function)

- [ ] **Step 1: Add the import**

In `components/hero/slide-to-book.tsx`, add to the imports at the top (next to the existing `triggerWipe` import):

```ts
import { armIntro } from "@/lib/intro-state";
```

- [ ] **Step 2: Call armIntro at the top of fireWipe**

In the same file, modify `fireWipe`. Currently it starts with `const isMobile = ...`. Add the `armIntro()` call as the first line:

```ts
const fireWipe = () => {
  armIntro();
  const isMobile = window.matchMedia("(max-width: 767px)").matches;
  // ... rest unchanged
};
```

Also add `armIntro()` to the keyboard path inside `onKeyDown`. Find this block:

```ts
onKeyDown={(e) => {
  if (confirmed) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    setConfirmed(true);
    setDrag(max);
    fireWipe();
  }
}}
```

It's already calling `fireWipe()` which now arms — so nothing more to change there. The pointer-drag completion path also goes through `fireWipe()` (`onPointerMove` line that calls it on `next >= s.max - 1`). All three entry points now arm correctly.

- [ ] **Step 3: Verify in browser**

Run dev server (`npm run dev`) if not running. Open `http://localhost:3000`. Slide the hero slider. The wipe should still play and land on the (still placeholder) `/book-an-audit` page exactly as before — `armIntro` has no visible effect yet because nothing reads it. We're confirming we haven't broken the existing slider.

- [ ] **Step 4: Commit**

```bash
git add components/hero/slide-to-book.tsx
git commit -m "Arm intro flag from homepage slider before wipe"
```

---

## Task 3: Static page — hero section

The static page Han wants is described in his content brief (chat). We're building the six sections (A–F) first so there's a real destination, *then* adding the cinematic on top.

**Files:**
- Create: `components/audit-page/hero.tsx`

- [ ] **Step 1: Create the hero**

Create `components/audit-page/hero.tsx`:

```tsx
import Link from "next/link";
import { ArrowRight } from "@/components/ui/arrow-right";

export function AuditHero() {
  return (
    <section className="relative px-5 pb-16 pt-24 text-center sm:px-8 sm:pb-20 sm:pt-32 md:px-14 md:pb-24 md:pt-36">
      <Link
        href="/"
        className="absolute left-5 top-5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dimmer transition-colors hover:text-ink-dim sm:left-8 sm:top-8"
      >
        ← back
      </Link>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[800px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(ellipse, rgba(254,81,0,0.07), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[920px]">
        <h1 className="text-[clamp(44px,11vw,96px)] font-medium leading-[0.95] tracking-[-0.045em]">
          You can&apos;t fix
          <br />
          what you can&apos;t see<span className="text-orange">.</span>
        </h1>
        <p className="mx-auto mt-7 max-w-[640px] text-[16px] leading-[1.5] tracking-[-0.005em] text-ink-dim sm:mt-9 sm:text-[19px]">
          Your business runs across six logins and a gut feeling. The leaks
          that cost you most don&apos;t show up in any of them. An Urso audit
          pulls every store into one view and shows you exactly where the
          money&apos;s walking out.
        </p>
        <div className="mt-9 flex justify-center sm:mt-12">
          <a
            href="#request-an-audit"
            data-audit-hero-cta
            className="group inline-flex items-center gap-2 rounded-lg border border-transparent bg-orange px-[22px] py-[14px] font-sans text-[15px] font-medium tracking-[-0.005em] text-white shadow-[0_8px_28px_rgba(254,81,0,0.35)] transition-[filter,box-shadow] hover:brightness-110"
          >
            Request an audit
            <ArrowRight />
          </a>
        </div>
      </div>
    </section>
  );
}
```

Note: `data-audit-hero-cta` is a hook used later by the handoff scene to measure the CTA position. Keep it on whatever element gets the camera-pull-back target.

- [ ] **Step 2: Wire it into the page**

Replace `app/book-an-audit/page.tsx` with:

```tsx
import { AuditHero } from "@/components/audit-page/hero";

export default function BookAnAuditPage() {
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <AuditHero />
    </main>
  );
}
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:3000/book-an-audit`. You should see the new hero — black background, big headline "You can't fix what you can't see.", subhead, and an orange "Request an audit" button. Clicking the button does nothing yet (the `#request-an-audit` anchor doesn't exist; that's fine for now).

- [ ] **Step 4: Commit**

```bash
git add app/book-an-audit/page.tsx components/audit-page/hero.tsx
git commit -m "Build /book-an-audit hero section"
```

---

## Task 4: Static page — problem + process sections

**Files:**
- Create: `components/audit-page/problem.tsx`
- Create: `components/audit-page/process.tsx`
- Modify: `app/book-an-audit/page.tsx`

- [ ] **Step 1: Create the problem section**

Create `components/audit-page/problem.tsx`:

```tsx
import { Pill } from "@/components/ui/pill";

export function AuditProblem() {
  return (
    <section className="relative border-t border-edge bg-bg px-5 py-20 text-ink sm:px-8 sm:py-24 md:px-14">
      <div className="mx-auto max-w-[820px]">
        <Pill>The problem</Pill>
        <h2 className="mt-5 text-[clamp(34px,7.5vw,60px)] font-medium leading-[1.05] tracking-[-0.035em] sm:mt-6">
          The most expensive leaks are the ones
          <br className="hidden md:block" />{" "}
          <span className="text-ink-dim">you can&apos;t see</span>
          <span className="text-orange">.</span>
        </h2>
        <div className="mt-8 grid gap-6 text-[16px] leading-[1.55] tracking-[-0.005em] text-ink-dim sm:mt-10 sm:text-[17px]">
          <p>
            The after-hours calls nobody answers. The one-star reviews on a
            profile you don&apos;t control. The booking flow you&apos;ve never
            walked as a customer. None of it shows up in your POS, and none of
            it shows up in your books — so it keeps costing you, quietly,
            every week.
          </p>
          <p>
            And the gap you feel but can&apos;t explain: your best store and
            your worst store are running different businesses. The audit
            makes all of it visible — in your numbers, not a benchmark.
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create the process section**

Create `components/audit-page/process.tsx`:

```tsx
import { Pill } from "@/components/ui/pill";

const steps: Array<{
  n: string;
  title: string;
  body: string;
}> = [
  {
    n: "01",
    title: "We dig before we talk.",
    body: "By our first real call, we've already walked your stores as a customer — ranked your listings, tested your phones after hours, read every review. We show up knowing things about your business. Most vendors show up with questions.",
  },
  {
    n: "02",
    title: "We stand up your operating system.",
    body: "Your POS, Google, books, and calls — wired into one live dashboard, in weeks, not months. You log in and watch your own business surface itself. Observation only; we change nothing yet.",
  },
  {
    n: "03",
    title: "We hand you the one fix worth making.",
    body: "Not a deck of twelve. One leak, what it's costing you in dollars, the fix in plain language, and exactly how we'll measure whether it worked.",
  },
];

export function AuditProcess() {
  return (
    <section className="relative border-t border-edge bg-bg px-5 py-20 text-ink sm:px-8 sm:py-24 md:px-14">
      <div className="mx-auto max-w-[1100px]">
        <div className="max-w-[640px]">
          <Pill>What we do</Pill>
          <h2 className="mt-5 text-[clamp(34px,7.5vw,60px)] font-medium leading-[1.05] tracking-[-0.035em] sm:mt-6">
            Three beats<span className="text-orange">.</span>
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-edge bg-edge md:mt-14 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="bg-bg p-7 sm:p-9">
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-orange">
                {s.n}
              </div>
              <h3 className="mt-5 text-[20px] font-medium leading-[1.2] tracking-[-0.015em] sm:text-[22px]">
                {s.title}
              </h3>
              <p className="mt-4 text-[14px] leading-[1.55] tracking-[-0.005em] text-ink-dim sm:text-[15px]">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire both into the page**

Update `app/book-an-audit/page.tsx`:

```tsx
import { AuditHero } from "@/components/audit-page/hero";
import { AuditProblem } from "@/components/audit-page/problem";
import { AuditProcess } from "@/components/audit-page/process";

export default function BookAnAuditPage() {
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <AuditHero />
      <AuditProblem />
      <AuditProcess />
    </main>
  );
}
```

- [ ] **Step 4: Verify in browser**

Refresh `/book-an-audit`. You should see hero → problem section ("The most expensive leaks…") → process section with three step cards (`01 · We dig before we talk`, `02 · We stand up your operating system`, `03 · We hand you the one fix worth making`). The three cards should sit in a 3-column grid on desktop, stacked on mobile.

- [ ] **Step 5: Commit**

```bash
git add app/book-an-audit/page.tsx components/audit-page/problem.tsx components/audit-page/process.tsx
git commit -m "Add audit page problem + process sections"
```

---

## Task 5: Static page — deliverables + who-it's-for sections

**Files:**
- Create: `components/audit-page/deliverables.tsx`
- Create: `components/audit-page/who-its-for.tsx`
- Modify: `app/book-an-audit/page.tsx`

- [ ] **Step 1: Create the deliverables section**

Create `components/audit-page/deliverables.tsx`:

```tsx
import { Pill } from "@/components/ui/pill";

const artifacts: Array<{ title: string; body: string }> = [
  {
    title: "Your operating system, live.",
    body: "Every store in one dashboard — filterable per store, comparable side by side. You're logged in and using it during the audit, not after.",
  },
  {
    title: "The Leak Report.",
    body: "Your top leaks, in your numbers, with a measurement plan and the one fix worth making. Worth having even if we never work together again.",
  },
];

export function AuditDeliverables() {
  return (
    <section className="relative border-t border-edge bg-bg px-5 py-20 text-ink sm:px-8 sm:py-24 md:px-14">
      <div className="mx-auto max-w-[1100px]">
        <div className="max-w-[640px]">
          <Pill>What you walk away with</Pill>
          <h2 className="mt-5 text-[clamp(34px,7.5vw,60px)] font-medium leading-[1.05] tracking-[-0.035em] sm:mt-6">
            Two artifacts<span className="text-orange">.</span>
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 md:mt-14 md:grid-cols-2 md:gap-6">
          {artifacts.map((a) => (
            <div
              key={a.title}
              className="rounded-2xl border border-edge bg-panel p-7 sm:p-9"
            >
              <h3 className="text-[22px] font-medium leading-[1.2] tracking-[-0.02em] sm:text-[24px]">
                {a.title}
              </h3>
              <p className="mt-4 text-[14px] leading-[1.55] tracking-[-0.005em] text-ink-dim sm:text-[15px]">
                {a.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create the who-it's-for line**

Create `components/audit-page/who-its-for.tsx`:

```tsx
export function AuditWhoItsFor() {
  return (
    <section className="relative px-5 pb-6 pt-16 text-center sm:px-8 sm:pb-8 sm:pt-20 md:px-14">
      <p className="mx-auto max-w-[680px] font-mono text-[13px] uppercase tracking-[0.16em] text-ink-dim sm:text-[14px]">
        Built for owners running several stores under one brand.
      </p>
    </section>
  );
}
```

- [ ] **Step 3: Wire both into the page**

Update `app/book-an-audit/page.tsx`:

```tsx
import { AuditHero } from "@/components/audit-page/hero";
import { AuditProblem } from "@/components/audit-page/problem";
import { AuditProcess } from "@/components/audit-page/process";
import { AuditDeliverables } from "@/components/audit-page/deliverables";
import { AuditWhoItsFor } from "@/components/audit-page/who-its-for";

export default function BookAnAuditPage() {
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <AuditHero />
      <AuditProblem />
      <AuditProcess />
      <AuditDeliverables />
      <AuditWhoItsFor />
    </main>
  );
}
```

- [ ] **Step 4: Verify in browser**

Refresh `/book-an-audit`. You should now scroll through: hero → problem → process (3 step cards) → deliverables (2 artifact cards side-by-side on desktop) → "Built for owners running several stores under one brand." on its own.

- [ ] **Step 5: Commit**

```bash
git add app/book-an-audit/page.tsx components/audit-page/deliverables.tsx components/audit-page/who-its-for.tsx
git commit -m "Add audit page deliverables + who-its-for sections"
```

---

## Task 6: Form section + API route

**Files:**
- Create: `components/audit-page/form.tsx`
- Create: `app/api/request-audit/route.ts`
- Modify: `app/book-an-audit/page.tsx`

- [ ] **Step 1: Create the form component**

Create `components/audit-page/form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ArrowRight } from "@/components/ui/arrow-right";
import { Pill } from "@/components/ui/pill";

type FormState = {
  name: string;
  email: string;
  phone: string;
  about: string;
};

const empty: FormState = { name: "", email: "", phone: "", about: "" };
type Status = "idle" | "submitting" | "ok" | "error";

const RESPONSE_TIMEFRAME = "two business days";

export function AuditForm() {
  const [form, setForm] = useState<FormState>(empty);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/request-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Something went wrong");
      }
      setStatus("ok");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <section
      id="request-an-audit"
      className="relative border-t border-edge bg-bg px-5 py-20 text-ink sm:px-8 sm:py-24 md:px-14 md:py-[120px]"
    >
      <div className="relative mx-auto max-w-[680px]">
        <div className="text-center">
          <Pill>Request an audit</Pill>
          <h2 className="mt-5 text-[clamp(36px,8vw,64px)] font-medium leading-[0.98] tracking-[-0.035em] sm:mt-6">
            Request an audit<span className="text-orange">.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-[480px] text-[15px] leading-[1.5] text-ink-dim sm:mt-6 sm:text-[17px]">
            Tell us a little about your business. We&apos;ll set up a short
            call to see if it&apos;s a fit.
          </p>
        </div>

        {status === "ok" ? (
          <div className="mt-12 rounded-2xl border border-orange/40 bg-orange-soft p-8 text-center sm:mt-14 sm:p-10">
            <div className="mx-auto mb-5 grid size-12 place-items-center rounded-full border border-orange/60">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12l5 5 9-11"
                  stroke="#FE5100"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="text-[20px] font-medium tracking-[-0.02em]">
              Thanks — we&apos;ll be in touch.
            </div>
            <p className="mx-auto mt-3 max-w-[420px] text-[14px] text-ink-dim">
              We&apos;ll reach out within {RESPONSE_TIMEFRAME} to set up a
              call.
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="mt-10 grid gap-4 text-left sm:mt-12"
          >
            <Field
              label="Name"
              required
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              placeholder="Jane Roberts"
              type="text"
            />
            <Field
              label="Email"
              required
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              placeholder="you@yourstores.com"
              type="email"
            />
            <Field
              label="Phone"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
              placeholder="+1 555 0142"
              type="tel"
            />
            <Field
              label="Tell us about your business"
              value={form.about}
              onChange={(v) => setForm({ ...form, about: v })}
              placeholder="A few sentences — what you run, where, what you'd like the audit to dig into."
              type="textarea"
            />

            {error && (
              <div className="text-[13px] text-[#F87171]">{error}</div>
            )}

            <button
              type="submit"
              disabled={status === "submitting"}
              className="mt-2 inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-transparent bg-orange px-6 py-4 font-sans text-[15px] font-medium tracking-[-0.005em] text-white transition-[filter] hover:brightness-110 disabled:cursor-default disabled:opacity-60"
            >
              {status === "submitting" ? "Sending…" : "Request an audit"}
              {status !== "submitting" && <ArrowRight />}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
  type: "text" | "email" | "tel" | "textarea";
};

function Field({ label, value, onChange, placeholder, required, type }: FieldProps) {
  const baseInputClass =
    "w-full rounded-[10px] border border-edge bg-[#0d0d0d] px-4 py-3.5 font-sans text-[14px] text-ink outline-none placeholder:text-ink-dimmer focus:border-edge-strong";

  return (
    <div>
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
        {label}
        {!required && (
          <span className="ml-2 text-ink-dimmer/60">· optional</span>
        )}
      </div>
      {type === "textarea" ? (
        <textarea
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className={`${baseInputClass} resize-none`}
        />
      ) : (
        <input
          required={required}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={baseInputClass}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the API route (stubbed)**

Create `app/api/request-audit/route.ts`:

```ts
import { NextResponse } from "next/server";

// Stub. The form UX is complete; backend delivery is deferred until Han
// confirms destination (Resend domain, CRM webhook, etc).
//
// To wire Resend (the recommended path): set RESEND_API_KEY in env and
// uncomment the fetch block below. Once a verified sender is set up,
// change the `from` value from the Resend test sender to your domain.
//
// const res = await fetch("https://api.resend.com/emails", {
//   method: "POST",
//   headers: {
//     Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
//     "Content-Type": "application/json",
//   },
//   body: JSON.stringify({
//     from: "Urso Audit <onboarding@resend.dev>",
//     to: ["hsq0503@gmail.com"],
//     subject: `Audit request — ${name}`,
//     html: `<p><b>Name:</b> ${escapeHtml(name)}</p>
//            <p><b>Email:</b> ${escapeHtml(email)}</p>
//            <p><b>Phone:</b> ${escapeHtml(phone || "(not provided)")}</p>
//            <p><b>About:</b><br/>${escapeHtml(about || "(not provided)").replace(/\n/g, "<br/>")}</p>`,
//   }),
// });
// if (!res.ok) throw new Error("Resend rejected the message");

type Payload = {
  name: string;
  email: string;
  phone: string;
  about: string;
};

export async function POST(req: Request) {
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim() ?? "";

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email looks invalid" }, { status: 400 });
  }

  console.log("[audit request]", {
    name,
    email,
    phone: body.phone,
    about: body.about,
    at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Wire form into the page**

Update `app/book-an-audit/page.tsx`:

```tsx
import { AuditHero } from "@/components/audit-page/hero";
import { AuditProblem } from "@/components/audit-page/problem";
import { AuditProcess } from "@/components/audit-page/process";
import { AuditDeliverables } from "@/components/audit-page/deliverables";
import { AuditWhoItsFor } from "@/components/audit-page/who-its-for";
import { AuditForm } from "@/components/audit-page/form";

export default function BookAnAuditPage() {
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <AuditHero />
      <AuditProblem />
      <AuditProcess />
      <AuditDeliverables />
      <AuditWhoItsFor />
      <AuditForm />
    </main>
  );
}
```

- [ ] **Step 4: Verify in browser**

Refresh `/book-an-audit`. Scroll to the form section. Try submitting an empty form — should fail HTML5 validation on Name and Email. Fill in Name + Email + submit → should show the inline success state ("Thanks — we'll be in touch."). Check the terminal where `npm run dev` is running — should see `[audit request]` log line.

Click the hero "Request an audit" button — should scroll-anchor to the form section (`#request-an-audit`).

- [ ] **Step 5: Commit**

```bash
git add app/api/request-audit/route.ts components/audit-page/form.tsx app/book-an-audit/page.tsx
git commit -m "Add audit request form + stubbed API route"
```

---

## Task 7: Gut homepage audit-cta, replace with simple CTA

The old homepage `audit-cta.tsx` has its own embedded funnel that conflicts with the new audit page (it asks for `business` and `stores` count — both forbidden by the new brief). Per Han's direction, replace it with a single "Request an audit" button that calls `armIntro` and navigates.

**Files:**
- Modify: `components/audit-cta.tsx` (heavy rewrite)
- Delete: `components/audit-cta/slide-to-confirm.tsx`
- Delete: `components/audit-cta/stepper.tsx`

- [ ] **Step 1: Rewrite audit-cta.tsx**

Replace the entire contents of `components/audit-cta.tsx` with:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Pill } from "./ui/pill";
import { ArrowRight } from "./ui/arrow-right";
import { armIntro } from "@/lib/intro-state";
import { triggerWipe } from "@/components/wipe-transition";

const cadence: Array<{ tag: string; title: string; body: string }> = [
  {
    tag: "WEEK 1",
    title: "External recon",
    body: "Rankings, review state, booking-flow walk-throughs, after-hours call tests. AI runs the scan; we write the findings per store.",
  },
  {
    tag: "WEEK 2–3",
    title: "Baseline & Leak Report",
    body: "Internal data pulled clean, measured identically across stores. Each leak: what it costs, the proposed fix.",
  },
  {
    tag: "WEEK 4–8",
    title: "Fix one leak, measure the after",
    body: "Depth over breadth. The biggest provable leak — fixed well across every store. The delta becomes your case study.",
  },
];

export function AuditCta() {
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    router.prefetch("/book-an-audit");
  }, [router]);

  const go = () => {
    armIntro();
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      triggerWipe("/book-an-audit", {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        r0: Math.max(rect.width, rect.height) / 2,
      });
    } else {
      triggerWipe("/book-an-audit");
    }
  };

  return (
    <section className="relative overflow-hidden border-t border-edge bg-bg px-5 py-20 text-ink sm:px-8 sm:py-24 md:px-14 md:py-[120px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[900px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(ellipse, rgba(254,81,0,0.10), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[880px] text-center">
        <Pill>Book the audit</Pill>
        <h2 className="mt-5 text-[clamp(44px,11vw,88px)] font-medium leading-[0.95] tracking-[-0.035em] sm:mt-6">
          Find your leak<span className="text-orange">.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-[560px] text-[15px] leading-[1.5] text-ink-dim sm:mt-6 sm:text-[17px]">
          45 minutes. We walk in with AI-driven recon already done — every
          store profiled before we sit down. You leave with a dollar-priced
          list of leaks across every store.
        </p>

        <div className="mt-10 flex justify-center sm:mt-12">
          <button
            ref={btnRef}
            onClick={go}
            className="group inline-flex cursor-pointer items-center gap-2 rounded-lg border border-transparent bg-orange px-[26px] py-4 font-sans text-[15px] font-medium tracking-[-0.005em] text-white shadow-[0_8px_28px_rgba(254,81,0,0.35)] transition-[filter,box-shadow] hover:brightness-110"
          >
            Request an audit
            <ArrowRight />
          </button>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-y-8 border-t border-edge pt-8 text-left sm:mt-20 md:grid-cols-3 md:gap-0">
          {cadence.map((s, i) => (
            <div
              key={s.tag}
              className={`px-1 sm:px-5 md:px-7 ${
                i > 0 ? "md:border-l md:border-edge" : ""
              }`}
            >
              <div className="font-mono text-[10px] tracking-[0.1em] text-orange">
                {s.tag}
              </div>
              <h4 className="mt-3 text-[16px] font-medium tracking-[-0.015em]">
                {s.title}
              </h4>
              <p className="mt-2 text-[13px] leading-[1.5] text-ink-dim">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Delete the old funnel components**

```bash
rm components/audit-cta/slide-to-confirm.tsx
rm components/audit-cta/stepper.tsx
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:3000`. Scroll down to the "Find your leak." section (the second-to-last section before the footer). It should now show a single orange "Request an audit" button instead of the old multi-step form, with the three cadence cards (`WEEK 1 / WEEK 2–3 / WEEK 4–8`) preserved below.

Click the button. It should fire a bloom-wipe transition (since it has a known click origin) and navigate to `/book-an-audit`. The cinematic isn't built yet, so you just land on the static page.

- [ ] **Step 4: Run lint + build to catch any reference to the deleted files**

```bash
npm run lint
npm run build
```

Expected: clean. If there's an error about missing imports (e.g., `Stepper` referenced elsewhere), fix the reference. Spec check: only `components/audit-cta.tsx` referenced those — should be clean.

- [ ] **Step 5: Commit**

```bash
git add components/audit-cta.tsx components/audit-cta/
git commit -m "Replace homepage audit funnel with single CTA to /book-an-audit"
```

---

## Task 8: The master clock hook

**Files:**
- Create: `components/audit-cinematic/use-master-clock.ts`

- [ ] **Step 1: Create the hook**

Create `components/audit-cinematic/use-master-clock.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Opts = {
  totalMs: number;
  playing: boolean;
  onComplete: () => void;
};

export type MasterClock = {
  progress: number; // 0..1
  jumpToEnd: () => void;
  reset: () => void;
};

// rAF-driven clock. Pauses when `playing` flips false (preserves elapsed).
// Calls `onComplete` once when progress reaches 1.
// jumpToEnd skips to 0.94 so the final handoff beat still plays.
export function useMasterClock({ totalMs, playing, onComplete }: Opts): MasterClock {
  const [progress, setProgress] = useState(0);
  const elapsedRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  // keep latest callback without retriggering the effect
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!playing) {
      // pause: record elapsed and stop the loop
      if (startedAtRef.current != null) {
        elapsedRef.current = performance.now() - startedAtRef.current;
        startedAtRef.current = null;
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // resume / start
    startedAtRef.current = performance.now() - elapsedRef.current;

    const tick = (t: number) => {
      const start = startedAtRef.current;
      if (start == null) return;
      const elapsed = t - start;
      const p = Math.min(1, elapsed / totalMs);
      setProgress(p);
      if (p >= 1) {
        if (!completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current();
        }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playing, totalMs]);

  const jumpToEnd = useCallback(() => {
    elapsedRef.current = totalMs * 0.94;
    if (startedAtRef.current != null) {
      startedAtRef.current = performance.now() - elapsedRef.current;
    }
    setProgress(0.94);
  }, [totalMs]);

  const reset = useCallback(() => {
    elapsedRef.current = 0;
    startedAtRef.current = performance.now();
    completedRef.current = false;
    setProgress(0);
  }, []);

  return { progress, jumpToEnd, reset };
}
```

- [ ] **Step 2: Commit**

```bash
git add components/audit-cinematic/use-master-clock.ts
git commit -m "Add useMasterClock hook for cinematic timing"
```

---

## Task 9: Timeline data structure

**Files:**
- Create: `components/audit-cinematic/timeline.ts`

- [ ] **Step 1: Create the timeline**

Create `components/audit-cinematic/timeline.ts`:

```ts
// Single source of truth for the cinematic's pacing and content.
// Tweaking `at`/`dur` here changes the timing; tweaking `data` changes
// the content. See docs/superpowers/specs/2026-05-28-audit-cinematic-design.md
// §3 for the full choreography this implements.

export const TOTAL_MS = 25_000;
export const MOBILE_SCALAR = 1.2;

export type Position =
  | "center"
  | "top-left"
  | "top-right"
  | "mid-left"
  | "mid-right"
  | "bottom-left"
  | "bottom-mid"
  | "bottom-right";

export type CardData = {
  id: string;
  position: Position;
  kind?: "alert" | "neutral";
  header: string;
  body: string;
  bodyExtra?: string; // optional sub-line (e.g., review snippet)
  stars?: { lit: number; total: number };
};

export type ActKey = "01" | "02" | "03" | "04";
export type ActLabel = `Act ${ActKey} · Problem` | `Act ${ActKey} · Why` | `Act ${ActKey} · What we do` | `Act ${ActKey} · Request`;

export type SceneKind =
  | { scene: "establish" }
  | { scene: "card"; data: CardData }
  | { scene: "tagline"; text: string }
  | { scene: "collapse" }
  | { scene: "grid" }
  | { scene: "grid-overlay"; text: string }
  | { scene: "process-step"; step: 1 | 2 | 3; title: string; body?: string }
  | { scene: "leak-card" }
  | { scene: "silence"; phase: "dot" | "line" | "cta"; text?: string }
  | { scene: "handoff" };

export type Beat = {
  at: number;     // ms from cinematic start
  dur: number;    // ms this scene stays mounted
  act: ActKey;
} & SceneKind;

export const ACT_WINDOWS: Record<ActKey, { start: number; end: number; label: string }> = {
  "01": { start: 0,     end: 7000,  label: "Act 01 · Problem" },
  "02": { start: 7000,  end: 13000, label: "Act 02 · Why" },
  "03": { start: 13000, end: 20000, label: "Act 03 · What we do" },
  "04": { start: 20000, end: 25000, label: "Act 04 · Request" },
};

export const TIMELINE: Beat[] = [
  // Persistent establishment — runs the whole 25s.
  { at: 0, dur: 25_000, act: "01", scene: "establish" },

  // Act 1 — Problem (cacophony)
  // Beat 1.2: first card holds in silence (1s in, holds through Act 1)
  { at: 1000, dur: 6000, act: "01", scene: "card", data: {
    id: "missed-call",
    position: "center",
    kind: "alert",
    header: "Missed call · 11:42pm",
    body: "+1 (407) 555-0142",
    bodyExtra: "No callback queued",
  } },
  // Beat 1.3
  { at: 2000, dur: 5000, act: "01", scene: "card", data: {
    id: "review-1star",
    position: "top-right",
    header: "Reviews · today",
    body: '"Nobody picked up."',
    stars: { lit: 1, total: 5 },
  } },
  // Beat 1.4 — booking abandoned + after-hours queue
  { at: 3000, dur: 4000, act: "01", scene: "card", data: {
    id: "booking-abandoned",
    position: "mid-right",
    header: "Booking · step 3/5",
    body: 'Abandoned · field "phone"',
  } },
  { at: 3250, dur: 3750, act: "01", scene: "card", data: {
    id: "after-hours-queue",
    position: "top-left",
    kind: "alert",
    header: "After-hours · queue",
    body: "14 calls · 0 returned",
  } },
  // Beat 1.5 — rapid stack (5 more cards over ~1.7s)
  { at: 4000, dur: 3000, act: "01", scene: "card", data: {
    id: "schema-broken",
    position: "bottom-left",
    header: "Schema · 3 stores",
    body: "Citation broken",
  } },
  { at: 4200, dur: 2800, act: "01", scene: "card", data: {
    id: "map-pin",
    position: "bottom-mid",
    header: "Map pin · store 7",
    body: "Wrong address",
  } },
  { at: 4400, dur: 2600, act: "01", scene: "card", data: {
    id: "click-to-call",
    position: "bottom-right",
    kind: "alert",
    header: "Click-to-call",
    body: "Missing · 4 stores",
  } },
  { at: 4600, dur: 2400, act: "01", scene: "card", data: {
    id: "review-2star",
    position: "mid-left",
    header: "Review · 2 stars",
    body: "9 days · no response",
  } },
  { at: 4800, dur: 2200, act: "01", scene: "card", data: {
    id: "mobile-cls",
    position: "top-left",
    header: "Mobile · CLS 0.31",
    body: "Booking page jitters",
  } },
  // Beat 1.6 — tagline
  { at: 6000, dur: 1000, act: "01", scene: "tagline",
    text: "None of it shows up in your POS." },

  // Act 2 — Why (coherence)
  // Beat 2.1 — collapse transition
  { at: 7000, dur: 2000, act: "02", scene: "collapse" },
  // Beat 2.2 — grid hold
  { at: 9000, dur: 4000, act: "02", scene: "grid" },
  // Beat 2.3 — overlay
  { at: 10500, dur: 2500, act: "02", scene: "grid-overlay",
    text: "Your best store and your worst store — running different businesses." },

  // Act 3 — What we do (clarity)
  // Beat 3.1
  { at: 13000, dur: 2000, act: "03", scene: "process-step",
    step: 1, title: "We dig before we talk." },
  // Beat 3.2
  { at: 15000, dur: 2000, act: "03", scene: "process-step",
    step: 2, title: "We stand up your operating system." },
  // Beat 3.3 — leak card
  { at: 17000, dur: 3000, act: "03", scene: "leak-card" },

  // Act 4 — Request (silence)
  // Beat 4.1 — dot
  { at: 20000, dur: 1000, act: "04", scene: "silence", phase: "dot" },
  // Beat 4.2 — line
  { at: 21000, dur: 4000, act: "04", scene: "silence", phase: "line",
    text: "Your leaks. Quantified." },
  // Beat 4.3 — CTA
  { at: 22500, dur: 2500, act: "04", scene: "silence", phase: "cta" },
  // Beat 4.4 — handoff
  { at: 23500, dur: 1500, act: "04", scene: "handoff" },
];

export function isBeatActive(beat: Beat, elapsedMs: number): boolean {
  return elapsedMs >= beat.at && elapsedMs < beat.at + beat.dur;
}

export function localProgress(beat: Beat, elapsedMs: number): number {
  return Math.max(0, Math.min(1, (elapsedMs - beat.at) / beat.dur));
}

export function currentAct(elapsedMs: number): ActKey {
  if (elapsedMs >= ACT_WINDOWS["04"].start) return "04";
  if (elapsedMs >= ACT_WINDOWS["03"].start) return "03";
  if (elapsedMs >= ACT_WINDOWS["02"].start) return "02";
  return "01";
}
```

- [ ] **Step 2: Commit**

```bash
git add components/audit-cinematic/timeline.ts
git commit -m "Add cinematic TIMELINE + scene type definitions"
```

---

## Task 10: AuditPageGate

The gate is what `app/book-an-audit/page.tsx` wraps the static page in. It reads `consumeIntro()` once on mount and decides whether to render the cinematic overlay.

**Files:**
- Create: `components/audit-cinematic/audit-page-gate.tsx`
- Modify: `app/book-an-audit/page.tsx`

- [ ] **Step 1: Create the gate**

Create `components/audit-cinematic/audit-page-gate.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { consumeIntro } from "@/lib/intro-state";

// Dynamic import — cinematic doesn't ship in the static page bundle.
const AuditCinematic = dynamic(
  () => import("./").then((m) => m.AuditCinematic),
  { ssr: false },
);

export function AuditPageGate({ children }: { children: ReactNode }) {
  const [showCinematic, setShowCinematic] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // Always discard a pending flag so it doesn't leak to the next page.
      consumeIntro();
      return;
    }

    // Debug helper — ?intro=1 forces the cinematic to play even on direct
    // URL hits. Lets us iterate on scenes without sliding from the homepage
    // every time. Strip on production if it's a problem.
    const debug = new URLSearchParams(window.location.search).get("intro") === "1";

    if (consumeIntro() || debug) {
      setShowCinematic(true);
    }
  }, []);

  return (
    <>
      {children}
      {mounted && showCinematic && (
        <AuditCinematic onComplete={() => setShowCinematic(false)} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Wrap the page**

Update `app/book-an-audit/page.tsx`:

```tsx
import { AuditPageGate } from "@/components/audit-cinematic/audit-page-gate";
import { AuditHero } from "@/components/audit-page/hero";
import { AuditProblem } from "@/components/audit-page/problem";
import { AuditProcess } from "@/components/audit-page/process";
import { AuditDeliverables } from "@/components/audit-page/deliverables";
import { AuditWhoItsFor } from "@/components/audit-page/who-its-for";
import { AuditForm } from "@/components/audit-page/form";

export default function BookAnAuditPage() {
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <AuditPageGate>
        <AuditHero />
        <AuditProblem />
        <AuditProcess />
        <AuditDeliverables />
        <AuditWhoItsFor />
        <AuditForm />
      </AuditPageGate>
    </main>
  );
}
```

- [ ] **Step 3: Stub the cinematic component**

The gate imports `AuditCinematic` from `./` (i.e., `index.tsx`). That file doesn't exist yet, so the import will fail. Create a minimal stub at `components/audit-cinematic/index.tsx`:

```tsx
"use client";

type Props = { onComplete: () => void };

export function AuditCinematic({ onComplete }: Props) {
  // Auto-complete immediately for now — Task 11 builds the real shell.
  if (typeof window !== "undefined") {
    setTimeout(onComplete, 0);
  }
  return null;
}
```

- [ ] **Step 4: Verify in browser**

- Visit `/book-an-audit` directly → static page renders, no cinematic flicker.
- Open `http://localhost:3000` → slide to book → wipe plays → land on static page (the cinematic stub immediately completes and unmounts itself).
- Visit `/book-an-audit?intro=1` directly → same as above (cinematic stub immediately completes; will be more interesting once Task 11 lands).

- [ ] **Step 5: Commit**

```bash
git add components/audit-cinematic/audit-page-gate.tsx components/audit-cinematic/index.tsx app/book-an-audit/page.tsx
git commit -m "Add AuditPageGate + cinematic stub"
```

---

## Task 11: AuditCinematic shell + chrome

This task builds the real cinematic shell: master clock, persistent chrome (act tag, timer, skip), keyboard + visibility handlers, scene dispatch. No scene content yet — we'll see the chrome ticking through 25 seconds.

**Files:**
- Create: `components/audit-cinematic/ui/act-tag.tsx`
- Create: `components/audit-cinematic/ui/timer.tsx`
- Create: `components/audit-cinematic/ui/skip-control.tsx`
- Create: `components/audit-cinematic/cinematic.css`
- Modify: `components/audit-cinematic/index.tsx` (replace stub)

- [ ] **Step 1: Act tag**

Create `components/audit-cinematic/ui/act-tag.tsx`:

```tsx
import { ACT_WINDOWS, currentAct } from "../timeline";

export function ActTag({ elapsedMs }: { elapsedMs: number }) {
  const act = currentAct(elapsedMs);
  const label = ACT_WINDOWS[act].label;
  return (
    <div
      key={act}
      className="pointer-events-none absolute left-5 top-5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dimmer sm:left-8 sm:top-8"
      style={{ animation: "cinematic-fade-in 300ms ease both" }}
    >
      {label}
    </div>
  );
}
```

- [ ] **Step 2: Timer**

Create `components/audit-cinematic/ui/timer.tsx`:

```tsx
function format(ms: number) {
  const total = Math.floor(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function Timer({ elapsedMs }: { elapsedMs: number }) {
  return (
    <div className="pointer-events-none absolute right-5 top-5 font-mono text-[11px] tracking-[0.16em] text-orange sm:right-8 sm:top-8">
      {format(elapsedMs)}
    </div>
  );
}
```

- [ ] **Step 3: Skip control**

Create `components/audit-cinematic/ui/skip-control.tsx`:

```tsx
"use client";

type Props = { onSkip: () => void };

export function SkipControl({ onSkip }: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSkip();
      }}
      aria-label="Skip intro"
      className="absolute bottom-5 right-5 cursor-pointer font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dimmer outline-none transition-colors hover:text-ink-dim focus-visible:ring-2 focus-visible:ring-white/40 sm:bottom-8 sm:right-8"
    >
      esc · skip ›
    </button>
  );
}
```

- [ ] **Step 4: Cinematic CSS (shell-level keyframes)**

Create `components/audit-cinematic/cinematic.css`:

```css
/* Cinematic-specific keyframes. Imported only by AuditCinematic — kept out
   of globals.css to avoid bloating the marketing CSS. */

@keyframes cinematic-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes cinematic-card-enter {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes cinematic-card-exit {
  from { opacity: 1; }
  to   { opacity: 0; }
}

@keyframes cinematic-cursor-blink {
  50% { opacity: 0; }
}

.cinematic-root {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: #070707;
  font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  color: #fff;
  overflow: hidden;
  will-change: transform, opacity;
}

/* All animations within the cinematic pause when the parent has data-paused. */
.cinematic-root[data-paused="true"] *,
.cinematic-root[data-paused="true"] {
  animation-play-state: paused !important;
}

@media (prefers-reduced-motion: reduce) {
  .cinematic-root,
  .cinematic-root * {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 5: Replace the stub with the real AuditCinematic**

Replace `components/audit-cinematic/index.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMasterClock } from "./use-master-clock";
import { TIMELINE, TOTAL_MS, isBeatActive } from "./timeline";
import { ActTag } from "./ui/act-tag";
import { Timer } from "./ui/timer";
import { SkipControl } from "./ui/skip-control";
import "./cinematic.css";

type Props = { onComplete: () => void };

export function AuditCinematic({ onComplete }: Props) {
  const [playing, setPlaying] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  const { progress, jumpToEnd } = useMasterClock({
    totalMs: TOTAL_MS,
    playing,
    onComplete: handleComplete,
  });

  const elapsedMs = progress * TOTAL_MS;

  // Pause when the tab is hidden.
  useEffect(() => {
    const onVis = () => setPlaying(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Esc skips.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") jumpToEnd();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [jumpToEnd]);

  // Click on the overlay background (but not interactive children) also skips.
  const onRootClick = (e: React.MouseEvent) => {
    if (e.target === rootRef.current) jumpToEnd();
  };

  // Lock body scroll while playing.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const activeBeats = TIMELINE.filter((b) => isBeatActive(b, elapsedMs));

  return (
    <div
      ref={rootRef}
      onClick={onRootClick}
      className="cinematic-root"
      data-paused={!playing}
      aria-hidden="true"
    >
      <ActTag elapsedMs={elapsedMs} />
      <Timer elapsedMs={elapsedMs} />
      <SkipControl onSkip={jumpToEnd} />

      {/* Scene dispatch goes here — Tasks 12+. For now we just see the chrome. */}
      {activeBeats.map((beat) => (
        <SceneStub key={`${beat.at}-${beat.scene}`} beat={beat} elapsedMs={elapsedMs} />
      ))}
    </div>
  );
}

// Temporary visualizer — replaced by real scenes in subsequent tasks.
function SceneStub({ beat, elapsedMs }: { beat: (typeof TIMELINE)[number]; elapsedMs: number }) {
  if (beat.scene === "establish") return null;
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[12px] text-ink-dim"
      style={{ animation: "cinematic-fade-in 200ms ease both" }}
    >
      [{beat.scene}] · {(elapsedMs / 1000).toFixed(1)}s
    </div>
  );
}
```

- [ ] **Step 6: Verify in browser**

Visit `http://localhost:3000/book-an-audit?intro=1`. You should see:

- Top-left: `Act 01 · Problem` in dim mono. After 7s it should change to `Act 02 · Why`, then `Act 03 · What we do` at 13s, then `Act 04 · Request` at 20s.
- Top-right: ticking orange timer `00:00 → 00:25`.
- Bottom-right: `esc · skip ›` button.
- Center: the current beat stub (`[card] · 1.2s`, etc.) — proves scene dispatch is working.
- At 25s, cinematic unmounts and the static page is fully visible.

Test the controls:
- Press `Esc` → cinematic jumps to ~24s and completes within ~1.5s.
- Click on the overlay background → same.
- Click the `skip` button → same.
- Tab away to another browser tab, wait 5s, come back → the timer resumes from where you left, doesn't fast-forward.

- [ ] **Step 7: Commit**

```bash
git add components/audit-cinematic/
git commit -m "Build AuditCinematic shell with master clock + chrome"
```

---

## Task 12: IntroCard primitive + card-scene wrapper

Now we start replacing scene stubs with real scenes. Cards are the most common; build the reusable primitive first.

**Files:**
- Create: `components/audit-cinematic/ui/intro-card.tsx`
- Create: `components/audit-cinematic/scenes/card-scene.tsx`
- Modify: `components/audit-cinematic/index.tsx`
- Modify: `components/audit-cinematic/cinematic.css`

- [ ] **Step 1: Position map (CSS)**

Append to `components/audit-cinematic/cinematic.css`:

```css
/* Card position absolute coordinates. Mobile overrides come later. */
.intro-card {
  position: absolute;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 12px 14px;
  min-width: 200px;
  max-width: 260px;
  animation: cinematic-card-enter 380ms cubic-bezier(0.16, 1, 0.3, 1) both;
  will-change: transform, opacity;
}

.intro-card[data-kind="alert"] {
  border-color: rgba(254, 81, 0, 0.35);
}

.intro-card[data-exit="true"] {
  animation: cinematic-card-exit 200ms ease forwards;
}

.intro-card .h {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.38);
  margin-bottom: 6px;
}

.intro-card[data-kind="alert"] .h {
  color: #fe5100;
}

.intro-card .b {
  font-size: 14px;
  letter-spacing: -0.005em;
  color: #fff;
  line-height: 1.3;
}

.intro-card .b-extra {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 4px;
}

.intro-card .stars {
  letter-spacing: 0.05em;
  color: #fe5100;
}

.intro-card .stars-off {
  color: rgba(255, 255, 255, 0.18);
}

/* Position presets. */
.pos-center      { left: 50%; top: 50%; transform: translate(-50%, -50%); }
.pos-top-left    { top: 14%;    left: 8%; }
.pos-top-right   { top: 12%;    right: 8%; }
.pos-mid-left    { top: 42%;    left: 10%; }
.pos-mid-right   { top: 38%;    right: 10%; }
.pos-bottom-left { bottom: 22%; left: 12%; }
.pos-bottom-mid  { bottom: 24%; left: 50%; transform: translateX(-50%); }
.pos-bottom-right{ bottom: 22%; right: 8%; }
```

- [ ] **Step 2: IntroCard primitive**

Create `components/audit-cinematic/ui/intro-card.tsx`:

```tsx
import type { CardData, Position } from "../timeline";

const posClass: Record<Position, string> = {
  "center": "pos-center",
  "top-left": "pos-top-left",
  "top-right": "pos-top-right",
  "mid-left": "pos-mid-left",
  "mid-right": "pos-mid-right",
  "bottom-left": "pos-bottom-left",
  "bottom-mid": "pos-bottom-mid",
  "bottom-right": "pos-bottom-right",
};

export function IntroCard({ data }: { data: CardData }) {
  return (
    <div
      className={`intro-card ${posClass[data.position]}`}
      data-kind={data.kind ?? "neutral"}
      data-card-id={data.id}
    >
      <div className="h">{data.header}</div>
      <div className="b">
        {data.stars ? (
          <span className="stars">
            {"★".repeat(data.stars.lit)}
            <span className="stars-off">
              {"★".repeat(data.stars.total - data.stars.lit)}
            </span>{" "}
            {data.body}
          </span>
        ) : (
          data.body
        )}
      </div>
      {data.bodyExtra && <div className="b-extra">{data.bodyExtra}</div>}
    </div>
  );
}
```

- [ ] **Step 3: CardScene wrapper**

Create `components/audit-cinematic/scenes/card-scene.tsx`:

```tsx
import type { CardData } from "../timeline";
import { IntroCard } from "../ui/intro-card";

export function CardScene({ data }: { data: CardData }) {
  return <IntroCard data={data} />;
}
```

- [ ] **Step 4: Wire CardScene into the dispatch**

Update `components/audit-cinematic/index.tsx`. Replace the `SceneStub` function and the dispatch loop with this:

```tsx
import { CardScene } from "./scenes/card-scene";
```

…added to the imports at the top. Then replace the existing `{activeBeats.map(...)}` block at the bottom of the JSX with:

```tsx
{activeBeats.map((beat) => {
  const key = `${beat.at}-${beat.scene}`;
  if (beat.scene === "establish") return null;
  if (beat.scene === "card") return <CardScene key={key} data={beat.data} />;
  // Remaining scenes are stubbed for now.
  return (
    <div
      key={key}
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[12px] text-ink-dim"
      style={{ animation: "cinematic-fade-in 200ms ease both" }}
    >
      [{beat.scene}] · {(elapsedMs / 1000).toFixed(1)}s
    </div>
  );
})}
```

Delete the bottom `SceneStub` function.

- [ ] **Step 5: Verify in browser**

Visit `/book-an-audit?intro=1`. Act 1 should now show real cards:

- 0:01 — single missed-call card appears center.
- 0:02 — review card top-right.
- 0:03 — booking card mid-right + after-hours queue top-left.
- 0:04 onward — schema, map pin, click-to-call, 2-star review, mobile CLS cards stack.
- 0:06 — `[tagline]` stub appears center.
- All cards should slide-up + scale-in smoothly with the orange flash for alert variants.

If cards overlap badly: that's expected for now (final positioning is tuned in Task 23 mobile pass; desktop should already look good).

- [ ] **Step 6: Commit**

```bash
git add components/audit-cinematic/
git commit -m "Wire Act 1 cards through IntroCard + CardScene"
```

---

## Task 13: Establish + tagline scenes

Replace the remaining Act 1 stubs (`establish`, `tagline`) with real scenes.

**Files:**
- Create: `components/audit-cinematic/scenes/establish-scene.tsx`
- Create: `components/audit-cinematic/scenes/tagline-scene.tsx`
- Modify: `components/audit-cinematic/index.tsx`
- Modify: `components/audit-cinematic/cinematic.css`

- [ ] **Step 1: Establish scene**

Create `components/audit-cinematic/scenes/establish-scene.tsx`:

```tsx
export function EstablishScene() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-12 left-12 font-mono text-[12px] tracking-[0.1em] text-ink-dim"
      style={{
        animation: "cinematic-cursor-blink 1s steps(2) infinite",
      }}
    >
      ▍
    </div>
  );
}
```

- [ ] **Step 2: Tagline scene + CSS**

Append to `components/audit-cinematic/cinematic.css`:

```css
.cinematic-tagline {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 12%;
  text-align: center;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 13px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.8);
  animation: cinematic-fade-in 400ms ease-out both;
}

@media (min-width: 640px) {
  .cinematic-tagline { font-size: 15px; }
}
```

Create `components/audit-cinematic/scenes/tagline-scene.tsx`:

```tsx
export function TaglineScene({ text }: { text: string }) {
  return <div className="cinematic-tagline">{text}</div>;
}
```

- [ ] **Step 3: Wire into dispatch**

Update `components/audit-cinematic/index.tsx`. Add imports:

```tsx
import { EstablishScene } from "./scenes/establish-scene";
import { TaglineScene } from "./scenes/tagline-scene";
```

Update the dispatch loop:

```tsx
{activeBeats.map((beat) => {
  const key = `${beat.at}-${beat.scene}`;
  if (beat.scene === "establish") return <EstablishScene key={key} />;
  if (beat.scene === "card") return <CardScene key={key} data={beat.data} />;
  if (beat.scene === "tagline") return <TaglineScene key={key} text={beat.text} />;
  return (
    <div
      key={key}
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[12px] text-ink-dim"
      style={{ animation: "cinematic-fade-in 200ms ease both" }}
    >
      [{beat.scene}] · {(elapsedMs / 1000).toFixed(1)}s
    </div>
  );
})}
```

- [ ] **Step 4: Verify in browser**

Visit `/book-an-audit?intro=1`. From 0:00, a blinking cursor should appear bottom-left. At 0:06, "None of it shows up in your POS." appears centered near the bottom of the frame. Both should crossfade in/out cleanly.

- [ ] **Step 5: Commit**

```bash
git add components/audit-cinematic/
git commit -m "Add Establish + Tagline scenes (Act 1 complete)"
```

---

## Task 14: Collapse scene (Act 2 transition)

The hardest beat — cards from Act 1 collapse into grid cells in Act 2. We approach this by overlaying a separate "ghost" grid that materializes while the existing cards fade. Not strictly FLIP-from-actual-card-positions (would require a layout effect coordinating two scene boundaries), but visually achieves the same "cards reorganizing into structure" beat.

**Files:**
- Create: `components/audit-cinematic/scenes/collapse-scene.tsx`
- Modify: `components/audit-cinematic/index.tsx`
- Modify: `components/audit-cinematic/cinematic.css`

- [ ] **Step 1: CSS for collapsing cells**

Append to `components/audit-cinematic/cinematic.css`:

```css
.collapse-stage {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* Background grid pattern fades in during the collapse. */
.collapse-stage::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: 32px 32px;
  background-position: center;
  opacity: 0;
  animation: cinematic-fade-in 1500ms ease-out 200ms both;
}

.collapse-cell {
  position: absolute;
  width: 22px;
  height: 16px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  /* Each cell flies in from a different off-center origin, ending in grid. */
  animation: cinematic-cell-fly 1400ms cubic-bezier(0.22, 1, 0.32, 1) both;
}

.collapse-cell[data-tone="hot"] {
  background: #fe5100;
  border-color: #fe5100;
  box-shadow: 0 0 8px rgba(254, 81, 0, 0.5);
}

.collapse-cell[data-tone="warm"] {
  background: rgba(254, 81, 0, 0.4);
  border-color: rgba(254, 81, 0, 0.5);
}

@keyframes cinematic-cell-fly {
  from {
    opacity: 0;
    transform: translate(var(--from-x, 0), var(--from-y, 0)) scale(2.5);
  }
  to {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
}
```

- [ ] **Step 2: Collapse scene**

Create `components/audit-cinematic/scenes/collapse-scene.tsx`:

```tsx
// 48 cells representing 8 stores (cols) × 6 leak types (rows).
// Each cell flies in from a random origin within ~40vw of its final position,
// timed so the swarm arrives over ~1.2s.

const COLS = 8;
const ROWS = 6;
const CELL_W = 22;
const CELL_H = 16;
const GAP = 3;

// Tone pattern — picks where the "heat" lives. Mirrors the storyboard.
const TONE: ("hot" | "warm" | "cool" | "")[] = [
  "hot","warm","","","warm","hot","","",
  "warm","hot","","","","warm","","hot",
  "hot","warm","","","","hot","","warm",
  "warm","hot","","","","warm","","hot",
  "hot","warm","","","","hot","","warm",
  "warm","hot","","","","warm","","hot",
];

function origin(idx: number) {
  // Deterministic pseudo-random so the layout is stable across renders.
  const r1 = Math.sin(idx * 12.9898) * 43758.5453;
  const r2 = Math.sin(idx * 78.233) * 43758.5453;
  const dx = (r1 - Math.floor(r1) - 0.5) * 600;
  const dy = (r2 - Math.floor(r2) - 0.5) * 400;
  return { dx, dy };
}

export function CollapseScene() {
  const totalW = COLS * CELL_W + (COLS - 1) * GAP;
  const totalH = ROWS * CELL_H + (ROWS - 1) * GAP;

  return (
    <div className="collapse-stage">
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: totalW,
          height: totalH,
          transform: "translate(-50%, -50%)",
        }}
      >
        {Array.from({ length: COLS * ROWS }).map((_, idx) => {
          const col = idx % COLS;
          const row = Math.floor(idx / COLS);
          const tone = TONE[idx] || "cool";
          const { dx, dy } = origin(idx);
          const delay = (idx % 12) * 30; // stagger across ~360ms
          return (
            <div
              key={idx}
              className="collapse-cell"
              data-tone={tone}
              style={{
                left: col * (CELL_W + GAP),
                top: row * (CELL_H + GAP),
                ["--from-x" as string]: `${dx}px`,
                ["--from-y" as string]: `${dy}px`,
                animationDelay: `${delay}ms`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into dispatch**

In `components/audit-cinematic/index.tsx`:

```tsx
import { CollapseScene } from "./scenes/collapse-scene";
```

Add the dispatch case:

```tsx
if (beat.scene === "collapse") return <CollapseScene key={key} />;
```

- [ ] **Step 4: Verify in browser**

Visit `/book-an-audit?intro=1`. Watch the 0:07–0:09 window: cards from Act 1 should still be visible at 0:07, and then 48 cells should fly in from various directions and settle into an 8×6 grid by 0:09. Background grid pattern fades up alongside. Should feel like the chaos "snapping into structure."

- [ ] **Step 5: Commit**

```bash
git add components/audit-cinematic/
git commit -m "Add Act 2 collapse scene"
```

---

## Task 15: Grid scene + grid-overlay scene (Act 2)

The grid that the collapse resolved into needs to hold and then get a "best/worst" overlay.

**Files:**
- Create: `components/audit-cinematic/scenes/grid-scene.tsx`
- Create: `components/audit-cinematic/scenes/grid-overlay-scene.tsx`
- Modify: `components/audit-cinematic/index.tsx`
- Modify: `components/audit-cinematic/cinematic.css`

- [ ] **Step 1: Grid CSS**

Append to `components/audit-cinematic/cinematic.css`:

```css
.cinematic-grid {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: grid;
  grid-template-columns: repeat(8, 22px);
  grid-template-rows: repeat(6, 16px);
  gap: 3px;
  animation: cinematic-fade-in 300ms ease both;
}

.cinematic-grid > div {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
}
.cinematic-grid > div[data-tone="hot"] {
  background: #fe5100;
  box-shadow: 0 0 8px rgba(254, 81, 0, 0.5);
}
.cinematic-grid > div[data-tone="warm"] {
  background: rgba(254, 81, 0, 0.4);
}

.cinematic-grid-labels {
  position: absolute;
  left: 50%;
  top: calc(50% + 60px);
  transform: translateX(-50%);
  display: grid;
  grid-template-columns: repeat(8, 22px);
  gap: 3px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 8px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  animation: cinematic-fade-in 400ms ease 200ms both;
}

.cinematic-grid-labels > span[data-hot="true"] { color: #fe5100; }

.cinematic-grid-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 14%;
  text-align: center;
  font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  font-size: clamp(16px, 3vw, 22px);
  letter-spacing: -0.02em;
  font-weight: 500;
  color: #fff;
  padding: 0 24px;
  animation: cinematic-fade-in 400ms ease both;
}
.cinematic-grid-overlay b { color: #fe5100; font-weight: 500; }
```

- [ ] **Step 2: GridScene**

Create `components/audit-cinematic/scenes/grid-scene.tsx`:

```tsx
const TONE: ("hot" | "warm" | "cool" | "")[] = [
  "hot","warm","","","warm","hot","","",
  "warm","hot","","","","warm","","hot",
  "hot","warm","","","","hot","","warm",
  "warm","hot","","","","warm","","hot",
  "hot","warm","","","","hot","","warm",
  "warm","hot","","","","warm","","hot",
];

const HOT_COLS = new Set([0, 5]);

export function GridScene() {
  return (
    <>
      <div className="cinematic-grid">
        {TONE.map((tone, i) => (
          <div key={i} data-tone={tone || "cool"} />
        ))}
      </div>
      <div className="cinematic-grid-labels">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} data-hot={HOT_COLS.has(i)}>
            S{String(i + 1).padStart(2, "0")}
          </span>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: GridOverlayScene**

Create `components/audit-cinematic/scenes/grid-overlay-scene.tsx`:

```tsx
export function GridOverlayScene({ text }: { text: string }) {
  // Split on em-dash so we can italicize / orange-color the punchline.
  const [before, after] = text.split(" — ");
  return (
    <div className="cinematic-grid-overlay">
      {before}
      {after && (
        <>
          {" — "}
          <b>{after}</b>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire into dispatch**

In `components/audit-cinematic/index.tsx`:

```tsx
import { GridScene } from "./scenes/grid-scene";
import { GridOverlayScene } from "./scenes/grid-overlay-scene";
```

Add the dispatch cases:

```tsx
if (beat.scene === "grid") return <GridScene key={key} />;
if (beat.scene === "grid-overlay") return <GridOverlayScene key={key} text={beat.text} />;
```

- [ ] **Step 5: Verify in browser**

Visit `/book-an-audit?intro=1`. 0:09–0:13 window: after the collapse settles, an 8×6 grid holds with `S01 … S08` labels below. At 0:10.5, overlay text "Your best store and your worst store — **running different businesses.**" appears with the punchline in orange.

- [ ] **Step 6: Commit**

```bash
git add components/audit-cinematic/
git commit -m "Add Act 2 grid + overlay scenes"
```

---

## Task 16: Process step scenes (Act 3.1 + 3.2)

Two crossfading scenes — both small dashboard-style cards with an eyebrow.

**Files:**
- Create: `components/audit-cinematic/scenes/process-step-scene.tsx`
- Modify: `components/audit-cinematic/index.tsx`
- Modify: `components/audit-cinematic/cinematic.css`

- [ ] **Step 1: Process step CSS**

Append to `components/audit-cinematic/cinematic.css`:

```css
.process-step {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(420px, 90vw);
  animation: cinematic-card-enter 460ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.process-step .eyebrow {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #fe5100;
  margin-bottom: 14px;
}

.process-step .title {
  font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  font-size: clamp(22px, 3.2vw, 30px);
  letter-spacing: -0.025em;
  font-weight: 500;
  color: #fff;
  line-height: 1.1;
  margin-bottom: 18px;
}

.process-step .panel {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  padding: 14px 16px;
  display: grid;
  gap: 8px;
}

.process-step .row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 14px;
  font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  font-size: 13px;
  color: #fff;
  letter-spacing: -0.005em;
}

.process-step .row .k {
  color: rgba(255, 255, 255, 0.5);
}

.process-step .row .v {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  letter-spacing: 0.04em;
  color: #fe5100;
}
```

- [ ] **Step 2: Process step scene**

Create `components/audit-cinematic/scenes/process-step-scene.tsx`:

```tsx
type Props = { step: 1 | 2 | 3; title: string };

const STEP_DATA: Record<1 | 2 | 3, { eyebrow: string; rows: Array<[string, string]> }> = {
  1: {
    eyebrow: "01 · We dig before we talk",
    rows: [
      ["After-hours call test", "ring 14 · no answer"],
      ["Citation parity", "5/8 stores"],
      ["Booking flow walk-through", "complete"],
    ],
  },
  2: {
    eyebrow: "02 · We stand up your operating system",
    rows: [
      ["POS · Google · Books · Calls", "→ one panel"],
      ["Per-store comparison", "live"],
      ["Observation mode", "no changes yet"],
    ],
  },
  3: {
    eyebrow: "03 · We hand you the one fix worth making",
    rows: [],
  },
};

export function ProcessStepScene({ step, title }: Props) {
  const data = STEP_DATA[step];
  return (
    <div className="process-step">
      <div className="eyebrow">{data.eyebrow}</div>
      <div className="title">{title}</div>
      {data.rows.length > 0 && (
        <div className="panel">
          {data.rows.map(([k, v]) => (
            <div key={k} className="row">
              <span className="k">{k}</span>
              <span className="v">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire into dispatch**

In `components/audit-cinematic/index.tsx`:

```tsx
import { ProcessStepScene } from "./scenes/process-step-scene";
```

Add the dispatch case:

```tsx
if (beat.scene === "process-step") {
  return <ProcessStepScene key={key} step={beat.step} title={beat.title} />;
}
```

- [ ] **Step 4: Verify in browser**

Visit `/book-an-audit?intro=1`. 0:13–0:17 window: two crossfading scenes.

- 0:13–0:15: `01 · We dig before we talk` orange eyebrow above title "We dig before we talk.", panel below with three rows (after-hours call test, citation parity, booking flow walk-through).
- 0:15–0:17: `02 · We stand up your operating system` above title, panel with POS/Google/Books/Calls row.

- [ ] **Step 5: Commit**

```bash
git add components/audit-cinematic/
git commit -m "Add Act 3 process step scenes (3.1 + 3.2)"
```

---

## Task 17: Leak card scene (Act 3.3)

The big payoff card — the "one fix worth making" with the dollar amount.

**Files:**
- Create: `components/audit-cinematic/scenes/leak-card-scene.tsx`
- Modify: `components/audit-cinematic/index.tsx`
- Modify: `components/audit-cinematic/cinematic.css`

- [ ] **Step 1: Leak card CSS**

Append to `components/audit-cinematic/cinematic.css`:

```css
.leak-card {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(440px, 90vw);
  border: 1px solid rgba(254, 81, 0, 0.5);
  border-radius: 10px;
  background: rgba(254, 81, 0, 0.04);
  padding: 22px 24px;
  animation: cinematic-card-enter 500ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.leak-card .label {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #fe5100;
}

.leak-card .price {
  font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  font-size: clamp(36px, 6vw, 56px);
  font-weight: 500;
  letter-spacing: -0.035em;
  color: #fff;
  line-height: 1;
  margin-top: 10px;
}

.leak-card .price .unit {
  font-size: clamp(13px, 2vw, 16px);
  color: rgba(255, 255, 255, 0.45);
  letter-spacing: 0.04em;
  font-weight: 400;
  margin-left: 4px;
  vertical-align: baseline;
}

.leak-card hr {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin: 16px 0;
}

.leak-card .row {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 12px;
  font-size: 13px;
  line-height: 1.45;
  margin-bottom: 6px;
}

.leak-card .row .k {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
  padding-top: 2px;
}

.leak-card .row .v {
  color: #fff;
  letter-spacing: -0.005em;
}
```

- [ ] **Step 2: Leak card scene**

Create `components/audit-cinematic/scenes/leak-card-scene.tsx`:

```tsx
export function LeakCardScene() {
  return (
    <div className="leak-card">
      <div className="label">03 · The one fix worth making</div>
      <div className="price">
        $4,180<span className="unit">/mo</span>
      </div>
      <hr />
      <div className="row">
        <span className="k">Leak</span>
        <span className="v">After-hours missed calls</span>
      </div>
      <div className="row">
        <span className="k">Fix</span>
        <span className="v">SMS callback queue · on-call rotation</span>
      </div>
      <div className="row">
        <span className="k">Measure</span>
        <span className="v">Missed → returned · 30-day window</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into dispatch**

In `components/audit-cinematic/index.tsx`:

```tsx
import { LeakCardScene } from "./scenes/leak-card-scene";
```

Add the dispatch case:

```tsx
if (beat.scene === "leak-card") return <LeakCardScene key={key} />;
```

- [ ] **Step 4: Verify in browser**

Visit `/book-an-audit?intro=1`. 0:17–0:20 window: single large card centers with orange border, `03 · The one fix worth making` eyebrow, `$4,180/mo` display-size price, horizontal rule, then three rows (Leak / Fix / Measure).

- [ ] **Step 5: Commit**

```bash
git add components/audit-cinematic/
git commit -m "Add Act 3 leak card scene"
```

---

## Task 18: Silence scene (Act 4)

The dot → line → CTA phase sequence. One scene component that switches behavior by phase.

**Files:**
- Create: `components/audit-cinematic/scenes/silence-scene.tsx`
- Modify: `components/audit-cinematic/index.tsx`
- Modify: `components/audit-cinematic/cinematic.css`

- [ ] **Step 1: Silence CSS**

Append to `components/audit-cinematic/cinematic.css`:

```css
.silence-dot {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
  animation: cinematic-cursor-blink 800ms steps(2) infinite,
             cinematic-fade-in 300ms ease both;
}

.silence-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(calc(-50% - 38px));
  text-align: center;
  font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  font-size: clamp(28px, 5vw, 44px);
  letter-spacing: -0.03em;
  font-weight: 500;
  color: #fff;
  padding: 0 24px;
  animation: cinematic-fade-in 600ms ease-out both;
}
.silence-line b { color: #fe5100; font-weight: 500; }

.silence-cta {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(calc(-50% + 36px));
  display: flex;
  justify-content: center;
  animation: cinematic-fade-in 400ms ease 100ms both;
}

.silence-cta a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #fe5100;
  color: #fff;
  border-radius: 8px;
  padding: 14px 24px;
  font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  font-size: 15px;
  font-weight: 500;
  letter-spacing: -0.005em;
  text-decoration: none;
  box-shadow: 0 12px 36px rgba(254, 81, 0, 0.45);
}
```

- [ ] **Step 2: Silence scene**

Create `components/audit-cinematic/scenes/silence-scene.tsx`:

```tsx
import { ArrowRight } from "@/components/ui/arrow-right";

type Props = {
  phase: "dot" | "line" | "cta";
  text?: string;
};

export function SilenceScene({ phase, text }: Props) {
  if (phase === "dot") return <div className="silence-dot" />;
  if (phase === "line") {
    // Split on the last sentence's period so we can italicize / orange the punchline.
    const parts = (text ?? "").split(". ");
    const head = parts[0] ? `${parts[0]}.` : "";
    const tail = parts.slice(1).join(". ");
    return (
      <div className="silence-line">
        {head} {tail && <b>{tail}</b>}
      </div>
    );
  }
  // CTA — this is the button the handoff will measure and merge into.
  return (
    <div className="silence-cta">
      <a href="#request-an-audit" data-cinematic-cta>
        Request an audit
        <ArrowRight />
      </a>
    </div>
  );
}
```

- [ ] **Step 3: Wire into dispatch**

In `components/audit-cinematic/index.tsx`:

```tsx
import { SilenceScene } from "./scenes/silence-scene";
```

Add the dispatch case:

```tsx
if (beat.scene === "silence") {
  return <SilenceScene key={key} phase={beat.phase} text={beat.text} />;
}
```

- [ ] **Step 4: Verify in browser**

Visit `/book-an-audit?intro=1`. 0:20–0:25 window:

- 0:20–0:21: a small blinking white dot center.
- 0:21–0:25: "Your leaks. **Quantified.**" line appears (punchline in orange).
- 0:22.5–0:25: orange CTA button "Request an audit ›" materializes below the line.
- At 0:23.5 the handoff stub appears (not yet a real handoff — that's Task 19).

- [ ] **Step 5: Commit**

```bash
git add components/audit-cinematic/
git commit -m "Add Act 4 silence scene (dot/line/cta)"
```

---

## Task 19: Handoff scene (camera pull-back)

The final beat — the cinematic overlay shrinks toward the static page's hero CTA position and fades into transparency. The static page's hero CTA simultaneously fades in. Net effect: camera pull-back.

**Files:**
- Create: `components/audit-cinematic/scenes/handoff-scene.tsx`
- Modify: `components/audit-cinematic/index.tsx`
- Modify: `components/audit-cinematic/cinematic.css`

- [ ] **Step 1: Handoff CSS**

Append to `components/audit-cinematic/cinematic.css`:

```css
/* Applied to .cinematic-root when the handoff scene activates. */
.cinematic-root[data-handoff="true"] {
  transition:
    transform 1500ms cubic-bezier(0.22, 1, 0.32, 1),
    opacity 1500ms cubic-bezier(0.22, 1, 0.32, 1);
}
```

The static page's hero CTA does NOT need its own fade-in. It's been mounted underneath the cinematic the whole time, covered by the full-screen `.cinematic-root`. As the cinematic shrinks during handoff, the CTA naturally becomes visible — and because the cinematic is shrinking *toward* the CTA's position, the two visually merge.

- [ ] **Step 2: Handoff scene (measures target + applies transform)**

Create `components/audit-cinematic/scenes/handoff-scene.tsx`:

```tsx
"use client";

import { useEffect } from "react";

// Reads the static page's hero CTA position and applies a transform to the
// cinematic root so it scales down toward that position over 1.5s.
// Fires once on mount (matches the 1500ms `handoff` beat duration).

export function HandoffScene() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".cinematic-root");
    const target = document.querySelector<HTMLElement>("[data-audit-hero-cta]");
    if (!root) return;

    if (!target) {
      // Fallback: scale in place + fade out.
      root.style.transform = "scale(0.6)";
      root.style.opacity = "0";
      root.dataset.handoff = "true";
      return;
    }

    // Compute translation that moves the cinematic's center to the target's center.
    const rootRect = root.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const rootCx = rootRect.left + rootRect.width / 2;
    const rootCy = rootRect.top + rootRect.height / 2;
    const targetCx = targetRect.left + targetRect.width / 2;
    const targetCy = targetRect.top + targetRect.height / 2;
    const dx = targetCx - rootCx;
    const dy = targetCy - rootCy;

    // Apply transform — scale to ~CTA-size relative to viewport.
    root.style.transform = `translate(${dx}px, ${dy}px) scale(0.04)`;
    root.style.opacity = "0";
    root.dataset.handoff = "true";
  }, []);

  return null;
}
```

- [ ] **Step 3: Wire HandoffScene into dispatch**

Update `components/audit-cinematic/index.tsx`. Add the import:

```tsx
import { HandoffScene } from "./scenes/handoff-scene";
```

Add the dispatch case alongside the other scenes:

```tsx
if (beat.scene === "handoff") return <HandoffScene key={key} />;
```

- [ ] **Step 4: Move focus after handoff completes**

Still in `index.tsx`, update `handleComplete` to move keyboard focus to the static page's hero CTA so keyboard users land cleanly:

```tsx
const handleComplete = useCallback(() => {
  const target = document.querySelector<HTMLElement>("[data-audit-hero-cta]");
  target?.focus();
  onComplete();
}, [onComplete]);
```

- [ ] **Step 5: Verify in browser**

Visit `/book-an-audit?intro=1`. Watch the full 0:00–0:25 arc end-to-end. At 0:23.5, the entire cinematic overlay should begin shrinking and translating toward the position where the static page's hero CTA sits, fading out as it shrinks. By 0:25, the overlay is gone and the static page is fully visible with the hero CTA right where the cinematic's CTA was an instant before — the camera-pull-back illusion.

Try skipping at various points (`Esc` at 0:05, 0:11, 0:18) — handoff still plays at the end and you land cleanly on the static page.

If the cinematic just fades to black instead of shrinking to a point: confirm `[data-audit-hero-cta]` is present on the hero CTA `<a>` element (Task 3) and that the handoff scene's `querySelector` finds it.

- [ ] **Step 6: Run lint + build**

```bash
npm run lint
npm run build
```

Expected: clean. Fix any type errors.

- [ ] **Step 7: Commit**

```bash
git add components/audit-cinematic/
git commit -m "Add Act 4 handoff scene with camera-pull-back into static page CTA"
```

---

## Task 20: Mobile layout overrides

All scenes need to behave differently below 768px. Same components, CSS-only adjustments + a timing scalar.

**Files:**
- Modify: `components/audit-cinematic/cinematic.css`
- Modify: `components/audit-cinematic/use-master-clock.ts` (optional — see step 1)
- Modify: `components/audit-cinematic/index.tsx`

- [ ] **Step 1: Add mobile detection + timing scalar in the cinematic**

In `components/audit-cinematic/index.tsx`, replace the static `TOTAL_MS` import usage with a runtime-scaled value:

```tsx
import { TIMELINE, TOTAL_MS, MOBILE_SCALAR, isBeatActive } from "./timeline";
```

Inside `AuditCinematic`, compute total once on mount:

```tsx
const [totalMs] = useState<number>(() => {
  if (typeof window === "undefined") return TOTAL_MS;
  return window.matchMedia("(max-width: 767px)").matches
    ? TOTAL_MS * MOBILE_SCALAR
    : TOTAL_MS;
});
```

Then change the `useMasterClock` call to use `totalMs` instead of `TOTAL_MS`:

```tsx
const { progress, jumpToEnd } = useMasterClock({
  totalMs,
  playing,
  onComplete: handleComplete,
});

const elapsedMs = progress * totalMs;
```

Important: this scales the cinematic on mobile so all beat times in `TIMELINE` automatically stretch proportionally — the same TIMELINE drives both desktop (25s) and mobile (30s).

- [ ] **Step 2: Mobile card layout overrides**

Append to `components/audit-cinematic/cinematic.css`:

```css
@media (max-width: 767px) {
  /* Cards stack vertically full-bleed on mobile — max 3 visible. */
  .intro-card {
    left: 50% !important;
    right: auto !important;
    transform: translateX(-50%) !important;
    width: min(86vw, 320px);
    max-width: none;
  }

  /* Distribute by source position so cards don't pile up at the same spot. */
  .intro-card.pos-center      { top: 20%; }
  .intro-card.pos-top-left,
  .intro-card.pos-top-right   { top: 36%; }
  .intro-card.pos-mid-left,
  .intro-card.pos-mid-right   { top: 50%; }
  .intro-card.pos-bottom-left,
  .intro-card.pos-bottom-mid,
  .intro-card.pos-bottom-right{ top: 66%; }

  /* Grid: 4 cols × 6 rows on mobile. */
  .cinematic-grid {
    grid-template-columns: repeat(4, 28px);
    grid-template-rows: repeat(6, 20px);
    gap: 4px;
  }

  .cinematic-grid-labels {
    grid-template-columns: repeat(4, 28px);
    gap: 4px;
    top: calc(50% + 78px);
  }

  /* Hide cells/labels beyond the first 4 cols when we only show 4 stores
     — the underlying TONE array is 8 cols wide. Use nth-child to drop the
     unused half-rows. */
  .cinematic-grid > div:nth-child(8n + 5),
  .cinematic-grid > div:nth-child(8n + 6),
  .cinematic-grid > div:nth-child(8n + 7),
  .cinematic-grid > div:nth-child(8n + 8) {
    display: none;
  }
  .cinematic-grid-labels > span:nth-child(n + 5) {
    display: none;
  }

  /* Tagline + overlay smaller. */
  .cinematic-tagline { font-size: 11px; padding: 0 18px; }
  .cinematic-grid-overlay { font-size: 14px; bottom: 18%; }
}
```

- [ ] **Step 3: Verify on mobile viewport**

In Chrome DevTools, switch to a mobile viewport (e.g., iPhone 14, 390×844). Visit `/book-an-audit?intro=1`.

- Timer should run from 0:00 to 0:30 (scaled).
- Cards in Act 1 should appear stacked vertically, full-bleed.
- Grid in Act 2 should be 4×6 (half the desktop grid).
- Overlay text wraps cleanly without overflow.
- Leak card stays centered, takes 90% of viewport width.
- Handoff target is the mobile-sized hero CTA — should still resolve cleanly.

- [ ] **Step 4: Commit**

```bash
git add components/audit-cinematic/
git commit -m "Add mobile layout overrides + timing scalar"
```

---

## Task 21: Polish pass — timing & visual fine-tuning

Now that all scenes exist, watch the cinematic end-to-end multiple times at desktop and mobile sizes and adjust `TIMELINE` `at`/`dur` values for any beat that feels rushed, lingers too long, or doesn't land. This is the "feel" pass.

**Files:**
- Modify: `components/audit-cinematic/timeline.ts`
- Modify: `components/audit-cinematic/cinematic.css` (if needed)

- [ ] **Step 1: Watch the whole thing 3 times back-to-back**

Visit `/book-an-audit?intro=1`. Hit refresh to replay. Note specific beats that feel off — write them down as "Beat X.Y feels [rushed / slow / unclear]".

- [ ] **Step 2: Adjust TIMELINE values for problem beats**

Edit `timeline.ts`. For each problem beat, change `at` or `dur`. Common patterns:

- A card appearing/disappearing too fast → increase its `dur` by 200-400ms.
- A beat feels like it lingers → decrease `dur`.
- A transition feels jarring → add 100-200ms overlap between adjacent beats by extending the previous beat's `dur` or moving the next beat's `at` earlier.

Do NOT change `TOTAL_MS` unless absolutely necessary (would require updating handoff math).

- [ ] **Step 3: Adjust enter/exit timing in cinematic.css if needed**

If a specific scene's CSS animation feels off (too snappy, too slow), edit the relevant keyframe duration in `cinematic.css`. Typical changes:

- `cinematic-card-enter` is 380ms — try 460ms if cards feel too snappy.
- `cinematic-cell-fly` is 1400ms — try 1100ms if the collapse drags.
- `silence-line` fade is 600ms — try 800ms if the punchline pops too fast.

- [ ] **Step 4: Re-verify**

Watch end-to-end on desktop and mobile.

- [ ] **Step 5: Commit**

```bash
git add components/audit-cinematic/
git commit -m "Polish cinematic timing + visual pacing"
```

---

## Task 22: Manual QA pass

Run through the test plan from spec §12 systematically. Fix any failures.

**Files:**
- (None expected — this is verification. Fixes go to whichever files have the bug.)

- [ ] **Step 1: Build + lint check**

```bash
npm run lint
npm run build
```

Expected: clean. Fix any issues before proceeding.

- [ ] **Step 2: Run through every test case**

Open dev server. Test each of these and note PASS / FAIL:

| # | Test | Expected |
|---|---|---|
| 1 | From `/`, slide to book → wipe → cinematic plays start to finish | Lands on static page hero CTA in focus |
| 2 | Direct visit `/book-an-audit` | Static page only, no flicker |
| 3 | Refresh during cinematic (e.g., at 0:08) | Reloads to static page only |
| 4 | `Esc` during Act 1 | Handoff plays, lands on static page |
| 5 | `Esc` during Act 2 | Handoff plays, lands on static page |
| 6 | `Esc` during Act 3 | Handoff plays, lands on static page |
| 7 | `Esc` during Act 4 | Handoff plays, lands on static page |
| 8 | Click on overlay background (not skip button) | Same as Esc |
| 9 | Click skip button | Same as Esc |
| 10 | System reduced-motion ON (DevTools → Rendering → Emulate CSS prefers-reduced-motion: reduce) → slide to book | No cinematic, static page only |
| 11 | Tab away during Act 2 for 30s, return | Cinematic resumes from where it paused, not fast-forwarded |
| 12 | Mobile viewport (≤767px) — repeat tests 1–9 | All pass on mobile |
| 13 | Mobile reduced-motion → slide to book | No cinematic |
| 14 | CPU throttle 4× (DevTools → Performance → CPU 4× slowdown) | Cinematic completes in 25s wall-clock time (frames may drop, but no scene stalls) |
| 15 | Keyboard-only navigation through static page | Skip button reachable via tab during cinematic; hero CTA receives focus when cinematic ends |
| 16 | Submit the audit request form (Name+Email only) | Inline success state appears; server log shows the request |
| 17 | Submit the form from the homepage button | Same as test 1 but cinematic should start mid-wipe; lands on form section after scrolling |

- [ ] **Step 3: Fix anything that failed**

For each FAIL: identify the bug, fix it, re-test. Commit fixes separately from the QA pass commit so each fix is reviewable.

- [ ] **Step 4: Commit the QA confirmation**

If no fixes were needed:

```bash
git commit --allow-empty -m "Manual QA pass: all 17 test cases verified"
```

If fixes were committed along the way, this final commit can be skipped.

---

## Self-review

The following checks were run against the spec after the plan was written. Any issues found were fixed inline.

**Spec coverage:**
- §1 Goals → Tasks 3-7 (static page), 8-19 (cinematic). ✓
- §2 Trigger rules → Tasks 1, 2, 10. ✓
- §3 Choreography → Tasks 9 (TIMELINE), 12-19 (scenes). ✓
- §4 Architecture → All cinematic tasks. ✓
- §5 Skip + replay → Task 11 (skip handlers); replay via re-arming from homepage handled by Tasks 2 + 7. ✓
- §6 Handoff → Task 19. ✓
- §7 Visual treatment → applied across Tasks 11-18; cinematic.css consolidated. ✓
- §8 Accessibility → Task 10 (reduced-motion + consume), Task 11 (Esc + visibility + aria-hidden + focus management in Task 19 step 4). ✓
- §9 Mobile → Task 20. ✓
- §10 Edge cases → Covered by Task 22's test matrix. ✓
- §11 Performance → No specific task; constraints baked into implementation (GPU-only properties, single rAF loop, scene mount/unmount). ✓
- §12 Test plan → Task 22. ✓

**Placeholder scan:** None found.

**Type consistency:**
- `armIntro` / `consumeIntro` signatures consistent across Tasks 1, 2, 7, 10.
- `useMasterClock` returns `{ progress, jumpToEnd, reset }` (Task 8), consumed identically in Task 11.
- `Beat` / `SceneKind` discriminated union (Task 9) — narrowed correctly in dispatch (Task 11+). Each scene component's props match the corresponding `SceneKind` variant.
- `data-audit-hero-cta` attribute consistent: set in Task 3 (`hero.tsx`), measured in Task 19, faded via `.cinematic-active` class in Tasks 19 (CSS) + 11 (TS class management).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-28-audit-cinematic.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
