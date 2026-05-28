"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "./ui/logo";
import { Button } from "./ui/button";
import { SlideToConfirm } from "./ui/slide-to-confirm";
import { triggerWipe } from "./wipe-transition";

const links = [
  "Operating System",
  "Modules",
  "How we work",
  "Case studies",
  "Pricing",
];

const NAV_HEIGHT_PX = 64;

export function Nav() {
  const router = useRouter();
  const [activeIdx, setActiveIdx] = useState(0);
  const [showCta, setShowCta] = useState(false);
  const [sliderKey, setSliderKey] = useState(0);

  useEffect(() => {
    router.prefetch("/book-an-audit");
  }, [router]);

  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const target = document.getElementById("audit-cta-trigger");
      if (!target) {
        setShowCta(false);
        return;
      }
      const rect = target.getBoundingClientRect();
      setShowCta(rect.top <= NAV_HEIGHT_PX);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(check);
    };
    check();
    // Re-check after layout settles (handles hydration / late-mounting children)
    const settle = setTimeout(check, 200);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      clearTimeout(settle);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const goToBookAudit = () => {
    triggerWipe("/book-an-audit");
    // Re-mount the slider so it visually resets if user comes back.
    setTimeout(() => setSliderKey((k) => k + 1), 800);
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between border-b border-edge bg-bg/70 px-5 py-3 backdrop-blur-md sm:px-8 md:px-14">
      <Logo />

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[40px] w-[520px] -translate-x-1/2 -translate-y-1/2 md:block"
        onMouseLeave={() => setActiveIdx(0)}
      >
        {/* Center links */}
        <nav
          aria-hidden={showCta}
          className="absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-300 ease-out"
          style={{
            opacity: showCta ? 0 : 1,
            transform: showCta ? "translateY(-6px)" : "translateY(0)",
            pointerEvents: showCta ? "none" : "auto",
          }}
        >
          <ul className="flex items-center gap-1 whitespace-nowrap">
            {links.map((l, i) => {
              const active = i === activeIdx;
              return (
                <li key={l}>
                  <a
                    href="#"
                    onMouseEnter={() => setActiveIdx(i)}
                    onFocus={() => setActiveIdx(i)}
                    className={`relative inline-flex items-center rounded-full px-3.5 py-1.5 text-[14px] tracking-[-0.005em] transition-colors duration-200 ${
                      active ? "text-ink" : "text-ink-dim hover:text-ink"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute inset-0 rounded-full bg-white/[0.06] transition-opacity duration-200 ${
                        active ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <span className="relative">{l}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* CTA slider */}
        <div
          aria-hidden={!showCta}
          className="absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-300 ease-out"
          style={{
            opacity: showCta ? 1 : 0,
            transform: showCta ? "translateY(0)" : "translateY(6px)",
            pointerEvents: showCta ? "auto" : "none",
          }}
        >
          <div className="w-[340px]">
            <SlideToConfirm
              key={sliderKey}
              compact
              label="Slide to book an audit"
              onConfirm={goToBookAudit}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <Button variant="primary">Client login</Button>
      </div>
    </div>
  );
}
