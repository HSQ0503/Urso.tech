"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { WipeLink } from "./wipe-link";
import { Wordmark, Mark, Container, Arrow, cx } from "./ui";

const NAV_LINKS = [
  { label: "What we do", href: "/what-we-do" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Capabilities", href: "/capabilities" },
  { label: "What we find", href: "/what-we-find" },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header
        className={cx(
          "fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300",
          scrolled || open
            ? "border-edge bg-bg/85 backdrop-blur-xl"
            : "border-transparent bg-transparent",
        )}
      >
        <Container className="flex h-16 items-center justify-between">
          <WipeLink
            href="/"
            aria-label="Urso — home"
            className="-ml-0.5 shrink-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-orange/70"
          >
            <Wordmark height={28} priority />
          </WipeLink>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((l) => {
              const active = pathname.startsWith(l.href);
              return (
                <WipeLink
                  key={l.href}
                  href={l.href}
                  className={cx(
                    "rounded-md px-3.5 py-2 text-[14px] tracking-[-0.005em] transition-colors duration-200",
                    active ? "text-ink" : "text-ink-dim hover:text-ink",
                  )}
                >
                  {l.label}
                </WipeLink>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <WipeLink
              href="/login"
              className="hidden rounded-md px-3 py-2 text-[14px] text-ink-dim transition-colors hover:text-ink sm:inline-flex"
            >
              Log in
            </WipeLink>
            <WipeLink
              href="/contact"
              className="hidden rounded-full bg-orange px-[18px] py-[9px] text-[14px] font-medium tracking-[-0.01em] text-[#070707] transition-colors duration-200 hover:bg-[#FF6A1F] active:bg-[#E04800] md:inline-flex"
            >
              Start the conversation
            </WipeLink>
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink md:hidden"
            >
              <MenuGlyph open={open} />
            </button>
          </div>
        </Container>
      </header>

      {/* Mobile sheet */}
      <div
        className={cx(
          "fixed inset-0 z-40 bg-bg transition-opacity duration-300 md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div className="flex h-full flex-col px-[clamp(20px,5vw,40px)] pb-10 pt-24">
          <nav className="flex flex-col">
            {NAV_LINKS.map((l, i) => (
              <WipeLink
                key={l.href}
                href={l.href}
                onNavigate={() => setOpen(false)}
                className="flex items-center justify-between border-b border-edge py-5 text-[22px] font-medium tracking-[-0.02em] text-ink"
                style={{ transitionDelay: `${i * 40}ms` }}
              >
                {l.label}
                <Arrow className="text-ink-dimmer" />
              </WipeLink>
            ))}
            <WipeLink
              href="/login"
              onNavigate={() => setOpen(false)}
              className="flex items-center justify-between border-b border-edge py-5 text-[22px] font-medium tracking-[-0.02em] text-ink-dim"
            >
              Log in
              <Arrow className="text-ink-dimmer" />
            </WipeLink>
          </nav>
          <div className="mt-auto">
            <WipeLink
              href="/contact"
              onNavigate={() => setOpen(false)}
              className="flex w-full items-center justify-center rounded-lg bg-orange px-6 py-4 text-[16px] font-medium tracking-[-0.01em] text-[#070707]"
            >
              Start the conversation
            </WipeLink>
          </div>
        </div>
      </div>
    </>
  );
}

function MenuGlyph({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path
        d={open ? "M5 5l12 12" : "M3 7h16"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        className="transition-all duration-200"
      />
      <path
        d={open ? "M17 5L5 17" : "M3 15h16"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        className="transition-all duration-200"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

const FOOTER_COLUMNS: Array<{
  heading: string;
  links: Array<{ label: string; href: string; external?: boolean }>;
}> = [
  {
    heading: "Site",
    links: [
      { label: "What we do", href: "/what-we-do" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Capabilities", href: "/capabilities" },
      { label: "What we find", href: "/what-we-find" },
    ],
  },
  {
    heading: "Engage",
    links: [
      { label: "Start the conversation", href: "/contact" },
      { label: "Log in", href: "/login" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-edge bg-[#050505]">
      <Container className="py-[clamp(48px,7vw,80px)]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
            <WipeLink href="/" aria-label="Urso — home" className="inline-flex">
              <Mark height={26} />
            </WipeLink>
            <p className="mt-5 max-w-[30ch] text-[14px] leading-[1.55] text-ink-dim">
              Operational intelligence for people-based businesses.
            </p>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.heading}>
              <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dimmer">
                {col.heading}
              </div>
              <ul className="flex flex-col gap-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <WipeLink
                      href={l.href}
                      className="text-[14px] text-ink-dim transition-colors hover:text-ink"
                    >
                      {l.label}
                    </WipeLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-[clamp(40px,6vw,72px)] flex flex-col justify-between gap-2 border-t border-edge pt-6 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dimmer sm:flex-row">
          <span>© 2026 Urso. All rights reserved.</span>
          <span>&ldquo;Urso&rdquo; — Portuguese for bear.</span>
        </div>
      </Container>
    </footer>
  );
}
