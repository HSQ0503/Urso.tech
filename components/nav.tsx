"use client";

import { useState } from "react";
import { Logo } from "./ui/logo";
import { Button } from "./ui/button";
import { ArrowRight } from "./ui/arrow-right";

const links = [
  "Operating System",
  "Modules",
  "How we work",
  "Case studies",
  "Pricing",
];

export function Nav() {
  const [activeIdx, setActiveIdx] = useState(0);

  return (
    <div className="relative flex items-center justify-between border-b border-edge bg-bg/70 px-5 py-3 backdrop-blur-md sm:px-8 md:px-14">
      <Logo />

      <nav
        className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:block"
        onMouseLeave={() => setActiveIdx(0)}
      >
        <ul className="pointer-events-auto flex items-center gap-1 whitespace-nowrap">
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

      <div className="flex items-center gap-5">
        <a
          href="#"
          className="hidden text-[14px] text-ink-dim transition-colors hover:text-ink md:inline"
        >
          Client login
        </a>
        <Button variant="primary" icon={<ArrowRight />}>
          Book an audit
        </Button>
      </div>
    </div>
  );
}
