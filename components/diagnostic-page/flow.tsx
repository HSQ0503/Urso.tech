"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DiagnosticForm } from "./form";

// The page below the hero is one vertical timeline: a spine that fills orange
// as the owner scrolls, with each narrative beat hanging off a node. The form
// is the final node — the spine's destination, not a wall.

type Beat = {
  eyebrow: string;
  body: ReactNode;
  anchor?: string;
};

const BEATS: Beat[] = [
  {
    eyebrow: "01 — The problem",
    body: <ProblemBeat />,
  },
  {
    eyebrow: "02 — The call · 45 min · free",
    body: <CallBeat />,
  },
  {
    eyebrow: "03 — What this isn't",
    body: <NotBeat />,
  },
  {
    eyebrow: "04 — Let's talk",
    body: <NextBeat />,
  },
  {
    eyebrow: "05 — Request the diagnostic",
    anchor: "request-a-diagnostic",
    body: <FormBeat />,
  },
];

export function DiagnosticFlow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const beatRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState<boolean[]>(() =>
    BEATS.map((_, i) => i === 0),
  );

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // Reduced-motion path: reveal everything, no scroll listener. setState-in-
      // effect is the right shape here — we're reading a client-only media query.
      if (fillRef.current) fillRef.current.style.height = "100%";
      /* eslint-disable react-hooks/set-state-in-effect */
      setActive(BEATS.length - 1);
      setVisible(BEATS.map(() => true));
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    let raf = 0;
    const measure = () => {
      raf = 0;
      const container = containerRef.current;
      const fill = fillRef.current;
      if (!container || !fill) return;

      const rect = container.getBoundingClientRect();
      const line = window.innerHeight * 0.55;
      const filled = Math.max(0, Math.min(rect.height, line - rect.top));
      fill.style.height = `${filled}px`;

      let nextActive = 0;
      const nextVisible: boolean[] = [];
      beatRefs.current.forEach((el, i) => {
        if (!el) {
          nextVisible[i] = false;
          return;
        }
        const top = el.offsetTop;
        const center = top + el.offsetHeight * 0.35;
        if (filled >= center) nextActive = i;
        // Reveal once the beat's top crosses ~85% of the viewport.
        const elRect = el.getBoundingClientRect();
        nextVisible[i] = elRect.top < window.innerHeight * 0.85;
      });

      setActive(nextActive);
      setVisible((prev) =>
        prev.some((v, i) => v !== (prev[i] || nextVisible[i]))
          ? prev.map((v, i) => v || nextVisible[i])
          : prev,
      );
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="relative border-t border-edge bg-bg px-5 pb-24 pt-16 text-ink sm:px-8 sm:pb-28 sm:pt-20 md:px-14 md:pb-32">
      <div ref={containerRef} className="relative mx-auto max-w-[940px]">
        {/* Spine track */}
        <div
          aria-hidden
          className="absolute bottom-0 top-0 w-px -translate-x-1/2 bg-edge left-[18px] sm:left-[26px] md:left-[34px]"
        />
        {/* Spine fill */}
        <div
          ref={fillRef}
          aria-hidden
          className="absolute top-0 w-px -translate-x-1/2 bg-gradient-to-b from-orange to-orange/70 left-[18px] sm:left-[26px] md:left-[34px]"
          style={{ height: 0, boxShadow: "0 0 12px rgba(254,81,0,0.5)" }}
        />

        <div className="flex flex-col">
          {BEATS.map((beat, i) => {
            const reached = i <= active;
            return (
              <div
                key={beat.eyebrow}
                id={beat.anchor}
                ref={(el) => {
                  beatRefs.current[i] = el;
                }}
                className={`relative scroll-mt-24 pb-24 pl-[52px] last:pb-0 sm:pl-[64px] md:pb-32 md:pl-[88px] ${
                  visible[i]
                    ? "translate-y-0 opacity-100"
                    : "translate-y-4 opacity-0"
                } transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]`}
              >
                {/* Node */}
                <span
                  aria-hidden
                  className="absolute top-[5px] grid size-3.5 -translate-x-1/2 place-items-center rounded-full border transition-colors duration-300 left-[18px] sm:left-[26px] md:left-[34px]"
                  style={{
                    background: reached ? "#FE5100" : "#070707",
                    borderColor: reached
                      ? "#FE5100"
                      : "rgba(255,255,255,0.14)",
                    boxShadow: reached ? "0 0 12px rgba(254,81,0,0.55)" : "none",
                  }}
                >
                  <span
                    className="size-1 rounded-full bg-bg transition-opacity duration-300"
                    style={{ opacity: reached ? 1 : 0 }}
                  />
                </span>

                <div
                  className="font-mono text-[11px] uppercase tracking-[0.14em] transition-colors duration-300"
                  style={{ color: reached ? "#FE5100" : "rgba(255,255,255,0.38)" }}
                >
                  {beat.eyebrow}
                </div>
                <div className="mt-5 sm:mt-6">{beat.body}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------- 01 · The problem ---------- */

function ProblemBeat() {
  const logins = ["POS", "Google", "QuickBooks", "Ads", "Calls", "Reviews"];
  return (
    <div>
      <h2 className="max-w-[800px] text-[clamp(30px,5.5vw,52px)] font-medium leading-[1.04] tracking-[-0.035em]">
        Your business&apos;s tech is scattered
        <span className="text-orange">.</span>
        <br />
        <span className="text-ink-dim">We can fix that.</span>
      </h2>
      <div className="mt-7 flex flex-wrap items-center gap-2">
        {logins.map((l) => (
          <span
            key={l}
            className="rounded-md border border-dashed border-edge-strong/70 bg-white/[0.015] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dimmer"
          >
            {l}
          </span>
        ))}
        <span className="ml-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dimmer/70">
          · none of them talk to each other
        </span>
      </div>
    </div>
  );
}

/* ---------- 02 · The call (centerpiece) ---------- */

function CallBeat() {
  const items = [
    "We walk your customer journey, the way a real customer would",
    "We bring you what we found from the outside",
    "We sit down with you on where you think you're losing business",
    "You leave knowing whether getting your data into one place is worth doing",
  ];
  return (
    <div>
      <span className="inline-flex items-center gap-2 rounded-full border border-orange/40 bg-orange-soft px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-orange">
        <span className="size-1.5 rounded-full bg-orange" />
        45 minutes · free · no slides
      </span>
      <h2 className="mt-5 max-w-[760px] text-[clamp(34px,6.5vw,62px)] font-medium leading-[1.0] tracking-[-0.04em]">
        This is exactly what
        <br />
        you get<span className="text-orange">.</span>
      </h2>
      <div className="mt-8 max-w-[680px] overflow-hidden rounded-2xl border border-orange/25 bg-gradient-to-b from-orange-wash to-transparent shadow-[0_0_40px_-12px_rgba(254,81,0,0.35)]">
        {items.map((it, i) => (
          <div
            key={it}
            className={`flex items-start gap-5 px-6 py-5 sm:px-7 sm:py-6 ${
              i > 0 ? "border-t border-orange/15" : ""
            }`}
          >
            <span className="mt-0.5 font-mono text-[15px] font-medium tabular-nums text-orange sm:text-[16px]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-[15px] leading-[1.45] tracking-[-0.005em] text-ink sm:text-[17px]">
              {it}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- 03 · What it's not ---------- */

function NotBeat() {
  return (
    <div>
      <h2 className="max-w-[640px] text-[clamp(28px,5vw,46px)] font-medium leading-[1.05] tracking-[-0.03em]">
        You&apos;ve sat through these before
        <span className="text-orange">.</span>
      </h2>
      <div className="mt-6 text-[clamp(24px,4.5vw,40px)] font-medium leading-[1.1] tracking-[-0.03em] text-ink-dim">
        This is not a{" "}
        <Typewriter words={["marketing audit", "SEO report", "pitch deck", "sales call"]} />
      </div>
    </div>
  );
}

function Typewriter({ words }: { words: string[] }) {
  const [wordIdx, setWordIdx] = useState(0);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"typing" | "deleting">("typing");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Static fallback: no cycling, just show the first disqualifier.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(words[0]);
      return;
    }

    const current = words[wordIdx];
    let t: number;
    if (phase === "typing") {
      if (text.length < current.length) {
        t = window.setTimeout(() => setText(current.slice(0, text.length + 1)), 75);
      } else {
        t = window.setTimeout(() => setPhase("deleting"), 1500);
      }
    } else {
      if (text.length > 0) {
        t = window.setTimeout(() => setText(current.slice(0, text.length - 1)), 38);
      } else {
        t = window.setTimeout(() => {
          setWordIdx((i) => (i + 1) % words.length);
          setPhase("typing");
        }, 350);
      }
    }
    return () => window.clearTimeout(t);
  }, [text, phase, wordIdx, words]);

  return (
    <span className="text-orange">
      {text}
      <span className="diagnostic-caret" />
    </span>
  );
}

/* ---------- 04 · Let's talk ---------- */

function NextBeat() {
  return (
    <div className="max-w-[640px]">
      <h2 className="text-[clamp(28px,5vw,46px)] font-medium leading-[1.05] tracking-[-0.03em]">
        Every business is different<span className="text-orange">.</span>
        <br />
        <span className="text-ink-dim">Let&apos;s talk about it.</span>
      </h2>
      <p className="mt-5 text-[16px] leading-[1.6] text-ink-dim sm:text-[18px]">
        A short call to see where yours stands. If there&apos;s something worth
        fixing, we&apos;ll figure out the next step together — no obligation, no
        prices on a slide.
      </p>
    </div>
  );
}

/* ---------- 05 · The form ---------- */

function FormBeat() {
  return (
    <div>
      <h2 className="text-[clamp(30px,5.5vw,52px)] font-medium leading-[1.02] tracking-[-0.035em]">
        Request the diagnostic<span className="text-orange">.</span>
      </h2>
      <p className="mt-4 max-w-[480px] text-[15px] leading-[1.55] text-ink-dim sm:text-[16px]">
        Four things. Enough for us to start looking at your business before we
        talk.
      </p>
      <div className="mt-8 max-w-[560px]">
        <DiagnosticForm />
      </div>
    </div>
  );
}

