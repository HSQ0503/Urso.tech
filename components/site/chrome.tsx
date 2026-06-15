"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { WipeLink } from "./wipe-link";
import { Wordmark, Container, Arrow, cx } from "./ui";
import { FORECAST_GRAIN } from "./forecast";

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
      <header className="fixed inset-x-0 top-0 z-50 px-[clamp(12px,2.5vw,24px)] pt-[clamp(10px,1.4vw,16px)]">
        <div
          className={cx(
            "mx-auto grid h-14 max-w-[1200px] grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-2xl border px-3 backdrop-blur-xl transition-colors duration-300",
            scrolled || open
              ? "border-white/[0.12] bg-white/[0.06]"
              : "border-white/[0.07] bg-white/[0.035]",
          )}
        >
          <WipeLink
            href="/"
            aria-label="Urso — home"
            className="col-start-1 justify-self-start rounded pl-2 outline-none focus-visible:ring-2 focus-visible:ring-orange/70"
          >
            <Wordmark height={26} priority />
          </WipeLink>

          <nav className="col-start-2 hidden items-center gap-0.5 justify-self-center lg:flex">
            {NAV_LINKS.map((l) => {
              const active = pathname.startsWith(l.href);
              return (
                <WipeLink
                  key={l.href}
                  href={l.href}
                  className={cx(
                    "whitespace-nowrap rounded-full px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-200",
                    active
                      ? "bg-white/[0.07] text-ink"
                      : "text-ink-dim hover:bg-white/[0.06] hover:text-ink",
                  )}
                >
                  {l.label}
                </WipeLink>
              );
            })}
          </nav>

          <div className="col-start-3 flex items-center gap-1.5 justify-self-end">
            <WipeLink
              href="/login"
              className="hidden whitespace-nowrap rounded-full px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-ink sm:inline-flex"
            >
              Log in
            </WipeLink>
            <WipeLink
              href="/contact"
              className="group hidden items-center gap-2 whitespace-nowrap rounded-full bg-orange px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[#070707] transition-colors duration-200 hover:bg-[#FF6A1F] active:bg-[#E04800] md:inline-flex"
            >
              Get started
              <Arrow className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </WipeLink>
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink lg:hidden"
            >
              <MenuGlyph open={open} />
            </button>
          </div>
        </div>
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
    <footer className="relative overflow-hidden border-t border-edge bg-[#050505]">
      {/* A warm hairline, a faint bloom and fine grain — the page's depth
          carried into the footer so it reads as part of the system, not a
          plain appendage. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(254,81,0,0.4) 50%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(72% 92% at 50% 0%, rgba(254,81,0,0.06) 0%, transparent 56%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: FORECAST_GRAIN,
          backgroundSize: "150px 150px",
          opacity: 0.04,
          mixBlendMode: "soft-light",
        }}
      />

      <Container className="relative py-[clamp(56px,8vw,96px)]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-[1.7fr_1fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
            <WipeLink href="/" aria-label="Urso — home" className="inline-flex">
              <Wordmark height={28} />
            </WipeLink>
            <p className="mt-6 max-w-[26ch] font-serif text-[clamp(1.2rem,1.7vw,1.45rem)] font-normal leading-[1.25] tracking-[-0.01em] text-ink">
              <em className="italic">Following</em> the money
              <span className="text-orange">.</span>
            </p>
            <p className="mt-3.5 max-w-[34ch] text-[14px] leading-[1.55] text-ink-dim">
              Operational intelligence for people-based businesses.
            </p>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.heading}>
              <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dimmer">
                {col.heading}
              </div>
              <ul className="flex flex-col gap-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <WipeLink
                      href={l.href}
                      className="text-[14px] text-ink-dim transition-colors duration-200 hover:text-ink"
                    >
                      {l.label}
                    </WipeLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-[clamp(44px,6vw,72px)] flex flex-col gap-3 border-t border-edge pt-6 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dimmer md:flex-row md:items-center md:justify-between">
          <span>© 2026 Urso. All rights reserved.</span>
          <span className="text-ink-dim">
            29 months · 4 locations · $6.8M validated
          </span>
          <span>&ldquo;Urso&rdquo; — Portuguese for bear.</span>
        </div>
      </Container>
    </footer>
  );
}
