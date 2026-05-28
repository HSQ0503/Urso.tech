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
