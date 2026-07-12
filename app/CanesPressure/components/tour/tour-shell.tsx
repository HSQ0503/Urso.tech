"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, List, Minus, X } from "lucide-react";
import type { TourChapter } from "./chapters/types";
import { completeTour } from "./actions";
import s from "./tour.module.css";

// The tour engine. Self-contained: mounts once in the gated layout, floats
// over every operator page, and navigates the real app step by step. It never
// mutates app data — its one side effect is marking itself done (actions.ts).
// Content arrives as a server prop (RSC payload, behind the gate) — importing
// it here would ship every chapter's copy in the public JS bundle.
// Portals to document.body inside a .canes wrapper (same trap-avoidance as the
// mobile More sheet) so fixed positioning and cp-* tokens both survive.

type View = "closed" | "open" | "min";
type Pos = { c: number; s: number };
type Box = { key: string; top: number; left: number; width: number; height: number };

const POS_KEY = "canes-tour-pos";
const OPEN_EVENT = "canes:tour-open";

function clampPos(chapters: TourChapter[], raw: unknown): Pos {
  const p = (raw ?? {}) as Partial<Pos>;
  const c = Math.min(Math.max(typeof p.c === "number" ? p.c : 0, 0), chapters.length - 1);
  const st = Math.min(Math.max(typeof p.s === "number" ? p.s : 0, 0), chapters[c].steps.length - 1);
  return { c, s: st };
}

function savedPos(chapters: TourChapter[]): Pos {
  try {
    return clampPos(chapters, JSON.parse(window.localStorage.getItem(POS_KEY) ?? "{}"));
  } catch {
    return { c: 0, s: 0 };
  }
}

// SSR-safe hydration + media-query state without setState-in-effect.
const noopSubscribe = () => () => {};
function subscribeMobile(cb: () => void) {
  const mq = window.matchMedia("(max-width: 767px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const prefersReduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function TourShell({ autoOpen, chapters }: { autoOpen: boolean; chapters: TourChapter[] }) {
  const router = useRouter();
  const pathname = usePathname();

  // Guard against empty chapters (authoring states) — a zero-step chapter
  // would otherwise clamp to s = -1 and silently vanish the tour mid-run.
  const live = useMemo(() => chapters.filter((c) => c.steps.length > 0), [chapters]);

  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );

  const [view, setView] = useState<View>("closed");
  const [pos, setPos] = useState<Pos>({ c: 0, s: 0 });
  // Bumped on every step change/open: keys highlight measurements so a stale
  // box from a previous visit to the same step can never render.
  const [epoch, setEpoch] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [booted, setBooted] = useState(false);
  const targetRef = useRef<{ el: Element; key: string } | null>(null);
  const autoMinRef = useRef(false);

  // First-login auto-open, adjusted during render once hydration lands (the
  // sanctioned "adjust state during render" pattern — no effect cascade).
  if (hydrated && !booted) {
    setBooted(true);
    if (autoOpen && live.length > 0) {
      setPos(savedPos(live));
      setView("open");
    }
  }

  const chapter = live[pos.c];
  const step = chapter?.steps[pos.s];
  const stepKey = `${epoch}:${isMobile ? "m" : "d"}`;
  const totalSteps = useMemo(() => live.reduce((n, ch) => n + ch.steps.length, 0), [live]);
  const stepNumber = useMemo(
    () => live.slice(0, pos.c).reduce((n, ch) => n + ch.steps.length, 0) + pos.s + 1,
    [live, pos],
  );
  const isLast = chapter ? pos.c === live.length - 1 && pos.s === chapter.steps.length - 1 : false;

  // ── replay event from Settings (setState inside a subscription callback) ───
  useEffect(() => {
    const onOpen = () => {
      if (live.length === 0) return;
      setPos(savedPos(live));
      setEpoch((e) => e + 1);
      setMenuOpen(false);
      setConfirmEnd(false);
      setView("open");
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [live]);

  // ── persist position so a reload resumes where he left off ─────────────────
  useEffect(() => {
    if (view === "closed") return;
    try {
      window.localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      /* storage unavailable — resume is a nicety, not a requirement */
    }
  }, [pos, view]);

  // ── navigate to the step's page (only when the step changes — if he wanders
  //    off mid-step to explore, the tour must not yank him back) ──────────────
  useEffect(() => {
    if (view !== "open" || !step?.route) return;
    if (window.location.pathname !== step.route) router.push(step.route);
  }, [step, view, router]);

  // ── auto-minimize while a detail sheet is open: the card would sit exactly
  //    over the sheet's footer CTAs that step tips point at. Restores itself
  //    only if the minimize was ours, never overriding a manual minimize. ─────
  useEffect(() => {
    let last = document.querySelector(".cp-sheet") !== null;
    const observer = new MutationObserver(() => {
      const has = document.querySelector(".cp-sheet") !== null;
      if (has === last) return;
      last = has;
      if (has) {
        setView((v) => {
          if (v === "open") {
            autoMinRef.current = true;
            return "min";
          }
          return v;
        });
      } else {
        setView((v) => {
          const wasAuto = autoMinRef.current;
          autoMinRef.current = false;
          return wasAuto && v === "min" ? "open" : v;
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // ── highlight: poll for the selector (server components stream in after
  //    navigation), pick the visible match, follow it on scroll/resize.
  //    box is keyed by epoch — stale measurements simply never render. ────────
  useEffect(() => {
    targetRef.current = null;
    if (view !== "open" || !step) return;
    // Never hunt (or scroll) on a page this step doesn't belong to — the
    // pathname dep re-runs this once navigation lands on the right page.
    if (step.route && window.location.pathname !== step.route) return;
    const sel = (isMobile ? step.selectorMobile : undefined) ?? step.selector;
    if (!sel) return;

    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      let el: Element | undefined;
      try {
        el = Array.from(document.querySelectorAll(sel)).find((e) => {
          const h = e as HTMLElement;
          return h.getClientRects().length > 0 && (h.offsetParent !== null || getComputedStyle(h).position === "fixed");
        });
      } catch {
        window.clearInterval(timer); // malformed selector in content — skip quietly
        return;
      }
      if (el) {
        window.clearInterval(timer);
        targetRef.current = { el, key: stepKey };
        el.scrollIntoView({ block: "center", behavior: prefersReduce() ? "auto" : "smooth" });
        window.setTimeout(
          () => {
            const t = targetRef.current;
            if (t) setBox(measure(t.el, t.key));
          },
          prefersReduce() ? 0 : 380,
        );
      } else if (tries > 25) {
        window.clearInterval(timer); // never appeared — the step still reads fine
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, [view, step, isMobile, pathname, stepKey]);

  useEffect(() => {
    const update = () => {
      const t = targetRef.current;
      if (t) setBox(measure(t.el, t.key));
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, []);

  // ── controls ────────────────────────────────────────────────────────────────
  const go = useCallback(
    (next: Pos) => {
      setMenuOpen(false);
      setConfirmEnd(false);
      setEpoch((e) => e + 1);
      setPos(clampPos(live, next));
    },
    [live],
  );

  const onNext = () => {
    if (!chapter) return;
    if (pos.s + 1 < chapter.steps.length) go({ c: pos.c, s: pos.s + 1 });
    else if (pos.c + 1 < live.length) go({ c: pos.c + 1, s: 0 });
    else finish();
  };
  const onBack = () => {
    if (pos.s > 0) go({ c: pos.c, s: pos.s - 1 });
    else if (pos.c > 0) go({ c: pos.c - 1, s: live[pos.c - 1].steps.length - 1 });
  };

  const finish = () => {
    setView("closed");
    completeTour()
      .then(() => {
        try {
          window.localStorage.removeItem(POS_KEY);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* Completion didn't persist — keep the resume position so the
           re-offered tour picks up where he left off instead of restarting. */
      });
  };

  if (!hydrated || view === "closed" || !step || !chapter) return null;

  const bodyText = isMobile && step.mobileBody ? step.mobileBody : step.body;
  const showRing = view === "open" && !confirmEnd && box !== null && box.key === stepKey;

  return createPortal(
    <div className="canes">
      {showRing && box && (
        <div
          className={s.ring}
          style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 }}
          aria-hidden
        />
      )}

      {view === "min" ? (
        <button type="button" className={s.pill} onClick={() => setView("open")}>
          <span className={s.pillDot} aria-hidden />
          Resume tour
          <span className={s.pillCount}>
            {stepNumber}/{totalSteps}
          </span>
        </button>
      ) : (
        <section className={s.card} role="dialog" aria-label="Canes platform tour">
          <header className={s.header}>
            <span className={s.kicker}>
              Chapter {pos.c + 1} of {live.length} · {chapter.title}
            </span>
            <div className={s.headerBtns}>
              <button
                type="button"
                className={s.iconBtn}
                aria-label="Chapters"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <List size={15} strokeWidth={2} />
              </button>
              <button type="button" className={s.iconBtn} aria-label="Minimize tour" onClick={() => setView("min")}>
                <Minus size={15} strokeWidth={2} />
              </button>
              <button type="button" className={s.iconBtn} aria-label="End tour" onClick={() => setConfirmEnd(true)}>
                <X size={15} strokeWidth={2} />
              </button>
            </div>
          </header>

          {menuOpen ? (
            <div className={s.menu}>
              {live.map((ch, i) => {
                const done = i < pos.c;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    className={s.menuRow}
                    data-current={i === pos.c}
                    onClick={() => go({ c: i, s: 0 })}
                  >
                    <span className={s.menuNum}>{done ? <Check size={13} strokeWidth={2.5} /> : i + 1}</span>
                    <span className={s.menuText}>
                      <span className={s.menuTitle}>{ch.title}</span>
                      <span className={s.menuBlurb}>{ch.blurb}</span>
                    </span>
                    <span className={s.menuCount}>{ch.steps.length}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={s.scroll}>
              <h2 className={`cp-display ${s.title}`}>
                {step.title}
                <span className={s.period}>.</span>
              </h2>
              <div className={s.body}>
                <RichText text={bodyText} />
              </div>
              {step.tip && (
                <p className={s.tip}>
                  <span className={s.tipLabel}>Try it</span>
                  {step.tip}
                </p>
              )}
            </div>
          )}

          <footer className={s.footer}>
            {confirmEnd ? (
              <div className={s.confirm}>
                <span className={s.confirmText}>End the tour? Replay it anytime from Settings.</span>
                <div className={s.confirmBtns}>
                  <button type="button" className={s.btn} onClick={() => setConfirmEnd(false)}>
                    Keep going
                  </button>
                  <button type="button" className={s.btnPrimary} onClick={finish}>
                    End tour
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className={s.btn}
                  onClick={onBack}
                  disabled={pos.c === 0 && pos.s === 0}
                  aria-label="Previous step"
                >
                  <ChevronLeft size={15} strokeWidth={2} />
                  Back
                </button>
                <div className={s.progress}>
                  <span className={s.progressCount}>
                    {stepNumber} / {totalSteps}
                  </span>
                  <span className={s.track} aria-hidden>
                    <span className={s.fill} style={{ width: `${(stepNumber / totalSteps) * 100}%` }} />
                  </span>
                </div>
                <button type="button" className={s.btnPrimary} onClick={onNext}>
                  {isLast ? "Finish" : "Next"}
                  {!isLast && <ChevronRight size={15} strokeWidth={2} />}
                </button>
              </>
            )}
          </footer>
        </section>
      )}
    </div>,
    document.body,
  );
}

function measure(el: Element, key: string): Box {
  const r = el.getBoundingClientRect();
  return { key, top: r.top, left: r.left, width: r.width, height: r.height };
}

// ── tiny rich-text: paragraphs, "- " bullets, **bold** — content stays data ──

function Inline({ text }: { text: string }) {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length > 0 && lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l.slice(2)} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            <Inline text={lines.join(" ")} />
          </p>
        );
      })}
    </>
  );
}
