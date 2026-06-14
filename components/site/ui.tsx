import Image from "next/image";
import type { ReactNode } from "react";
import { WipeLink } from "./wipe-link";
import { Reveal } from "./reveal";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ *
 * Logo — the finished artwork only. Never rebuilt, never re-typeset.  *
 * ------------------------------------------------------------------ */

export function Wordmark({
  className = "",
  height = 30,
  priority = false,
}: {
  className?: string;
  height?: number;
  priority?: boolean;
}) {
  // Trimmed lockup artwork, ratio 4.71 : 1 (packet §03).
  return (
    <Image
      src="/brand/urso-logo-orange-white.png"
      alt="Urso"
      width={Math.round(height * 4.71)}
      height={height}
      priority={priority}
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}

export function Mark({
  className = "",
  height = 24,
}: {
  className?: string;
  height?: number;
}) {
  // Trimmed mark artwork, ratio 1.93 : 1 (packet §03).
  return (
    <Image
      src="/brand/urso-mark-gradient.png"
      alt="Urso"
      width={Math.round(height * 1.93)}
      height={height}
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Layout                                                              *
 * ------------------------------------------------------------------ */

export function Container({
  children,
  className = "",
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cx(
        "mx-auto w-full px-[clamp(20px,4vw,56px)]",
        wide ? "max-w-[1480px]" : "max-w-[1200px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Section({
  children,
  id,
  className = "",
  divide = true,
  bone = false,
  wide = false,
}: {
  children: ReactNode;
  id?: string;
  className?: string;
  divide?: boolean;
  bone?: boolean;
  wide?: boolean;
}) {
  return (
    <section
      id={id}
      className={cx(
        "scroll-mt-24 py-[clamp(56px,9vw,128px)]",
        divide && "border-t border-edge",
        bone && "bone-scope",
        className,
      )}
    >
      <Container wide={wide}>{children}</Container>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Type primitives                                                     *
 * ------------------------------------------------------------------ */

/** Mono eyebrow. `index` renders as a dim "NN —" prefix per the section
 *  grammar (eyebrow → H2 → body → proof). */
export function Eyebrow({
  children,
  index,
  className = "",
}: {
  children: ReactNode;
  index?: string;
  className?: string;
}) {
  return (
    <p
      className={cx(
        "font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim",
        className,
      )}
    >
      {index && <span className="text-ink-dimmer">{index} — </span>}
      {children}
    </p>
  );
}

/** Headline with the canonical orange period. Pass the text without the
 *  trailing period; it's added in orange. */
export function Headline({
  children,
  as: Tag = "h2",
  size = "h2",
  period = true,
  className = "",
}: {
  children: ReactNode;
  as?: "h1" | "h2" | "h3";
  size?: "display" | "h1" | "h2" | "h3";
  period?: boolean;
  className?: string;
}) {
  const sizes = {
    display:
      "text-[clamp(2.75rem,6.4vw,5rem)] font-semibold leading-[1.02] tracking-[-0.045em]",
    h1: "text-[clamp(2.25rem,5vw,3rem)] font-semibold leading-[1.06] tracking-[-0.035em]",
    h2: "text-[clamp(1.75rem,3.4vw,2rem)] font-semibold leading-[1.12] tracking-[-0.03em]",
    h3: "text-[clamp(1.25rem,2vw,1.5rem)] font-medium leading-[1.2] tracking-[-0.02em]",
  } as const;
  return (
    <Tag className={cx("text-ink text-balance", sizes[size], className)}>
      {children}
      {period && <span className="text-orange">.</span>}
    </Tag>
  );
}

export function Lede({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cx(
        "text-[17px] leading-[1.55] text-ink-dim sm:text-[19px]",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Body({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cx(
        "text-[16px] leading-[1.6] tracking-[-0.005em] text-ink-dim sm:text-[17px]",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Section header on the 8/4 grid: heading block left, optional annotation
 *  right (a line of supporting data or a secondary action). */
export function SectionHead({
  eyebrow,
  index,
  title,
  lede,
  right,
  period = true,
  className = "",
}: {
  eyebrow: string;
  index?: string;
  title: ReactNode;
  lede?: ReactNode;
  right?: ReactNode;
  period?: boolean;
  className?: string;
}) {
  return (
    <Reveal
      className={cx(
        "grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-12",
        className,
      )}
    >
      <div className={right ? "md:col-span-7" : "md:col-span-9"}>
        <Eyebrow index={index}>{eyebrow}</Eyebrow>
        <Headline period={period} className="mt-4">
          {title}
        </Headline>
        {lede && <Lede className="mt-5 max-w-[44ch]">{lede}</Lede>}
      </div>
      {right && (
        <div className="flex items-end md:col-span-4 md:col-start-9">{right}</div>
      )}
    </Reveal>
  );
}

export function MonoNote({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cx(
        "font-mono text-[11px] uppercase leading-[1.6] tracking-[0.1em] text-ink-dimmer",
        className,
      )}
    >
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * Arrow + CTA                                                         *
 * ------------------------------------------------------------------ */

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M2.5 8h11M9 3.5 13.5 8 9 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type CtaProps = {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "hairline" | "text";
  size?: "md" | "lg";
  arrow?: boolean;
  className?: string;
  type?: "button" | "submit";
};

/** The CTA system. primary = orange fill + black text (one per viewport);
 *  hairline = outlined; text = label + advancing arrow. */
export function Cta({
  children,
  href,
  onClick,
  variant = "primary",
  size = "md",
  arrow = variant === "text",
  className = "",
  type = "button",
}: CtaProps) {
  const base =
    "group inline-flex items-center gap-2 font-medium tracking-[-0.01em] transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-orange/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";
  const variants = {
    primary:
      "rounded-lg bg-orange text-[#070707] hover:bg-[#FF6A1F] active:bg-[#E04800]",
    hairline:
      "rounded-lg border border-edge-strong text-ink hover:bg-white/[0.04]",
    text: "text-ink-dim hover:text-ink",
  } as const;
  const sizes = {
    md: variant === "text" ? "text-[14px]" : "text-[14px] px-[18px] py-[11px]",
    lg: variant === "text" ? "text-[15px]" : "text-[15px] px-[24px] py-[15px]",
  } as const;

  const content = (
    <>
      <span>{children}</span>
      {arrow && (
        <Arrow className="transition-transform duration-200 group-hover:translate-x-0.5" />
      )}
    </>
  );

  const cls = cx(base, variants[variant], sizes[size], className);

  if (href) {
    return (
      <WipeLink href={href} className={cls}>
        {content}
      </WipeLink>
    );
  }
  return (
    <button type={type} onClick={onClick} className={cls}>
      {content}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Page hero + shared final CTA                                        *
 * ------------------------------------------------------------------ */

export function PageHero({
  eyebrow,
  title,
  sub,
  proof,
  size = "h1",
  primary,
  secondary,
  visual,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  proof?: ReactNode;
  size?: "display" | "h1";
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
  visual?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden border-b border-edge pb-[clamp(48px,8vw,96px)] pt-[clamp(96px,14vw,180px)]">
      <BackdropGrid />
      <Container className="relative">
        <div className="max-w-[18ch]">
          <Eyebrow>{eyebrow}</Eyebrow>
        </div>
        <Headline
          as="h1"
          size={size}
          className="mt-6 max-w-[16ch]"
        >
          {title}
        </Headline>
        {sub && <Lede className="mt-7 max-w-[58ch]">{sub}</Lede>}
        {(primary || secondary) && (
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            {primary && (
              <Cta href={primary.href} size="lg">
                {primary.label}
              </Cta>
            )}
            {secondary && (
              <Cta href={secondary.href} variant="text" size="lg">
                {secondary.label}
              </Cta>
            )}
          </div>
        )}
        {proof && (
          <div className="mt-12 border-t border-edge pt-5">
            <MonoNote>{proof}</MonoNote>
          </div>
        )}
        {visual && <div className="mt-14">{visual}</div>}
        {children}
      </Container>
    </header>
  );
}

/** A faint hairline coordinate grid — the OS motif, used behind heroes and
 *  the final CTA. Pure CSS, no orange (preserves the focal budget). */
export function BackdropGrid({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx("pointer-events-none absolute inset-0", className)}
      style={{
        backgroundImage:
          "linear-gradient(var(--color-edge) 1px, transparent 1px), linear-gradient(90deg, var(--color-edge) 1px, transparent 1px)",
        backgroundSize: "clamp(48px,7vw,96px) clamp(48px,7vw,96px)",
        maskImage:
          "radial-gradient(120% 90% at 50% 0%, black 0%, transparent 72%)",
        WebkitMaskImage:
          "radial-gradient(120% 90% at 50% 0%, black 0%, transparent 72%)",
        opacity: 0.5,
      }}
    />
  );
}

export function CtaBlock({
  title,
  sub,
  note,
  primaryLabel = "Start the conversation",
  primaryHref = "/contact",
  secondary = { label: "See what we find", href: "/what-we-find" },
}: {
  title: ReactNode;
  sub: ReactNode;
  note?: ReactNode;
  primaryLabel?: string;
  primaryHref?: string;
  secondary?: { label: string; href: string } | null;
}) {
  return (
    <section className="relative overflow-hidden border-t border-edge py-[clamp(72px,11vw,160px)]">
      <BackdropGrid />
      <Container className="relative">
        <Reveal className="max-w-[40ch]">
          <Headline as="h2" size="display">
            {title}
          </Headline>
        </Reveal>
        <Reveal delay={80}>
          <Lede className="mt-7 max-w-[56ch]">{sub}</Lede>
        </Reveal>
        <Reveal delay={140}>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Cta href={primaryHref} size="lg">
              {primaryLabel}
            </Cta>
            {secondary && (
              <Cta href={secondary.href} variant="text" size="lg">
                {secondary.label}
              </Cta>
            )}
          </div>
        </Reveal>
        {note && (
          <Reveal delay={200}>
            <div className="mt-14 max-w-[64ch] border-t border-edge pt-5">
              <MonoNote>{note}</MonoNote>
            </div>
          </Reveal>
        )}
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Cards                                                               *
 * ------------------------------------------------------------------ */

export function Card({
  children,
  className = "",
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border border-edge bg-panel p-6 transition-colors duration-200 sm:p-7",
        hover && "hover:border-edge-strong",
        className,
      )}
    >
      {children}
    </div>
  );
}
