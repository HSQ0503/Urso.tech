# Urso Marketing Redesign — Agent Handoff

> You are continuing an in-progress, page-by-page redesign of the Urso marketing
> site. This document is your full briefing. **Read it completely before doing
> anything.** Then do Step 0 (get context) before writing a single line of code.

---

## 0. TL;DR

We are rebuilding the Urso marketing site **section by section** to replicate the
design language of **Origin** (`useorigin.com`) — its layout, typography, and
"premium fintech" feel — but rendered in **Urso's own dark/orange brand** with
**Urso's own content**. The user (Han) sends a screenshot of an Origin section;
you rebuild the matching Urso section to an extremely high quality bar.

The recurring instruction, almost verbatim, every time: **"Same build
instructions, don't get lazy, this needs to feel premium."** Treat that as law.

---

## 1. FIRST — get context before you touch anything (MANDATORY)

Do this **before** any changes, exactly the way the previous agent did. Don't
skip it because you "already know the codebase."

### 1a. Read the Obsidian vault — understand what Urso actually is
The canonical Urso / Woof Gang product context lives in an **Obsidian vault
OUTSIDE the repo**:

```
/Users/han/Research Vault/Urso
```

Read at least: `01 - Urso/What Urso Is.md`, `The Model`, `The Operating System`,
and anything about who Urso serves and the dashboard panels. You cannot write
good copy or pick the right metrics without this. (A cheat-sheet is in §11, but
read the source — it's richer.)

### 1b. Analyze the current website frontend
Read the existing design system so you build *on top of it*, not against it:
- `app/globals.css` — the Tailwind v4 `@theme` block: semantic color tokens
  (`--color-bg`, `--color-ink`, `--color-edge`, `--color-orange`, …) and the
  keyframes/animation tokens. **This is the single source of the palette.**
- `app/layout.tsx` — fonts.
- `components/site/ui.tsx` — the typed design primitives (`Headline`, `Lede`,
  `Body`, `Eyebrow`, `Cta`, `Card`, `Container`, `Section`, …) and `cx`.
- `components/site/chrome.tsx` — nav + footer.
- `components/site/reveal.tsx`, `wipe-link.tsx`, `motifs.tsx`.
- Skim the already-redesigned sections (see §8) to match their patterns.

> The first turn of this project was literally an `/analyze` of the frontend
> design + a vault read. Replicate that. Get the context, then build.

---

## 2. The mission & design direction

**Replicate Origin (`useorigin.com`) section-by-section, on Urso's palette, with
Urso's content.** Origin is a personal-finance app; Urso is a B2B operating-
intelligence agency. So you translate:
- Origin's *layout/structure/animation* → keep it.
- Origin's *purple/blue palette* → **do NOT keep it. Use Urso orange/amber.**
- Origin's *consumer-finance content* (net worth, spending, stocks) → **replace
  with Urso's real business content** (revenue, missed calls, rebook rate,
  store comparisons, the AI analyst, weekly briefs, reviews, etc.).

---

## 3. The workflow (how each section goes)

1. **Han sends a screenshot** of an Origin section (sometimes 2–3 shots showing
   its animation states).
2. **Plan first for content-heavy sections.** Han explicitly asks: *"First plan
   what actual features we are going to display/advertise."* State the plan
   (what each card/element shows, mapped to Urso's product) in your reply, then
   build in the same turn. Don't wait for approval unless he asked — Han's style
   is "build it and I'll tell you if it's wrong."
3. **Build** the matching Urso section: new component in `components/site/`,
   wired into `app/page.tsx` (sections are inline in `page.tsx`; the heavy/
   detailed markup lives in components).
4. **Verify** (see §7): preview screenshots + `npm run lint` + `npm run build`.
5. **Report** concisely; flag any judgment calls (copy, color, omissions).
6. Han reviews and iterates. Common iterations so far: "too small / too big,
   balance it", "make it more premium", "remove this glow", "don't be lazy."

---

## 4. Non-negotiable constraints (Han's standing rules)

- **Palette: keep Urso's color scheme.** Orange `#fe5100` on near-black
  `#070707`. **Do NOT introduce new hues** (no purple/blue/teal as primary).
  When Origin uses a colored gradient, render it in **orange/amber** instead
  ("the gradient we have"). Semantic green (`--color-good`) / red are fine for
  up/down deltas. Components reference **semantic tokens**, not raw hex (the only
  accepted raw hexes are `#070707` for text-on-orange, and gradient/`rgba`
  values inside `style={}`).
- **Fonts (already swapped globally; keep them):** Geist is GONE. The system is:
  - `Fraunces` (variable, italic) = the display **serif** headlines.
  - `Inter` = body / UI **sans**.
  - `Roboto Mono` = uppercase **caps labels** (eyebrows, mono notes, buttons).
  Wired in `app/layout.tsx` → `--font-fraunces / --font-inter / --font-roboto-mono`,
  mapped in `globals.css` @theme to `font-serif / font-sans / font-mono`.
- **Tailwind:** the project is already on Tailwind v4 (CSS-first `@theme`, no
  `tailwind.config`). **Keep the semantic-token layer** and build on it. Han
  confirmed "keep current setup" — do not rip it out.
- **The orange period** is the brand signature: **section-level serif headlines
  end with `<span className="text-orange">.</span>`** (text minus the period,
  period added in orange). **Exceptions:** card-level / sub headlines drop it,
  and any headline over an orange gradient drops it (it wouldn't read).
- **Honesty in content.** Urso has no press awards and explicitly says "we won't
  show you a wall of borrowed logos." **Do not fabricate awards, press badges,
  or fake partnerships.** When Origin shows award laurels, replace them with
  Urso's *real* proof (e.g. "29 months of POS history · 4 locations · $6.8M
  validated to the penny"). Integration logos in `public/assets/` (QuickBooks,
  Square, Google Analytics, Stripe — all white monochrome) are fine to show as
  "connected tools."

---

## 5. THE PREMIUM BAR — "don't get lazy" (this is the whole game)

Han pushed back hard once with: *"It does not look as premium as theirs… the
font and the button and everything else is just worse. I feel like you can try
harder, your design is a bit lazy."* Don't earn that again. Before building any
visual section, **invoke the `frontend-design` skill** (and `ui-ux-pro-max` for
glassmorphism/color/type specifics) and actually apply them.

**Techniques that have worked (use them):**
- **Rich, cinematic gradient backgrounds**, not flat fills. Layer multiple
  radial "blooms" over a dark base (mesh-gradient style). For luminous cards,
  keep the **header band dark** so white text stays legible and put the bright
  bloom center/low.
- **Film grain overlay** on gradients — an inline SVG `feTurbulence` noise
  `background-image`, low opacity (~0.07), `mix-blend-mode: soft-light`. This is
  the "photographic texture" trick that makes gradients look expensive.
- **Frosted-glass widgets** that show **real-looking product UI** (charts,
  rows, status lists, dashboards) — NOT abstract shapes/lines. Glass recipe:
  `backdrop-blur-2xl` + a top-lit gradient `background` + an inset highlight +
  a soft drop shadow (see the `GLASS` const reused across offerings / feature
  cards).
- **Tactile raised buttons** (gradient fill + inset top highlight + soft shadow
  + `hover:-translate-y-px hover:brightness-110`), not flat outlines.
- **Soft shadows, hover lifts, subtle entrance reveals.** Real data and real
  numbers in mockups (use Woof Gang-flavored numbers).

**What to avoid:** generic flat dark cards, abstract scribble "charts", Inter-
everywhere blandness, low-effort one-liner widgets, anything that reads as
"default AI slop." If it looks like a bootstrap template, it's wrong.

---

## 6. Animation patterns (for interactive sections)

Several sections animate (typewriter input, cross-fading carousels, multi-step
briefs). Rules learned the hard way:
- **Start animations on MOUNT and loop.** Do **not** gate them on
  `IntersectionObserver` — IO fired unreliably in both the headless preview and
  (uncertain) real browsers. Looping-on-mount means it's always live when
  scrolled to.
- **Respect `prefers-reduced-motion`** → render the first/static state and stop.
- **Lint:** never call `setState` directly in an effect body
  (`react-hooks/set-state-in-effect` is an error here). Put state changes inside
  the `setTimeout`/sequence callbacks (start the sequence after an initial
  `await sleep`).
- Reusable patterns already in the codebase: the `useCarousel` cross-fade hook
  (`feature-cards.tsx`), the typed-out answer sequence (`ask-demo.tsx`), and the
  orange `Sparkle` component (exported from `ask-demo.tsx`).

---

## 7. Build & verify

- **Verification gate (must pass before "done"):** `npm run lint` **and**
  `npm run build`. Always run both.
- **Preview is ALLOWED** (Han lifted the old ban on 2026-06-14 — use it for
  visual/UI work). Use the Claude Preview MCP: `preview_start` the **`dev`**
  config in `.claude/launch.json` (it runs `npm run dev`). If a stray `next dev`
  holds `:3000`, `kill` it first (Next refuses two dev servers).
- **AGENTS.md mandate:** this is a *modified* Next.js (v16.2.6) — **read the
  bundled docs in `node_modules/next/dist/docs/` before writing Next-specific
  code** (e.g. `next/font`).
- **Preview quirks (save yourself hours):**
  - `innerText` is **unreliable** with CSS transforms (the `Reveal` wrapper uses
    `translateY`). Verify presence via computed `opacity` / `innerHTML` / the
    actual screenshot — not `innerText`.
  - **Scrolled screenshots render black.** To shoot a section deep in the page:
    isolate it by setting `display:none` on the `main > section` elements above
    it, force `.reveal` → add class `is-in`, `scrollTo(0,0)`, then screenshot
    from the top.
  - **Tall viewports + `devicePixelRatio: 2` get the screenshot scaled down.**
    To judge fine detail, capture a **single card at a narrower width** (e.g.
    760px, where `lg` grids stack to one column).
  - For an animation: isolate at top, force reveals, then poll computed
    `opacity`/DOM (not innerText) and screenshot when the target state is up.

Stack: Next 16.2.6 App Router, React 19.2, Tailwind v4, deployed on Vercel.

---

## 8. What's been built so far (homepage, top → bottom)

All in `app/page.tsx`, sections inline, each `border-t border-edge` divided:

1. **Hero** (`page.tsx` hero `<section>`, `hero-ask.tsx`) — centered, serif
   italic-first headline `Own your direction.`, sub-lines, and a **single CTA =
   the glassy "ask" input** with a self-typing/deleting placeholder (Han: "one
   big button … with text that deletes and rewrites itself"). No background photo.
2. **Nav** (`chrome.tsx`) — floating rounded glass bar, 3-col grid pinned via
   `col-start-1/2/3`, centered uppercase mono link chips, orange "Get started".
3. **Product showcase** — serif `Simplify your operation.` over
   `public/images/macbookmockup.png` (Han supplies device mockups in
   `public/images/`). Seamless dark, no divider above (it flows from the hero).
4. **"More than software." offerings** (`offerings.tsx`) — story + 3 cards
   (Connect / Find / Fix) with cinematic gradient + grain backgrounds and
   frosted-glass widgets (connected-integrations w/ white logos, a `$1,340/mo`
   leak finding, a "this week" checklist). Neutral pill CTA → `/what-we-do`.
   Han wanted a `border-t` divider above this one.
5. **"Ask anything." AI demo** (`ask-demo.tsx`) — orange sparkle + serif
   headline + a self-running demo: types a question → "Thinking…" → streams a
   formatted answer + a breakdown card, cycling 3 Urso questions.
6. **Feature cards** (`feature-cards.tsx`) — two big LUXURIOUS orange/amber
   gradient cards: LEFT "See what's moving" (dashboard instant insights,
   cross-fading) + RIGHT "Meet your analyst" (AI weekly brief, multi-step with
   progress dots + feedback thumbs).
7. **"Measure what matters." metrics** (`measure-cards.tsx`) — 2×2 grid of 4
   static dashboard widgets: Revenue (chart+tabs), Compare-by-store (current vs
   dashed-target bars), Capture & retention (rows), Reputation (2×2 store grid).
8. Below these: the **original** sections (Outcomes, The problem, What Urso does,
   What we find, How we work, Operating layer, Who it's for, final CTA) — these
   are the *old* design and have **not yet been re-styled** to the new language.

Reusable bits: `Sparkle` (from `ask-demo.tsx`), `GLASS`/`GRAIN` consts (copied
in offerings/feature-cards — consider extracting if you touch both), the tactile
button style (inline in `page.tsx`), the `Reveal` scroll-fade.

---

## 9. What's next (likely)

- Remaining homepage lower sections (Outcomes → final CTA) may need to be
  brought up to the new design language for consistency — they currently use the
  old primitives. Ask Han whether to refresh them.
- Other marketing pages: `/what-we-do`, `/how-it-works`, `/capabilities`,
  `/what-we-find`, `/contact` — when Han sends reference sections.
- Possible cleanup: factor out the duplicated `GLASS` / `GRAIN` / tactile-button
  styles into shared helpers.

---

## 10. Key files

| Path | What |
|---|---|
| `app/page.tsx` | Homepage; new sections inline near the top |
| `app/globals.css` | `@theme` tokens (palette, fonts, animations) — the palette source |
| `app/layout.tsx` | Fraunces / Inter / Roboto Mono font setup |
| `components/site/ui.tsx` | Typed primitives + `cx` |
| `components/site/chrome.tsx` | Nav + footer |
| `components/site/reveal.tsx` | Scroll-fade wrapper (client) |
| `components/site/hero-ask.tsx` | Hero typewriter ask input |
| `components/site/offerings.tsx` | "More than software" 3 cards |
| `components/site/ask-demo.tsx` | "Ask anything" AI demo + exported `Sparkle` |
| `components/site/feature-cards.tsx` | 2 gradient feature cards + `useCarousel` |
| `components/site/measure-cards.tsx` | 4 dashboard-metric cards |
| `public/images/` | Han drops device mockups here |
| `public/assets/` | White-monochrome integration logos |
| `/Users/han/Research Vault/Urso` | The Obsidian product vault (read first) |

There's also a running internal memory at the agent's memory dir
(`urso-hero-redesign.md`) tracking every section + decisions.

---

## 11. Urso product context (cheat-sheet — but still read the vault)

Urso = a **data-aggregation + solutions agency** for **people-based, multi-
location businesses** (pet care, clinics, med spas, fitness, home services, etc.;
flagship client **Woof Gang**, a 4-location pet-care group with ~29 months /
~$6.8M of validated POS history). Urso connects the data scattered across the
business (POS, books, phones, booking, reviews) into **one operating system**,
**finds where money is leaking — sized in dollars**, then **fixes it with the
client's team on a monthly retainer**. Tagline truth: *"You're not buying
software. You're hiring the team that runs it."* The **AI layer** ("Ask AI" /
urso.ai analyst — a true data analyst that produces weekly briefs) is a headline
differentiator. Dashboard journey panels: Findability → Capture → Convert →
Retain → Reputation → Money. **Iron rule:** every metric is defined once and
means the same thing across all stores. Founders: **Han** (technical/build) +
**Guga** (sales/relationships).

---

## 12. The user (Han) — working style

- Direct, fast, no filler. Don't over-explain. Don't ask 5 clarifying questions
  — make the sensible call, state it, and proceed; he'll correct you.
- He iterates on visuals quickly and bluntly ("too small", "remove that glow",
  "it's lazy"). Take it literally and fix it well.
- He cares a lot about **premium feel** and brand consistency.
- He's a strong TS/Next/Tailwind dev — match his code style: TypeScript, `type`
  over `interface`, minimal/clear code, comment *why* not *what*, Tailwind,
  App Router, server components where possible.

Now: do §1 (read the vault + analyze the frontend), wait for Han's next
reference screenshot, plan, and build it **premium**.
