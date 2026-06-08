import Link from "next/link";
import {
  parseScope,
  parseMonth,
  scopeLabel,
  monthLabel,
  type BriefChange,
} from "@/components/dashboard/data";
import { getWeeklyBrief } from "@/components/dashboard/data.server";
import { Card, PageHeader, Micro, Tag, Delta } from "@/components/dashboard/ui";

// Delta colors green when good — map our precomputed `good` onto its invert flag.
const deltaInvert = (c: BriefChange) => (c.delta >= 0) !== c.good;

export default async function BriefPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const sp = await searchParams;
  const scope = parseScope(sp.store);
  const month = parseMonth(sp.month);
  const period = month === "all" ? "This week" : monthLabel(month);
  const b = await getWeeklyBrief(scope, month);

  return (
    <div className="animate-stage-in space-y-8">
      <PageHeader
        eyebrow={`Weekly brief · ${scopeLabel(scope)} · ${period}`}
        title="The week in one page"
        sub="Generated automatically every Monday — what changed, what to celebrate, what to watch, and the single thing worth doing next. This is the weekly meeting."
        right={<Tag tone="muted">Auto-generated</Tag>}
      />

      {/* Headline */}
      <Card className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(254,81,0,0.16), transparent 70%)" }}
        />
        <Micro className="!text-orange">Summary</Micro>
        <p className="relative mt-3 max-w-[700px] text-[18px] font-medium leading-[1.45] tracking-[-0.01em] text-ink">{b.headline}</p>
      </Card>

      {/* What changed */}
      <section>
        <Micro>What changed</Micro>
        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-edge bg-edge md:grid-cols-5">
          {b.changes.map((c) => (
            <div key={c.label} className="bg-cell p-4">
              <Micro>{c.label}</Micro>
              <div className="mt-2 text-[20px] font-medium leading-none tracking-[-0.02em]">{c.value}</div>
              <div className="mt-2">
                <Delta value={c.delta} invert={deltaInvert(c)} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Wins + risks */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[var(--color-good)]" />
            <Micro>What improved</Micro>
          </div>
          <ul className="space-y-2.5">
            {b.wins.map((w, i) => (
              <li key={i} className="text-[13.5px] leading-[1.5] text-ink-dim">{w}</li>
            ))}
          </ul>
        </Card>
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-orange" />
            <Micro className="!text-orange">What to watch</Micro>
          </div>
          <ul className="space-y-2.5">
            {b.risks.map((r, i) => (
              <li key={i} className="text-[13.5px] leading-[1.5] text-ink-dim">{r}</li>
            ))}
          </ul>
        </Card>
      </section>

      {/* Biggest opportunity */}
      <Card className="flex flex-col gap-3">
        <Micro className="!text-orange">Biggest opportunity</Micro>
        <h2 className="text-[19px] font-medium tracking-[-0.01em]">{b.opportunity.title}</h2>
        <p className="max-w-[660px] text-[14px] leading-[1.6] text-ink-dim">{b.opportunity.detail}</p>
      </Card>

      {/* Actions + recommendation */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card className="flex flex-col gap-4">
          <Micro>Actions this week</Micro>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-edge bg-edge">
            <div className="bg-panel p-4">
              <div className="text-[26px] font-medium leading-none tracking-[-0.02em] text-[var(--color-good)]">{b.actionsCompleted}</div>
              <Micro className="mt-2">Completed</Micro>
            </div>
            <div className="bg-panel p-4">
              <div className="text-[26px] font-medium leading-none tracking-[-0.02em]">{b.actionsOpen}</div>
              <Micro className="mt-2">Still open</Micro>
            </div>
          </div>
          <Link href="/dashboard/actions" className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-orange">
            Open action center →
          </Link>
        </Card>
        <Card className="flex flex-col justify-between gap-4">
          <div>
            <Micro className="!text-orange">Urso recommends</Micro>
            <h2 className="mt-3 text-[18px] font-medium leading-[1.3] tracking-[-0.01em]">{b.recommendation}</h2>
          </div>
          <Link href="/dashboard/performance" className="w-fit rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-white transition hover:brightness-110">
            See the detail →
          </Link>
        </Card>
      </section>
    </div>
  );
}
