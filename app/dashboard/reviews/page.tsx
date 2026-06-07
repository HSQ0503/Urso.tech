"use client";

import { use, useState } from "react";
import {
  reputation,
  findability,
  reviewsFor,
  reviewDistribution,
  actionPlans,
  STORE_OPTIONS,
  parseScope,
  type Review,
  type ActionPlan,
} from "@/components/dashboard/data";
import { Card, PageHeader, Display, Micro, Tag, Meter, RatingBars, Segmented, pct } from "@/components/dashboard/ui";
import { Modal } from "@/components/dashboard/modal";
import { ActionPlanBody } from "@/components/dashboard/action-plan";

type SortKey = "recent" | "high" | "low" | "flagged";
const sortOptions: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "high", label: "Highest" },
  { value: "low", label: "Lowest" },
  { value: "flagged", label: "Flagged" },
];

function sortReviews(list: Review[], key: SortKey): Review[] {
  const r = [...list];
  if (key === "recent") return r.sort((a, b) => a.days - b.days);
  if (key === "high") return r.sort((a, b) => b.rating - a.rating || a.days - b.days);
  if (key === "low") return r.sort((a, b) => a.rating - b.rating || a.days - b.days);
  return r.filter((x) => x.flagged);
}

export default function ReviewsPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const sp = use(searchParams);
  const scope = parseScope(sp.store);
  const defaultStore = scope === "all" ? reputation.byStore[0].store : STORE_OPTIONS.find((o) => o.value === scope)!.label;

  const [store, setStore] = useState(defaultStore);
  const [sort, setSort] = useState<SortKey>("recent");
  const [expanded, setExpanded] = useState(false);
  const [plan, setPlan] = useState<{ title: string; plan: ActionPlan } | null>(null);

  const dist = reviewDistribution(store);
  const reviews = sortReviews(reviewsFor(store), sort);
  const shown = expanded ? reviews : reviews.slice(0, 5);
  const storeOpts = reputation.byStore.map((r) => ({ value: r.store, label: r.store.replace("Village", "").trim() }));

  return (
    <div className="animate-stage-in space-y-10">
      <PageHeader
        eyebrow="Reputation & visibility · Google"
        title="Reputation & visibility"
        sub="Search ranking and review quality determine whether prospective customers reach a location. Reviews are also cross-referenced against FranPOS records to flag those with no matching customer on file."
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
          const sel = r.store === store;
          return (
            <button
              key={r.store}
              onClick={() => setStore(r.store)}
              className={`flex flex-col gap-4 rounded-2xl border bg-panel p-5 text-left transition-colors hover:border-edge-strong ${sel ? "border-edge-strong bg-white/[0.04]" : "border-edge"}`}
            >
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
                  <Display className="text-[30px] leading-none">
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
            </button>
          );
        })}
      </div>

      {/* Review browser */}
      <section className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_1.6fr]">
        <Card className="flex h-fit flex-col gap-5 lg:sticky lg:top-[84px]">
          <div>
            <Micro>Distribution</Micro>
            <div className="mt-2 flex items-baseline gap-2.5">
              <span className="text-[30px] font-medium leading-none tracking-[-0.02em]">{dist.rating.toFixed(1)}★</span>
              <span className="text-[12.5px] text-ink-dim">{dist.total} reviews</span>
            </div>
          </div>
          <RatingBars stars={dist.stars} counts={dist.counts} />
          <div className="border-t border-edge pt-4">
            <Micro>Store</Micro>
            <div className="mt-2.5">
              <Segmented options={storeOpts} value={store} onChange={setStore} />
            </div>
          </div>
        </Card>

        <Card pad={false}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
            <div>
              <Micro>Reviews</Micro>
              <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">{store.replace("Village", "").trim()}</h2>
            </div>
            <Segmented options={sortOptions} value={sort} onChange={setSort} />
          </div>
          {reviews.length === 0 ? (
            <div className="border-t border-edge px-5 py-10 text-center text-[13px] text-ink-dim">No reviews match this filter.</div>
          ) : (
            <>
              {shown.map((rev, i) => (
                <div key={i} className="border-t border-edge px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-[13px] text-ink" style={{ color: rev.rating <= 2 ? "#fe5100" : undefined }}>
                        {"★".repeat(rev.rating)}<span className="text-ink-dimmer">{"★".repeat(5 - rev.rating)}</span>
                      </span>
                      <span className="text-[13.5px] text-ink-dim">{rev.author}</span>
                      {rev.flagged && <Tag tone="orange">Suspected fake</Tag>}
                    </div>
                    <span className="font-mono text-[11px] text-ink-dimmer">{rev.days}d ago</span>
                  </div>
                  <p className="mt-2 text-[13.5px] leading-[1.55] text-ink-dim">{rev.text}</p>
                  {rev.flagged && (
                    <button
                      onClick={() => setPlan({ title: "Suspected fake review", plan: actionPlans["fake-reviews"] })}
                      className="mt-2.5 cursor-pointer rounded-lg border border-edge-strong px-3 py-1.5 text-[12px] text-ink transition-colors hover:bg-white/[0.05]"
                    >
                      Review the case →
                    </button>
                  )}
                </div>
              ))}
              {reviews.length > 5 && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="w-full cursor-pointer border-t border-edge px-5 py-3 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-orange"
                >
                  {expanded ? "Show less" : `Show all ${reviews.length} reviews`}
                </button>
              )}
            </>
          )}
        </Card>
      </section>

      {/* Explainers */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-orange" />
            <Micro className="!text-orange">Review integrity</Micro>
          </div>
          <h2 className="text-[19px] font-medium tracking-[-0.01em]">{reputation.suspectedFakes} one-star reviews with no matching customer on file</h2>
          <p className="text-[14px] leading-[1.6] text-ink-dim">
            We cross-reference each reviewer&rsquo;s name against your FranPOS customer records. When there&rsquo;s no matching customer, it&rsquo;s strong evidence the review is fake — enough to submit a one-click flag to Google. We can&rsquo;t delete them automatically, but we can hand you a proven case for each.
          </p>
          <button
            onClick={() => setPlan({ title: `${reputation.suspectedFakes} suspected fake reviews`, plan: actionPlans["fake-reviews"] })}
            className="mt-1 w-fit cursor-pointer rounded-lg border border-edge-strong px-4 py-2 text-[13px] text-ink transition-colors hover:bg-white/[0.05]"
          >
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
          <button
            onClick={() => setPlan({ title: "Add the missing booking link", plan: actionPlans["booking-link"] })}
            className="mt-1 w-fit cursor-pointer rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-white transition hover:brightness-110"
          >
            Fix Winter Park listing
          </button>
        </Card>
      </section>

      <Modal
        open={!!plan}
        onClose={() => setPlan(null)}
        eyebrow="Proposed fix"
        title={plan?.title ?? ""}
        footer={
          <a href="mailto:han@urso.tech?subject=Urso%20%E2%80%94%20reviews" className="flex w-full items-center justify-center rounded-lg bg-orange px-4 py-2.5 text-[13px] font-medium text-white transition hover:brightness-110">
            Talk to Urso about this →
          </a>
        }
      >
        {plan && <ActionPlanBody plan={plan.plan} />}
      </Modal>
    </div>
  );
}
