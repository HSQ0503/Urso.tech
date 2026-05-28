import Link from "next/link";
import { ArrowRight } from "@/components/ui/arrow-right";

export function AuditHero() {
  return (
    <section className="relative px-5 pb-16 pt-24 text-center sm:px-8 sm:pb-20 sm:pt-32 md:px-14 md:pb-24 md:pt-36">
      <Link
        href="/"
        className="absolute left-5 top-5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dimmer transition-colors hover:text-ink-dim sm:left-8 sm:top-8"
      >
        ← back
      </Link>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[800px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(ellipse, rgba(254,81,0,0.07), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[920px]">
        <h1 className="text-[clamp(44px,11vw,96px)] font-medium leading-[0.95] tracking-[-0.045em]">
          You can&apos;t fix
          <br />
          what you can&apos;t see<span className="text-orange">.</span>
        </h1>
        <p className="mx-auto mt-7 max-w-[640px] text-[16px] leading-[1.5] tracking-[-0.005em] text-ink-dim sm:mt-9 sm:text-[19px]">
          Your business runs across six logins and a gut feeling. The leaks
          that cost you most don&apos;t show up in any of them. An Urso audit
          pulls every store into one view and shows you exactly where the
          money&apos;s walking out.
        </p>
        <div className="mt-9 flex justify-center sm:mt-12">
          <a
            href="#request-an-audit"
            data-audit-hero-cta
            className="group inline-flex items-center gap-2 rounded-lg border border-transparent bg-orange px-[22px] py-[14px] font-sans text-[15px] font-medium tracking-[-0.005em] text-white shadow-[0_8px_28px_rgba(254,81,0,0.35)] transition-[filter,box-shadow] hover:brightness-110"
          >
            Request an audit
            <ArrowRight />
          </a>
        </div>
      </div>
    </section>
  );
}
