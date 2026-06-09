import Link from "next/link";
import { Logo } from "./ui/logo";

type FooterLink = { label: string; href: string };

const columns: Array<readonly [string, ReadonlyArray<FooterLink>]> = [
  [
    "Product",
    [
      { label: "How it works", href: "/#how-it-works" },
      { label: "The system", href: "/#system" },
      { label: "Modules", href: "/#modules" },
      { label: "Research", href: "/#work" },
    ],
  ],
  [
    "Company",
    [
      { label: "About", href: "/about" },
      { label: "Book a diagnostic", href: "/book-a-diagnostic" },
      { label: "Privacy", href: "/privacy" },
    ],
  ],
  [
    "Contact",
    [
      { label: "hello@urso.co", href: "mailto:hello@urso.co" },
      { label: "X / Twitter", href: "https://x.com/urso_tech" },
      { label: "LinkedIn", href: "https://www.linkedin.com/company/urso-tech" },
    ],
  ],
];

function FooterAnchor({ label, href }: FooterLink) {
  const className = "text-[13px] text-ink-dim hover:text-ink";

  if (href.startsWith("http")) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {label}
      </a>
    );
  }

  if (href.startsWith("mailto:")) {
    return (
      <a href={href} className={className}>
        {label}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-edge bg-[#040404] px-5 pb-10 pt-12 text-ink sm:px-8 sm:pt-14 md:px-14">
      <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:gap-10">
        <div className="col-span-2 sm:col-span-4 md:col-span-1">
          <Logo />
          <p className="mt-4 max-w-[420px] text-[13px] leading-[1.5] text-ink-dim md:max-w-[280px]">
            A data agency for founder-led service businesses.
            <br className="hidden sm:block" />
            Run on data, not gut feel.
          </p>
        </div>
        {columns.map(([h, items]) => (
          <div key={h}>
            <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dimmer">
              {h}
            </div>
            <div className="flex flex-col gap-2.5">
              {items.map((it) => (
                <FooterAnchor key={it.label} {...it} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-14 flex flex-wrap justify-between gap-2 border-t border-edge pt-6 font-mono text-[11px] tracking-[0.04em] text-ink-dimmer">
        <span>© 2026 Urso. All rights reserved.</span>
        <span>&ldquo;Urso&rdquo; Portuguese for bear.</span>
      </div>
    </footer>
  );
}
