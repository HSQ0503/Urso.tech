"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { BuildConnectOperate, CONTAINER } from "./brand";

// All geometry is in cqw of the square stage, so the server render and every frame share one unit.
const S = 28;
const GAP = S * 0.14;
const K = (S + GAP) / 3;
const H = Math.SQRT1_2;
const DEPTH = { yellow: 1.2, blue: 1.8, red: 2.4 };

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const span = (p: number, start: number, end: number) => clamp((p - start) / (end - start));
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

type Pointer = { x: number; y: number };

function frame(p: number, pointer: Pointer) {
  const seamT = easeOut(span(p, 0.06, 0.24));
  const rotT = easeInOut(span(p, 0.14, 0.58));
  const spreadT = easeInOut(span(p, 0.56, 0.82));
  const tagT = easeOut(span(p, 0.62, 0.88));

  const seam = GAP * seamT;
  const spread = 1 + 0.1 * spreadT;
  const scale = lerp(1.22, 1, rotT);
  const radius = S * lerp(0.095, 0.12, rotT);
  const seamRadius = lerp(0, radius, seamT);

  // The P rotates about the centroid of the three squares. These translations keep the
  // bounding box centered on the stage at both ends of the turn.
  const tx = lerp(-(K - GAP + seam) / 2, 0, rotT) * scale;
  const ty = lerp(-K / 2, (K * H * spread) / 2, rotT) * scale;

  const place = (cx: number, cy: number, depth: number) =>
    `translate(${(cx * spread - S / 2 + pointer.x * depth).toFixed(3)}cqw, ${(cy * spread - S / 2 + pointer.y * depth).toFixed(3)}cqw)`;

  return {
    group: `translate(${tx.toFixed(3)}cqw, ${ty.toFixed(3)}cqw) rotate(${(45 * rotT).toFixed(3)}deg) scale(${scale.toFixed(4)})`,
    yellow: place(-K, -K, DEPTH.yellow),
    blue: place(2 * K - GAP + seam, -K, DEPTH.blue),
    red: place(-K, 2 * K, DEPTH.red),
    yellowRadius: `${radius.toFixed(3)}cqw ${seamRadius.toFixed(3)}cqw ${seamRadius.toFixed(3)}cqw ${radius.toFixed(3)}cqw`,
    blueRadius: `${seamRadius.toFixed(3)}cqw ${radius.toFixed(3)}cqw ${radius.toFixed(3)}cqw ${seamRadius.toFixed(3)}cqw`,
    redRadius: `${radius.toFixed(3)}cqw`,
    tagOpacity: tagT.toFixed(3),
    tagShift: `translateY(${((1 - tagT) * 12).toFixed(2)}px)`,
    hintOpacity: (1 - span(p, 0, 0.1)).toFixed(3),
  };
}

const INITIAL = frame(0, { x: 0, y: 0 });
const SQUARE = "absolute left-0 top-0 h-[28cqw] w-[28cqw]";
const HOLD = "group-data-[play=false]/stage:[animation-play-state:paused]";

export function MarkHero({ children }: { children: ReactNode }) {
  const sectionRef = useRef<HTMLElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);
  const blueRef = useRef<HTMLDivElement>(null);
  const redRef = useRef<HTMLDivElement>(null);
  const yellowShape = useRef<HTMLDivElement>(null);
  const blueShape = useRef<HTMLDivElement>(null);
  const redShape = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const desktop = window.matchMedia("(min-width: 1024px)");
    let startedAt: number | null = null;
    const target: Pointer = { x: 0, y: 0 };
    const pointer: Pointer = { x: 0, y: 0 };
    let raf = 0;
    let visible = true;

    const progress = () => {
      if (reduced) return 1;
      if (desktop.matches) {
        const travel = section.offsetHeight - window.innerHeight;
        return travel > 0 ? clamp(-section.getBoundingClientRect().top / travel) : 1;
      }
      return startedAt === null ? 0 : clamp((performance.now() - startedAt - 1100) / 1900);
    };

    const paint = () => {
      pointer.x += (target.x - pointer.x) * 0.08;
      pointer.y += (target.y - pointer.y) * 0.08;
      const f = frame(progress(), pointer);
      groupRef.current?.style.setProperty("transform", f.group);
      yellowRef.current?.style.setProperty("transform", f.yellow);
      blueRef.current?.style.setProperty("transform", f.blue);
      redRef.current?.style.setProperty("transform", f.red);
      yellowShape.current?.style.setProperty("border-radius", f.yellowRadius);
      blueShape.current?.style.setProperty("border-radius", f.blueRadius);
      redShape.current?.style.setProperty("border-radius", f.redRadius);
      if (tagRef.current) {
        tagRef.current.style.opacity = f.tagOpacity;
        tagRef.current.style.transform = f.tagShift;
      }
      if (hintRef.current) hintRef.current.style.opacity = f.hintOpacity;
      raf = visible && !reduced ? requestAnimationFrame(paint) : 0;
    };

    const onPointer = (event: PointerEvent) => {
      if (!desktop.matches) return;
      target.x = event.clientX / window.innerWidth - 0.5;
      target.y = event.clientY / window.innerHeight - 0.5;
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(paint);
    });

    const stageObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        stage.dataset.play = "true";
        startedAt = performance.now();
        stageObserver.disconnect();
      },
      { threshold: 0.4 },
    );

    observer.observe(section);
    stageObserver.observe(stage);
    window.addEventListener("pointermove", onPointer, { passive: true });
    raf = requestAnimationFrame(paint);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      stageObserver.disconnect();
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <section ref={sectionRef} id="top" className="relative scroll-mt-24 lg:h-[210vh]">
      <div className="lg:sticky lg:top-20 lg:flex lg:h-[calc(100svh-5rem)] lg:items-center">
        <div className={`${CONTAINER} grid items-center gap-10 pb-16 pt-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10 lg:py-0`}>
          <div>{children}</div>

          <div className="flex flex-col items-center">
            <div
              ref={stageRef}
              data-play="false"
              role="img"
              aria-label="The Pontian mark, three rounded squares in yellow, blue, and red, turning into a peak."
              className="group/stage @container relative aspect-square w-full max-w-[460px] lg:max-w-[min(560px,calc(100svh-15rem))]"
            >
              <div aria-hidden ref={groupRef} className="absolute left-1/2 top-1/2 size-0" style={{ transform: INITIAL.group }}>
                <div ref={yellowRef} className={SQUARE} style={{ transform: INITIAL.yellow }}>
                  <div
                    ref={yellowShape}
                    className={`size-full bg-pt-yellow animate-pt-from-left motion-reduce:animate-none ${HOLD}`}
                    style={{ borderRadius: INITIAL.yellowRadius }}
                  />
                </div>
                <div ref={blueRef} className={SQUARE} style={{ transform: INITIAL.blue }}>
                  <div
                    ref={blueShape}
                    className={`size-full bg-pt-blue animate-pt-from-right [animation-delay:110ms] motion-reduce:animate-none ${HOLD}`}
                    style={{ borderRadius: INITIAL.blueRadius }}
                  />
                </div>
                <div ref={redRef} className={SQUARE} style={{ transform: INITIAL.red }}>
                  <div
                    ref={redShape}
                    className={`size-full bg-pt-red animate-pt-from-below [animation-delay:220ms] motion-reduce:animate-none ${HOLD}`}
                    style={{ borderRadius: INITIAL.redRadius }}
                  />
                </div>
              </div>
            </div>

            <div ref={tagRef} className="mt-2 text-[15px] font-semibold" style={{ opacity: INITIAL.tagOpacity, transform: INITIAL.tagShift }}>
              <BuildConnectOperate />
            </div>
            <p
              ref={hintRef}
              aria-hidden
              className="mt-6 hidden items-center gap-2 text-[13px] font-medium text-pt-muted lg:flex"
              style={{ opacity: INITIAL.hintOpacity }}
            >
              <span className="relative block h-6 w-px overflow-hidden bg-pt-line">
                <span className="absolute inset-x-0 top-0 h-2 animate-pt-scroll-hint bg-pt-ink motion-reduce:animate-none" />
              </span>
              Scroll
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
