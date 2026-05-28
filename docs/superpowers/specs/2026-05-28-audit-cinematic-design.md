# Audit Cinematic — Design Spec

**Date:** 2026-05-28
**Owner:** Han
**Status:** Approved — ready for implementation planning

A 25-second cinematic intro that plays when a visitor arrives at `/book-an-audit` via the homepage slider. The cinematic explains the audit in four acts (Problem → Why → What we do → Request) and resolves directly into the static landing page beneath it.

The static page itself is also being built in the same effort (per the prior content brief). This spec covers the cinematic and how it integrates with the static page; the static page's section copy and form spec are defined separately in the content brief Han provided.

## 1. Goals & non-goals

### Goals

- Deliver a genuinely cinematic 25-second intro that feels intentional and on-brand for urso.tech (terse, dark, single-orange, type-and-UI-driven).
- Make the "leaks" concrete and visual — render the actual notifications, reviews, abandoned bookings, etc. that the content brief names.
- Tie the cinematic tightly to the slider gesture so it feels like a *reward for committing*, not an interstitial.
- Hand off seamlessly to the static page — the last frame of the cinematic is the first frame of the page.
- Zero new runtime dependencies.

### Non-goals

- No sound, no music, no SFX (v1).
- No replay UI on the static page. To see it again, re-trigger from the homepage slider.
- No A/B variants of the cinematic.
- The static page itself (copy, form, sections) is in scope only insofar as the cinematic needs to integrate with it; the page content follows Han's separately-provided content brief.
- No analytics events for cinematic completion/skip in v1 (can add later).

## 2. Trigger & visibility rules

The cinematic plays **only** when the visitor reaches `/book-an-audit` via the homepage slider (`SlideToBook`). All other arrivals (direct URL, back-button, refresh during cinematic, reduced-motion preference) bypass it.

Mechanism: a module-level flag, set by the slider just before navigation, consumed once by the audit page on mount.

```ts
// lib/intro-state.ts
let pendingIntro = false;
export function armIntro() { pendingIntro = true; }
export function consumeIntro() {
  const was = pendingIntro;
  pendingIntro = false;
  return was;
}
```

- `SlideToBook` calls `armIntro()` immediately before `triggerWipe('/book-an-audit')`.
- `AuditPageGate` (the client component wrapping the audit page) calls `consumeIntro()` once in a `useEffect`, then renders `<AuditCinematic>` as an overlay if it returned `true`.
- Refresh during cinematic → flag resets to `false` → next load shows static page only. This is intentional ("refresh = get me out").
- `prefers-reduced-motion: reduce` → `consumeIntro()` is short-circuited to `false`. The cinematic never renders for these users.

This matches the existing `triggerWipe` idiom in `components/wipe-transition.tsx:9-17` and keeps the URL clean.

## 3. Choreography (the 25-second arc)

The cinematic follows a **cacophony → clarity** arc: it builds visual chaos in Act 1, resolves the chaos into structure in Act 2, narrows to a single takeaway in Act 3, and ends in silence with a single CTA in Act 4.

### Act 1 — Problem (0:00 — 0:07) — cacophony

| Beat | Time | What happens |
|---|---|---|
| 1.1 | 0:00–0:01 | Black `#070707`. Mono cursor blinks bottom-left. Top-left act tag fades in (`Act 01 · Problem`). Top-right timer starts ticking. Bottom-right `esc · skip` fades in to ~60% opacity. |
| 1.2 | 0:01–0:02 | First card center: **"Missed call · 11:42pm · +1 (407) 555-0142 · No callback queued."** Slide-from-below + scale 0.96→1, 380ms. Holds in silence. |
| 1.3 | 0:02–0:03 | Second card top-right: Google review, 1 orange star + 4 dim stars, **"Nobody picked up."** ~250ms after card 1. |
| 1.4 | 0:03–0:04 | Card 3 lower-right: **"Booking · step 3/5 · Abandoned · field 'phone'"**. Card 4 top-left: **"After-hours queue · 14 calls · 0 returned."** |
| 1.5 | 0:04–0:06 | Pace accelerates (~180ms per card). Cards 5–9: schema citation broken (3 stores), map pin wrong address, click-to-call missing (4 stores), 2-star review (9 days no response), mobile CLS 0.31. Some overlap. Orange flashes from alert-flagged cards. |
| 1.6 | 0:06–0:07 | Tagline cuts through bottom-center, mono small: **"None of it shows up in your POS."** Cards continue holding. Peak density. |

### Act 2 — Why (0:07 — 0:13) — coherence

| Beat | Time | What happens |
|---|---|---|
| 2.1 | 0:07–0:09 | All ~9 cards begin moving simultaneously. Not exiting — *reorganizing*. They shrink to small cells (22×16px) and FLIP-animate to grid positions. Motion trails (dashed) hint at trajectory. |
| 2.2 | 0:09–0:11 | Grid resolves: **8 stores (columns) × 6 leak types (rows)**. Hot cells orange, warm cells half-orange, cool cells dim. Column labels fade in: `S01 · S02 · ... · S08`. Subtle background grid pattern fades up. |
| 2.3 | 0:11–0:13 | Two columns pulse orange one final time. Text overlay bottom: **"Your best store and your worst store — running different businesses."** "Best" and "worst" pointer marks above S01 (or similar) and S06. |

### Act 3 — What we do (0:13 — 0:20) — clarity

Three sub-beats, each ~2.3 seconds, crossfading.

| Beat | Time | What happens |
|---|---|---|
| 3.1 | 0:13–0:15 | Grid recedes (scale 0.8, fade). Eyebrow top-left: **"01 · We dig before we talk."** A phone-test log card slides in from the right with rows ticking up: `After-hours test · 11:42pm · ring count: 14 · answered: no`, `Citation parity · 5/8 stores`, `Booking flow walk-through · complete`. |
| 3.2 | 0:15–0:17 | Crossfade. Eyebrow: **"02 · We stand up your operating system."** A clean dashboard-style panel appears with the audit-cta tab-strip pattern (`POS · Google · Books · Calls`). One row of metrics ticks up calmly. |
| 3.3 | 0:17–0:19 | Crossfade. Eyebrow: **"03 · We hand you the one fix worth making."** Single large card center with: an orange uppercase mono label (`03 · The one fix worth making`); a display-size `$4,180/mo` price line in white, `font-size: clamp(32px, 5vw, 44px)`, `tracking-[-0.03em]`; a horizontal rule; three label/value rows (`Leak: After-hours missed calls`, `Fix: SMS callback queue · on-call rotation`, `Measure: Missed → returned · 30-day window`). Labels in mono dimmer, values in sans-serif white. |
| 3.4 | 0:19–0:20 | Card holds. Background quiets (slight darken to `#040404`). Whole frame calm. |

### Act 4 — Request (0:20 — 0:25) — silence

| Beat | Time | What happens |
|---|---|---|
| 4.1 | 0:20–0:21 | Leak card dissolves (opacity fade, no movement). Screen empty except a mono dot blinking center. |
| 4.2 | 0:21–0:23 | Line appears centered, sans-serif `clamp(28px, 5vw, 44px)`, `tracking-[-0.03em]`: **"Your leaks. _Quantified._"** ("Quantified" in orange.) |
| 4.3 | 0:23–0:24 | Orange button materializes below the line: **"Request an audit ›"**. Subtle orange glow shadow. |
| 4.4 | 0:24–0:25 | **Handoff beat.** See §6. |

### Persistent UI (every frame, all 25 seconds)

- **Top-left:** act tag — `Act 01 · Problem`, mono, dimmer text. Crossfades on act transitions.
- **Top-right:** timer — `00:14`, mono, orange. Ticks per real time.
- **Bottom-right:** `esc · skip`, mono, very dim. Always clickable; `Esc` key also works.

## 4. Architecture

### Trigger & gating

```
SlideToBook (homepage)
  ↓ user completes slide
armIntro()                  ← sets module-level flag
triggerWipe('/book-an-audit')  ← existing wipe runs as before
  ↓ Next.js navigates
AuditPageGate (client)
  ↓ useEffect on mount
consumeIntro()              ← reads + clears flag
  ↓ if true && motion not reduced
<AuditCinematic />          ← renders as fixed overlay over static page
```

### Master clock

A single hook drives all timing:

```ts
useMasterClock(totalMs: number, opts: {
  playing: boolean;
  onComplete: () => void;
}): {
  progress: number;        // 0..1
  jumpToEnd: () => void;
  reset: () => void;
}
```

- `requestAnimationFrame` loop. Tracks elapsed ms from a `startedAt` timestamp.
- `progress = clamp(elapsed / totalMs, 0, 1)`.
- When `progress === 1`, calls `onComplete` and stops the loop.
- `jumpToEnd()` is what skip handlers call — sets `progress` to `0.94` (so the handoff beat still plays its 1.5s transition).
- `playing: false` pauses (useful for `document.hidden` — if the user tabs away, we pause; resume when they come back).

### Timeline data structure

```ts
// timeline.ts
type Beat = {
  at: number;       // ms from start
  dur: number;      // ms duration of this beat's component
  scene: SceneKey;  // which component to render
  data?: unknown;   // optional per-beat data (card text, etc.)
};

// Illustrative — full beat list per §3.
// `dur` is how long the scene component stays mounted, NOT how long its
// enter animation runs; scenes that "hold" stay mounted for their full
// hold duration (e.g. the first card holds from 0:01 to 0:07, dur 6000).
export const TIMELINE: Beat[] = [
  { at: 0,    dur: 25_000, scene: 'establish' },          // persistent
  { at: 1000, dur: 6000,   scene: 'card', data: { id: 'missed-call', position: 'center', kind: 'alert', /* ... */ } },
  { at: 2000, dur: 5000,   scene: 'card', data: { id: 'review-1star', position: 'top-right', /* ... */ } },
  // ... — full list lives in timeline.ts during implementation
];

export const TOTAL_MS = 25_000;
export const MOBILE_SCALAR = 1.2;
```

The TIMELINE is the **single source of truth**. Tweaking pacing = editing `at`/`dur` values; tweaking content = editing the `data` fields. No animation timing lives outside this file.

### Component tree

```
app/book-an-audit/page.tsx                    [server]
└── <AuditPageGate>                            [client]
    ├── <AuditCinematic />                     [client, conditional]
    │   ├── <ActTag/>                          top-left, reads progress
    │   ├── <Timer/>                           top-right, reads progress
    │   ├── <SkipControl onSkip={jumpToEnd}/>
    │   └── {TIMELINE.map(beat => active beats render scene components)}
    │       <CardScene data={...}/>            ← the reusable card primitive
    │       <GridScene/>                       ← Act 2 grid
    │       <ProcessStepScene step={1|2|3}/>   ← Act 3 crossfades
    │       <SilenceScene phase="dot|line|cta"/> ← Act 4
    │       <HandoffScene/>                    ← Act 4 final beat
    └── <AuditPage />                          static page, always mounted underneath
```

`AuditCinematic` reads master progress, iterates TIMELINE, mounts only the scenes whose windows contain the current progress. Each scene receives a `localProgress: 0..1` and renders its own CSS keyframe animation, triggered on mount.

### File layout

```
lib/
  intro-state.ts                ~10 lines
components/
  audit-cinematic/
    index.tsx                   AuditCinematic    ~140 lines
    audit-page-gate.tsx         AuditPageGate     ~40 lines
    timeline.ts                 TIMELINE + types  ~120 lines
    use-master-clock.ts         hook              ~50 lines
    cinematic.css               keyframes + utils ~250 lines
    ui/
      act-tag.tsx                                 ~25 lines
      timer.tsx                                   ~25 lines
      skip-control.tsx                            ~35 lines
      intro-card.tsx            reusable card     ~50 lines
    scenes/
      establish-scene.tsx                         ~40 lines
      card-scene.tsx            wraps intro-card  ~30 lines
      collapse-scene.tsx        FLIP transition   ~80 lines
      grid-scene.tsx            Act 2 grid        ~90 lines
      process-step-scene.tsx    Act 3 crossfades  ~70 lines
      silence-scene.tsx         Act 4 phases      ~60 lines
      handoff-scene.tsx         camera pull-back  ~80 lines
app/book-an-audit/
  page.tsx                      now renders real static page + <AuditPageGate>
```

### Files changed (not added)

- `components/hero/slide-to-book.tsx` — add `armIntro()` call right before `fireWipe()` inside `fireWipe` (or right at the moment confirmation fires).
- `app/book-an-audit/page.tsx` — replace placeholder with the real static page (built per content brief), wrapped in `<AuditPageGate>`.

### Hand-off integration with `WipeTransition`

The existing wipe transition still runs as the route changes. The cinematic mounts *after* the wipe's `uncovering` phase completes — which means there's a clean handoff:

```
slider released → wipe covers (460ms bloom or 360ms slide)
              → Next.js renders /book-an-audit
              → wipe uncovers (520ms)
              → cinematic master clock starts (progress 0)
```

No collision. The wipe is the outer transition; the cinematic begins on the clean revealed page.

## 5. Skip & replay UX

### Skip

All three trigger `jumpToEnd()`:

1. **`Esc` key** — global keydown listener on `document` while cinematic is mounted.
2. **Click on overlay background** — clicks land on the cinematic overlay's outer div; interactive elements (skip button, future CTA in Act 4) stop propagation.
3. **`esc · skip` button** bottom-right.

`jumpToEnd()` sets master progress to `0.94`. This lands in the middle of the Act 4 silence phase, just before the handoff beat — so the handoff still plays and the user lands on the static page through the choreographed transition, not a hard cut. The skip costs the user ~1.5 seconds of unavoidable handoff, which is fine.

### Replay

No replay button on the static page. The cinematic is consumed once per session. To replay, user navigates back to `/` and slides again. This matches Han's "no clutter" preference and the brief's "single CTA" rule for the audit page.

## 6. The handoff (Act 4 final beat, 0:24–0:25)

The hardest beat and what makes the experience feel like a single continuous frame instead of "intro ended, page started."

### Approach: camera pull-back

The cinematic overlay's wrapper transforms while the static page CTA crossfades in:

```
At progress 0.94 (kicked by skip or natural timing):
  1. Capture the position of the static page's hero CTA via getBoundingClientRect.
  2. Compute a transform that scales the cinematic overlay down and translates it
     so its center aligns with the static page CTA's center.
  3. Apply: transform: scale(0.4) translate(targetX, targetY); transition 1.5s
     cubic-bezier(0.22, 1, 0.32, 1).
  4. Simultaneously: cinematic's own background opacity fades from 1 to 0.
  5. Static page CTA fades in (it was opacity 0) over 600ms, starting at 700ms
     into the handoff.
  6. At 1.5s, the cinematic overlay is removed from the DOM.
```

Net effect: user perceives the camera pulling back from a closeup of the CTA, revealing the full static page around it. The CTA itself is the seam — the cinematic's CTA visually merges into the static page's CTA.

### Fallback if the static page hero CTA isn't measurable

If `getBoundingClientRect()` returns 0 width (page not rendered for some reason) or the CTA element isn't present, fall back to a simple `scale(0.6)` + fade-to-transparent in place. The user still gets a graceful exit; just not the camera-pull-back effect. Should never happen in practice because the static page is always mounted underneath.

## 7. Visual treatment

All values consistent with the existing site's design tokens (`app/globals.css:3-29`, `:root` definitions).

### Cards (Act 1, Act 3)

- Background: `rgba(255,255,255,0.025)` (panel token)
- Border: `1px solid rgba(255,255,255,0.08)` (edge token); alert variants use `rgba(254,81,0,0.35)`.
- Border-radius: `7px` for notification cards, `8px` for the Act 3 leak card.
- Padding: `12px 14px` standard; `16px 18px` for the leak card.
- Type stack:
  - Header / meta line: `font-mono`, `9px`, `letter-spacing: 0.12em`, `uppercase`, `text-ink-dimmer` (or orange for alerts).
  - Body: `font-sans`, `14px`, `text-ink`, `letter-spacing: -0.005em`.
- Card enter animation: opacity 0→1 + `translateY(8px)→0` + `scale(0.96)→1`, 380ms `cubic-bezier(0.16, 1, 0.3, 1)`. Matches the existing `.panel-fade-in` keyframe (`globals.css:104-110`).
- Card exit (Act 2 collapse): opacity → 0.95 + simultaneous `scale(0.05)` + position FLIP to grid coordinate, 600ms `cubic-bezier(0.16, 1, 0.3, 1)`.

### Act 2 grid

- 8 columns × 6 rows on desktop, 4 columns × 6 rows on mobile.
- Cell size: `clamp(20px, 4vw, 32px)` square.
- Gap: `3px`.
- Hot cell: `bg-orange` (`#fe5100`) + `box-shadow: 0 0 8px rgba(254,81,0,0.5)`.
- Warm cell: `bg: rgba(254,81,0,0.4)`.
- Cool cell: `bg: rgba(255,255,255,0.06)`.
- Background grid pattern fades in during Act 2: `linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)` at 32px tile.

### Act 4 silence

- Background `bg-bg` (`#070707`) darkens slightly to `#040404` for the last 4 seconds.
- "Your leaks. Quantified." — `clamp(28px, 5vw, 44px)`, font-medium, `letter-spacing: -0.03em`. "Quantified" in `text-orange`.
- CTA reuses existing `<Button variant="primary" icon={<ArrowRight />}>` from `components/ui/button.tsx`.

### Persistent UI

- Act tag: `font-mono`, `11px`, `tracking-[0.18em]`, `uppercase`, `text-ink-dimmer`. Crossfades 300ms on act change.
- Timer: `font-mono`, `11px`, `tracking-[0.16em]`, `text-orange`. Updates per RAF tick, formatted `MM:SS`.
- Skip control: `font-mono`, `9px`, `tracking-[0.14em]`, `uppercase`, `text-ink-dimmer`. Hover → `text-ink-dim`. Includes a small `›` chevron after "skip".

## 8. Accessibility

### Reduced motion

`@media (prefers-reduced-motion: reduce)` → cinematic does not render at all. The `consumeIntro()` call is short-circuited at the gate level so we don't even mount `AuditCinematic`. Users land directly on the static page.

This matches the existing pattern (`globals.css:112-116, 242-246, 340-344`).

### Keyboard

- `Esc` skips at any time.
- The `skip` button is `tabIndex={0}`, focusable, has visible focus ring (`focus-visible:ring-2 focus-visible:ring-white/40`, matching the slider's pattern).
- All other cinematic content is `aria-hidden="true"`.

### Screen readers

- The cinematic overlay carries `aria-hidden="true"` on its root. It is a purely visual experience; assistive tech reads the static page underneath, which is fully semantic and complete.
- Skip control has `aria-label="Skip intro"`.

### Visibility / tab-away

- When `document.visibilityState === 'hidden'`, master clock pauses. Resumes when visible again. Prevents the cinematic from running while the tab is in the background.

## 9. Mobile variant (≤767px)

Same components, same TIMELINE, three deltas:

1. **Layout overrides via CSS breakpoints.** Card positions in Act 1 stack vertically (max 3 visible at a time). Cards that would have appeared simultaneously instead enter sequentially with overlapping exits. Grid in Act 2 is 4 cols × 6 rows. Process step cards in Act 3 are full-bleed swipe-in from right.
2. **Timing scalar.** `const SCALAR = isMobile ? 1.2 : 1.0` applied to `TOTAL_MS` and used by the master clock. Mobile total: 30 seconds. Gives each card more time to be read.
3. **Handoff target.** `getBoundingClientRect` on the mobile-sized hero CTA. Same camera-pull-back, different target.

Detected once on mount via `window.matchMedia('(max-width: 767px)').matches`. Stored in state at mount time; does not respond to resize during playback (cinematic is short enough that this edge case isn't worth handling).

## 10. Edge cases & guarantees

- **Direct URL hit (`/book-an-audit`)** → static page only. No cinematic. Verified by `consumeIntro()` returning `false`.
- **Slider triggered, then user hits browser back, then forward** → `pendingIntro` is already false (consumed on first arrival). Static page only on the second visit. Correct behavior.
- **Refresh during cinematic** → module state resets, page reloads showing static page only. Correct.
- **Reduced motion** → static page only.
- **Tab away mid-cinematic** → master clock pauses on `visibilitychange`, resumes when visible. Time elapsed in background does not advance the cinematic.
- **Cinematic completes naturally** → handoff beat plays, overlay unmounts, focus is moved to the static page hero CTA for keyboard users.
- **Cinematic is skipped via Esc/click/button** → master clock jumps to `0.94`, handoff beat still plays. Same focus management.
- **Slow device that drops below 30fps during cacophony** → progress still advances by wall-clock time (RAF gives `timestamp`), so the timeline never stalls. Frames may drop visually but timing remains correct.

## 11. Performance

- All animations are GPU-accelerated CSS properties only (`transform`, `opacity`, `box-shadow`). No layout-affecting properties animated.
- `will-change: transform, opacity` applied only during active scenes; removed when scene unmounts.
- Master clock runs at native frame rate via RAF. One rAF loop for the whole cinematic, not per-scene.
- Scene components mount/unmount based on TIMELINE windows — DOM never has more than ~12 scene-level elements simultaneously (Act 1 peak).
- Static page mounts immediately under the cinematic (not lazy-loaded) so the handoff has its CTA position ready to measure. Cost: static page React work happens during the cinematic instead of after; net experience is identical but smoother handoff.

## 12. Test plan

Manual verification (since this is a visual cinematic, automated visual regression is out of scope for v1):

- [ ] Slide to book from homepage → cinematic plays in full → lands on static page hero CTA.
- [ ] Direct visit to `/book-an-audit` → static page only, no flicker.
- [ ] Browser refresh mid-cinematic → reloads to static page only.
- [ ] `Esc` during Acts 1, 2, 3, 4 → handoff beat plays, lands on static page.
- [ ] Click outside skip button on overlay → same as Esc.
- [ ] Skip button click → same as Esc.
- [ ] System reduced-motion enabled → no cinematic, static page only.
- [ ] Tab away during Act 2, return after 30s → cinematic resumes from where it paused.
- [ ] Mobile (`<768px`): all of the above, plus correct mobile layout for each act.
- [ ] Throttle CPU to 4× slowdown → timeline still completes in 25s, frames may drop but no scene stalls.
- [ ] Keyboard-only navigation → can reach + activate skip button via tab; static page hero CTA receives focus on cinematic end.

## 13. Out of scope (v1) / follow-up ideas

- Sound design (deferred per §1 non-goals).
- Analytics: tracking cinematic completion rate, skip points, time-to-skip. Could inform whether to shorten Act 1 in v2.
- A/B variants by audience (different "leak" examples per detected segment).
- Replay button on the static page.
- Custom cards based on the visitor's actual stores (would require a recon step before cinematic).
