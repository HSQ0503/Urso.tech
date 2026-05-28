import Link from "next/link";

export default function BookAnAuditPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-bg px-5 text-ink sm:px-8 md:px-14">
      <Link
        href="/"
        className="absolute left-5 top-5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dimmer hover:text-ink-dim sm:left-8 sm:top-8"
      >
        ← back
      </Link>
      <div className="text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-orange">
          Step 2 of 2
        </div>
        <h1 className="mt-5 text-[clamp(44px,11vw,88px)] font-medium leading-[0.95] tracking-[-0.035em]">
          Book your audit<span className="text-orange">.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-[480px] text-[15px] leading-[1.5] text-ink-dim sm:mt-6 sm:text-[17px]">
          This page is intentionally empty for now — it&apos;s a placeholder to
          confirm the slider transition lands here.
        </p>
      </div>
    </main>
  );
}
