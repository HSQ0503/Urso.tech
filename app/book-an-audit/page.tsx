import Link from "next/link";

export default function BookAnAuditPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-bg px-14 text-ink">
      <Link
        href="/"
        className="absolute left-8 top-8 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dimmer hover:text-ink-dim"
      >
        ← back
      </Link>
      <div className="text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-orange">
          Step 2 of 2
        </div>
        <h1 className="mt-5 text-[88px] font-medium leading-[0.95] tracking-[-0.035em]">
          Book your audit<span className="text-orange">.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-[480px] text-[17px] leading-[1.5] text-ink-dim">
          This page is intentionally empty for now — it&apos;s a placeholder to
          confirm the slider transition lands here.
        </p>
      </div>
    </main>
  );
}
