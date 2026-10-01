"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { BUTTON, CONTAINER } from "./brand";

const LINKS = [
  { href: "#services", label: "Services" },
  { href: "#work", label: "Work" },
  { href: "#approach", label: "Approach" },
  { href: "#about", label: "About" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-40 border-b bg-white/90 backdrop-blur-md transition-colors duration-200 ${
        scrolled || open ? "border-pt-line" : "border-transparent"
      }`}
    >
      <div className={`${CONTAINER} flex h-[72px] items-center gap-4 lg:h-20`}>
        <a href="#top" className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pt-action">
          <Image src="/pontian/logo-lockup.png" alt="Pontian" width={881} height={228} priority className="h-auto w-[124px] sm:w-[148px] lg:w-[160px]" />
        </a>

        <nav aria-label="Primary" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="inline-flex h-11 items-center rounded-[10px] px-3.5 text-[15px] font-medium text-pt-ink transition-colors duration-150 hover:bg-pt-paper focus-visible:outline-2 focus-visible:outline-pt-action"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <a href="#start" className={`${BUTTON.ink} ml-auto h-11 whitespace-nowrap px-3.5 text-[14px] sm:px-4 sm:text-[15px] lg:ml-3`}>
          Start a project
        </a>

        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex size-11 cursor-pointer items-center justify-center rounded-[12px] border border-pt-line bg-white focus-visible:outline-2 focus-visible:outline-pt-action lg:hidden"
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 8h16M4 16h16" />}
          </svg>
        </button>
      </div>

      <nav id="mobile-nav" aria-label="Mobile" hidden={!open} className="border-t border-pt-line bg-white lg:hidden">
        <ul className={`${CONTAINER} py-3`}>
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex h-12 items-center rounded-[12px] px-3 text-[17px] font-medium text-pt-ink hover:bg-pt-paper"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
