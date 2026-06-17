# Urso Dashboard Redesign — Agent Handoff (System Instructions)

> Companion to `REDESIGN-HANDOFF.md` (which governs the **marketing site**). This
> doc governs bringing the **dashboard** (`app/dashboard/*`, `components/dashboard/*`)
> up to the premium, luxury feel of the redesigned homepage — **page by page.**
> Read it completely before touching a dashboard surface. Then do §6 (foundations)
> before redesigning any individual page.

---

## 0. TL;DR

The marketing site was rebuilt into a premium **"Origin fintech editorial"** language
(Fraunces serif, italic-first headlines, the orange period, cinematic layered
gradients + film grain, frosted glass). The **dashboard was left behind** on the older
Geist-era **"operating system"** look (Inter sans + mono labels, flat hairline cards) —
see `ui.tsx`, whose code comments still literally say *"Geist"*.

**Mission:** translate the homepage's luxury into the dashboard, **without sacrificing
the legibility a dense data product needs.** Same law as marketing:
**_"Don't get lazy. This needs to feel premium."_**

---

## 1. The governing philosophy — "Premium operating system"

A landing page is **scrolled**; a dashboard is **read**. Do not blind-copy marketing
devices onto data. The translation rule:

- **Editorial luxury at the chrome** — page headers, hero/summary moments, empty
  states, feature cards, AI/analyst cards, section openers, the one big single stat →
  **Fraunces serif, the orange period, layered depth, glass, refined motion.**
- **Uncompromised legibility in the data** — KPI grids, tables, dense rows, charts →
  **stay sans + tabular numerals + mono labels + hairline structure.** Here, premium
  means *crisp, aligned, quiet* — never decorated.
- Net feel: the homepage's **calmer, working sibling.** Same family, same materials,
  tuned for density and daily use.

The **Brand Packet §16** (Product/UI rules) remains the **floor**: dense, quiet,
trustworthy; orange ≤ 10%; AI insight = *2px orange left rule + mono "INSIGHT" label +
plain finding + action*, with **no sparkles, robot icons, or chat bubbles.** We are
raising the ceiling on craft — not abandoning product discipline.

---

## 2. The hard constraint the homepage never had: **LIGHT MODE**

The dashboard is the **only** surface that supports light mode — `.theme-scope` in
`app/globals.css` flips every semantic token, toggled by `components/dashboard/theme-toggle.tsx`.
The homepage's signature devices are inherently **dark** (white-on-dark frosted glass,
soft-light grain, dark cinematic gradients). Therefore:

- **Every premium device must work in BOTH themes** — re-author it token-driven, or
  branch on theme, or scope a light-mode equivalent. **Never hardcode** `rgba(255,255,255,…)`
  glass or `#0c0c0c` surfaces in the dashboard — drive from tokens.
- A dark cinematic gradient does **not** become a good light treatment by lowering its
  opacity. Light mode gets its own restrained equivalent — a soft warm tint, a hairline,
  the packet's subtle light shadow `0 1px 2px rgba(15,18,22,0.06)`.
- **"Done" is not done until verified in light *and* dark.** This is the #1 way this
  redesign reads as broken if rushed.

---

## 3. The design language — element by element (now → target)

| Element | Now (OS look) | Target (premium) |
|---|---|---|
| **Page title** (`PageHeader` h1) | Inter `font-medium` | **Fraunces serif** (italic-first optional) + **orange period**; mono eyebrow above |
| **Eyebrow / section index** | mono uppercase | **keep** — already on-language (matches homepage mono caps) |
| **Hero / single big stat** | Inter 40px | **Fraunces** for the one hero number; delta chip stays |
| **KPI-grid values** | Inter tabular | **keep** Inter/sans tabular — alignment + scan speed win over serif here |
| **Tables / rows** | sans tabular, hairline | **keep**; refine — tighter rhythm, better hover, mono column heads |
| **Data cards** | `rounded-2xl border-edge bg-panel` | **keep flat**; just polish spacing + hover |
| **Hero / feature / AI cards** | flat panel | **glass + gradient bloom + grain** (authored for both themes) |
| **Charts** | quiet gray/white + 1 orange focal | **keep packet §11**; add polish (area gradients, smoother motion), stay quiet — no rainbow, no 3-D |
| **AI / analyst cards** | inconsistent | **2px orange left rule + mono "INSIGHT" label**, elevated with restrained depth — no sparkles/robots/bubbles |
| **Section dividers** | hairline | hairline or mono eyebrow; **never** decorative waves/blobs |
| **Motion** | minimal | `Reveal`-style fade + 12px translate, staggered, 200–400ms ease-out, reduced-motion respected; **never** block or delay data |
| **Depth** | borders only | borders stay primary; add **restrained** elevation (inset top highlight + soft shadow) only on raised/featured surfaces |
| **Empty / loading states** | plain | a premium moment — serif line + subtle bloom + a clear next action ("what will appear and how to get it") |

---

## 4. Tokens & color (unchanged rules, applied harder)

- Reference **semantic tokens only** (`bg`, `panel`, `edge`, `ink`, `ink-dim`,
  `orange`, `surface`, `raise`, `track`, `good`, …) — never raw hex except inside
  `style={}` gradient/rgba values. The token layer in `globals.css` is the single
  source; both themes flow from it.
- **Orange is the one signal**, ≤ 10% of any view: focal series, the period, an
  insight marker, the primary action. Green `--color-good` for healthy deltas, orange
  for down-deltas (existing `Delta` convention — keep it).
- The legacy blue/navy report palette (`app/reports/design-tokens.css`) is **off-limits**
  — it predates this identity.

---

## 5. The premium bar — "don't get lazy"

Techniques that make it feel expensive (use them, on-theme):
- **Layered gradient blooms, not flat fills** — but only on chrome/hero surfaces.
- **Film grain** on those gradients (inline `feTurbulence`, low opacity, soft-light).
- **Frosted glass showing real product UI** — real numbers, never lorem charts.
- **Tactile controls** — gradient fill + inset highlight + soft shadow + hover lift.
- **Soft entrance reveals, staggered.**

Dashboard-specific additions:
- **Never trade legibility for decoration. The data, crisp and aligned, *is* the luxury.**
- Density is a feature here, not a bug — calm comes from rhythm and hairlines, not from
  emptying the screen.

Avoid: generic flat cards, decorated tables, serif numerals in dense grids, anything
that reads as a template or "AI slop," any device that only works in one theme.

---

## 6. Build the foundations FIRST (before any page)

Do not re-copy `GLASS`/`GRAIN` per file (the marketing side already has that debt).
Build a small shared kit so every page composes from one vocabulary:

1. **`components/dashboard/surface.ts(x)`** (or extend `ui.tsx`): **theme-aware** `GLASS`,
   `GRAIN`, gradient/bloom helpers, and elevation presets — each returning correct values
   for **light + dark**.
2. **Upgrade `PageHeader`** (in `ui.tsx`) → serif title + orange period + mono eyebrow.
   One change re-skins every page's header consistently.
3. **A dashboard `Reveal`** — reuse `components/site/reveal.tsx` or port it.
4. Fraunces is **already loaded globally** (`app/layout.tsx`) and mapped to `font-serif`
   in `@theme` — just use `font-serif`. No new font wiring.

Foundations land first; pages then inherit the new look for free.

---

## 7. Verify (gate — must pass before "done")

- `npm run lint` **and** `npm run build` — both, always.
- **Preview in BOTH themes** (use the in-app toggle) at a desktop width **and** a narrow
  width. Screenshot proof of each. Preview is allowed (Han lifted the ban 2026-06-14).
- **Invoke `frontend-design`** (and `ui-ux-pro-max` for glass/color/type specifics)
  **before building each page**, and actually apply them.
- Per `AGENTS.md`: this is a modified Next 16.2.6 — read `node_modules/next/dist/docs/`
  before writing Next-specific code.

---

## 8. Page-by-page order (proposed)

1. **Foundations** (§6) — shared kit + `PageHeader`. Unblocks everything.
2. **Home** — `owner-home.tsx` / `manager-home.tsx` + `app/dashboard/page.tsx`. First
   impression; sets the tone for the rest.
3. **Revenue** — chart-heavy; proves the "elevated but quiet data-viz" pattern.
4. **Compare / Stores** — multi-store tables + comparison bars.
5. **Customers / Reviews** — lists + the reputation grid.
6. **Actions / Brief / Analyst (AI)** — the differentiator; locks the INSIGHT-card language.
7. **Team / Events / Products** — remaining surfaces.
8. **Sweep** — skeletons/loading + empty states + a full both-theme audit.

Each page: plan what changes (in one line), build, verify both themes, report, iterate.

---

## 9. Key files

| Path | What |
|---|---|
| `app/globals.css` | Token system + `.theme-scope` light mode — the palette source for both themes |
| `app/dashboard/layout.tsx` | Auth gate → renders `<Shell>` |
| `components/dashboard/shell.tsx` | App frame: sidebar, topbar, page chrome, theme toggle |
| `components/dashboard/ui.tsx` | Dashboard primitives (`Card`, `PageHeader`, `BigStat`, `Delta`, `Micro`, `Segmented`, …) — extend here |
| `components/dashboard/charts.tsx` | All Recharts data-viz — keep packet §11 quiet |
| `components/dashboard/owner-home.tsx` / `manager-home.tsx` | The home dashboards |
| `components/dashboard/analyst-console.tsx` / `ask-ai.tsx` / `actions-client.tsx` | AI surfaces — the INSIGHT language |
| `components/dashboard/theme-toggle.tsx` | Light/dark toggle (the both-theme constraint) |
| `components/site/forecast.tsx` / `feature-cards.tsx` / `offerings.tsx` | Marketing `GLASS`/`GRAIN`/gradient recipes to adapt (theme-aware) |
| `REDESIGN-HANDOFF.md` | The marketing-site companion doc |

---

## 10. Working style (Han)

Direct, fast, no filler. Build it — don't ask five questions; make the sensible call,
state it, proceed; he'll correct bluntly ("too big", "remove that glow", "it's lazy").
He cares about **premium feel** and **brand consistency**. Match his code: TypeScript,
`type` over `interface`, minimal/clear, comment *why* not *what*, Tailwind, App Router,
server components where possible. Both themes, every time.
