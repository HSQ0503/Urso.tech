import { reputation, findability } from "@/components/dashboard/data";
import { Card, PageHeader, Display, Micro, Tag, Meter, pct } from "@/components/dashboard/ui";

export default function ReviewsPage() {
  return (
    <div className="animate-stage-in space-y-10">
      <div>
        <PageHeader
          eyebrow="Reputation & visibility · Live from Google"
          title="Reputation & visibility"
          sub="Search ranking and review quality determine whether prospective customers reach a location. Reviews are also cross-referenced against FranPOS records to identify those with no matching customer on file."
          right={
            <div className="flex gap-2">
              <Tag tone="orange">{reputation.suspectedFakes} suspected fakes</Tag>
              <Tag tone="orange">{reputation.unanswered} unanswered</Tag>
            </div>
          }
        />

        {/* Reputation per store */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {reputation.byStore.map((r, i) => {
            const find = findability[i];
            return (
              <Card key={r.store} className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div className="text-[14.5px] text-ink">{r.store}</div>
                  {!find.bookButton && <Tag tone="orange">No book button</Tag>}
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <Display className="text-[30px] leading-none text-ink">{r.rating.toFixed(1)}★</Display>
                    <Micro className="mt-1.5">{r.volume} reviews</Micro>
                  </div>
                  <div className="text-right">
                    <Display className="text-[30px] leading-none" >
                      <span style={{ color: find.rank > 4 ? "#fe5100" : "#fff" }}>#{find.rank}</span>
                    </Display>
                    <Micro className="mt-1.5">local rank</Micro>
                  </div>
                </div>
                <div className="border-t border-edge pt-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <Micro>Reply rate</Micro>
                    <span className="font-mono text-[11px] text-ink-dim">{pct(r.responseRate)} · {r.responseHrs}h avg</span>
                  </div>
                  <Meter value={r.responseRate} color={r.responseRate < 0.6 ? "#fe5100" : "#46d18a"} />
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Two explainer cards */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-orange" />
            <Micro className="!text-orange">Review integrity</Micro>
          </div>
          <h2 className="text-[19px] font-medium tracking-[-0.01em]">{reputation.suspectedFakes} one-star reviews with no matching customer on file</h2>
          <p className="text-[14px] leading-[1.6] text-ink-dim">
            We cross-reference each reviewer’s name against your FranPOS customer records. When there’s no matching customer, it’s strong evidence the review is fake — enough to submit a one-click flag to Google. We can’t delete them automatically, but we can hand you a proven case for each.
          </p>
          <button className="mt-1 w-fit rounded-lg border border-edge-strong px-4 py-2 text-[13px] text-ink transition-colors hover:bg-white/[0.05]">
            Review the {reputation.suspectedFakes} flagged
          </button>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-orange" />
            <Micro className="!text-orange">Search visibility</Micro>
          </div>
          <h2 className="text-[19px] font-medium tracking-[-0.01em]">Winter Park ranks #2 but has no booking link on Google</h2>
          <p className="text-[14px] leading-[1.6] text-ink-dim">
            Your best store is missing the one button that turns a Google listing into a booking — so the easiest appointments never start. The newer stores also rank #5 and #6 locally, which is the single biggest lever on how many new customers find them at all.
          </p>
          <button className="mt-1 w-fit rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-white transition hover:brightness-110">
            Fix Winter Park listing
          </button>
        </Card>
      </section>
    </div>
  );
}
