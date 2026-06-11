import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "QuickBooks · Urso",
  robots: { index: false },
};

export default async function QuickBooksConnected({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const ok = status !== "error";

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-6 text-ink">
      <div className="w-full max-w-[440px] rounded-2xl border border-edge bg-panel p-8 text-center">
        <div
          className={`mx-auto grid size-12 place-items-center rounded-full ${
            ok ? "bg-[rgba(70,209,138,0.12)]" : "bg-orange-soft"
          }`}
        >
          {ok ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fe5100" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          )}
        </div>
        <h1 className="mt-5 text-[22px] font-medium tracking-[-0.01em]">
          {ok ? "QuickBooks connected" : "Connection failed"}
        </h1>
        <p className="mt-2.5 text-[14px] leading-[1.55] text-ink-dim">
          {ok
            ? "Your QuickBooks account is now linked to Urso. Your financials will start flowing into your dashboard — you can close this window."
            : "Something went wrong linking QuickBooks. Please try again, or contact Urso and we'll sort it out."}
        </p>
        <Link
          href={ok ? "/" : "/api/quickbooks/connect"}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-orange px-4 py-2.5 text-[13px] font-medium text-white transition hover:brightness-110"
        >
          {ok ? "Done" : "Try again"}
        </Link>
      </div>
    </main>
  );
}
