import type { ReactNode } from "react";
import { Skeleton, SkeletonCard } from "./ui";

// Mirrors PageHeader (ui.tsx): h-3 eyebrow, one title line at mt-2, mb-6 —
// same box the real header fills, so content swaps in without a jump.
function Header({ right }: { right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-3 w-64 max-w-full" />
        <Skeleton className="h-8 w-[46%] min-w-[220px] max-w-[420px]" />
      </div>
      {right && <div className="flex shrink-0 gap-2">{right}</div>}
    </div>
  );
}

function StatBlock() {
  return (
    <div className="space-y-2.5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-8 w-28" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

// Bordered panel without SkeletonCard's p-5 — for table-shaped ghosts that own
// their row padding.
function GhostPanel({ className = "", children }: { className?: string; children?: ReactNode }) {
  return <div className={`rounded-none border border-edge bg-panel ${className}`}>{children}</div>;
}

// gap-px KPI band cell — matches the bg-cell p-4 cells used across pages.
function BandCell({ value = "w-20", sub = false }: { value?: string; sub?: boolean }) {
  return (
    <div className="space-y-3 bg-cell p-4">
      <Skeleton className="h-3 w-16" />
      <Skeleton className={`h-6 ${value}`} />
      {sub && <Skeleton className="h-2.5 w-24" />}
    </div>
  );
}

// Form field ghost — label + the page's real h-9 rounded-lg input shape.
function Field() {
  return (
    <div>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-1.5 h-9 w-full rounded-lg" />
    </div>
  );
}

// /dashboard serves both personas; only the shared shell is ghosted (welcome
// row + header + one stat band) — persona-specific sections stage in below.
export function HomeSkeleton() {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-6 w-32 rounded-full" />
      </div>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-8 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-none border border-edge bg-edge md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <BandCell key={i} />)}
      </div>
    </div>
  );
}

export function PerformanceSkeleton() {
  const subHead = (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-5 w-56" />
      </div>
      <Skeleton className="h-6 w-36 rounded-full" />
    </div>
  );
  return (
    <div className="space-y-12">
      <Header />
      {/* Capture */}
      <div>
        {subHead}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.7fr_1fr]">
          <SkeletonCard className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2"><Skeleton className="h-3 w-36" /><Skeleton className="h-6 w-28" /></div>
              <div className="space-y-2"><Skeleton className="h-6 w-16" /><Skeleton className="h-3 w-12" /></div>
            </div>
            <Skeleton className="h-56 w-full" />
          </SkeletonCard>
          <SkeletonCard className="space-y-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mx-auto h-36 w-36 rounded-full" />
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-none border border-edge bg-edge">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-2 bg-panel p-3.5"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-14" /></div>
              ))}
            </div>
            <Skeleton className="h-3 w-full" />
          </SkeletonCard>
        </div>
        <SkeletonCard className="mt-3 space-y-4">
          <div className="space-y-2"><Skeleton className="h-3 w-32" /><Skeleton className="h-5 w-64" /></div>
          <Skeleton className="h-44 w-full" />
        </SkeletonCard>
      </div>
      {/* Convert */}
      <div>
        {subHead}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonCard key={i} className="space-y-4">
              <div className="space-y-2"><Skeleton className="h-3 w-36" /><Skeleton className="h-6 w-28" /></div>
              <Skeleton className="h-56 w-full" />
            </SkeletonCard>
          ))}
        </div>
      </div>
      {/* Money */}
      <div>
        {subHead}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.5fr_1fr]">
          <SkeletonCard className="space-y-4">
            <div className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-6 w-32" /></div>
            <Skeleton className="h-56 w-full" />
          </SkeletonCard>
          <SkeletonCard className="space-y-5">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="mx-auto h-40 w-40 rounded-full" />
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 border-t border-edge pt-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-20" /></div>
              ))}
            </div>
          </SkeletonCard>
        </div>
      </div>
    </div>
  );
}

export function StoresSkeleton() {
  return (
    <div className="space-y-12">
      <Header />
      {/* Scoreboard */}
      <GhostPanel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4">
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-6 w-48 rounded-full" />
        </div>
        <div className="divide-y divide-edge">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`flex items-center gap-4 px-5 ${i === 0 ? "py-4" : "py-3"}`}>
              <Skeleton className={`shrink-0 rounded-full ${i === 0 ? "size-9" : "size-8"}`} />
              <div className="min-w-0 flex-1">
                <Skeleton className={`${i === 0 ? "h-4 w-44" : "h-3.5 w-36"}`} />
                <Skeleton className="mt-2 h-1.5 w-full max-w-[260px] rounded-full" />
              </div>
              <Skeleton className={`shrink-0 ${i === 0 ? "h-7 w-12" : "h-6 w-10"}`} />
            </div>
          ))}
        </div>
      </GhostPanel>
      {/* Comparison table */}
      <GhostPanel>
        <div className="flex items-center px-5 py-3">
          <Skeleton className="h-2.5 w-16" />
          <div className="ml-auto flex gap-8">
            {Array.from({ length: 6 }).map((_, j) => <Skeleton key={j} className="h-2.5 w-12" />)}
          </div>
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center border-t border-edge px-5 py-3.5">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-2.5 w-16" />
            </div>
            <div className="ml-auto flex gap-8">
              {Array.from({ length: 6 }).map((_, j) => <Skeleton key={j} className="h-4 w-12" />)}
            </div>
          </div>
        ))}
      </GhostPanel>
      {/* Ranked comparisons */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} className="space-y-4">
            <div className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-4 w-28" /></div>
            <Skeleton className="h-40 w-full" />
          </SkeletonCard>
        ))}
      </div>
      <Skeleton className="h-3 w-[60%] max-w-[560px]" />
    </div>
  );
}

export function CustomersSkeleton() {
  return (
    <div>
      <Header />
      <div className="border-y border-edge py-7">
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <StatBlock key={i} />)}
        </div>
        <Skeleton className="mt-5 h-3 w-[55%] max-w-[520px]" />
      </div>
      {/* Return-rate trend */}
      <SkeletonCard className="mt-3 space-y-3">
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-32 w-full" />
      </SkeletonCard>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SkeletonCard className="space-y-5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-24 w-full" />
          <div className="space-y-3 border-t border-edge pt-5">
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-16 w-full" />
          </div>
        </SkeletonCard>
        {/* Cross-sell — caption, title, body copy, stacked share bar */}
        <SkeletonCard className="flex flex-col gap-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-[80%]" />
          <Skeleton className="mt-auto h-8 w-full" />
        </SkeletonCard>
      </div>
      {/* Grooming-cycle histogram */}
      <SkeletonCard className="mt-3 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-5 w-64" />
        </div>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-3 w-[70%]" />
      </SkeletonCard>
    </div>
  );
}

export function TeamSkeleton() {
  return (
    <div className="space-y-10">
      <Header />
      {/* Productivity ranking */}
      <SkeletonCard className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="space-y-2.5">
          {["w-[92%]", "w-[76%]", "w-[62%]", "w-[48%]", "w-[36%]", "w-[26%]"].map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-[150px] shrink-0" />
              <div className="flex-1"><Skeleton className={`h-4 ${w}`} /></div>
            </div>
          ))}
        </div>
      </SkeletonCard>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.45fr_1fr]">
        {/* Scorecard table */}
        <GhostPanel>
          <div className="space-y-2 px-5 pb-3 pt-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-44" />
          </div>
          <div className="flex items-center px-5 py-2.5">
            <Skeleton className="h-2.5 w-16" />
            <div className="ml-auto flex gap-7">
              {Array.from({ length: 5 }).map((_, j) => <Skeleton key={j} className="h-2.5 w-10" />)}
            </div>
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center border-t border-edge px-5 py-3">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-2.5 w-20" />
              </div>
              <div className="ml-auto flex gap-7">
                {Array.from({ length: 5 }).map((_, j) => <Skeleton key={j} className="h-4 w-10" />)}
              </div>
            </div>
          ))}
        </GhostPanel>
        {/* Profile */}
        <SkeletonCard className="space-y-5 self-start">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20" /></div>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-none" />)}
          </div>
        </SkeletonCard>
      </div>
      <Skeleton className="h-3 w-[70%] max-w-[640px]" />
    </div>
  );
}

export function RevenueSkeleton() {
  return (
    <div className="space-y-3">
      <Header />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-none border border-edge bg-edge md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <BandCell key={i} value="w-24" />)}
      </div>
      {Array.from({ length: 2 }).map((_, s) => (
        <div key={s} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonCard key={i} className="space-y-4">
              <div className="space-y-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-4 w-40" /></div>
              <Skeleton className="h-40 w-full" />
            </SkeletonCard>
          ))}
        </div>
      ))}
      <Skeleton className="h-3 w-[65%] max-w-[620px]" />
    </div>
  );
}

// /dashboard/actions — analyst console hero, then the suggested-actions
// pipeline (filter pills → action cards → stage band) below a hairline.
export function ActionsSkeleton() {
  return (
    <div className="space-y-12">
      <div>
        <Header />
        <div className="flex h-[72vh] min-h-[560px] flex-col overflow-hidden rounded-none border border-edge bg-panel">
          <div className="flex items-center gap-2.5 border-b border-edge px-4 py-3 md:px-5">
            <Skeleton className="size-8 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-2.5 w-32" />
            </div>
            <Skeleton className="ml-auto size-8 rounded-lg" />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
            <Skeleton className="size-12" />
            <Skeleton className="h-5 w-56 max-w-full" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
          <div className="border-t border-edge px-4 py-3 md:px-6">
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      </div>

      <section className="border-t border-edge pt-10">
        <div className="mb-6 space-y-2.5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-6 w-72 max-w-full" />
          <Skeleton className="h-3.5 w-[60%] max-w-[460px]" />
        </div>
        <div className="space-y-3">
          <div className="flex gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-20 rounded-full" />)}
          </div>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} className="space-y-4">
                <div className="flex justify-between"><Skeleton className="h-4 w-48" /><Skeleton className="h-5 w-20 rounded-full" /></div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-1 w-full" />
              </SkeletonCard>
            ))}
          </div>
          <div className="pt-5">
            <Skeleton className="mb-3 h-3 w-40" />
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-none border border-edge bg-edge md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2.5 bg-cell p-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-10" />
                  <Skeleton className="h-2.5 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// Entry form + logged-event cards — the events page's real shape.
export function EventsSkeleton() {
  return (
    <div className="space-y-3">
      <Header />
      <SkeletonCard>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field />
            <Field />
          </div>
          <Field />
          <Field />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field />
            <Field />
          </div>
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </SkeletonCard>
      <div>
        <Skeleton className="h-3 w-28" />
        <div className="mt-3 space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonCard key={i} className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-3 w-14" />
                </div>
                <Skeleton className="h-4 w-[45%] max-w-[300px]" />
                <Skeleton className="h-3 w-[65%] max-w-[440px]" />
                <Skeleton className="h-3 w-36" />
              </div>
              <Skeleton className="h-8 w-16 shrink-0 rounded-lg" />
            </SkeletonCard>
          ))}
        </div>
      </div>
    </div>
  );
}

// One centered document (letterhead → masthead → labeled rows), preceded only
// by the right-aligned Download-PDF pill — the brief has no PageHeader.
export function BriefSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Skeleton className="h-8 w-36 rounded-sm" />
      </div>
      <div className="mx-auto w-full max-w-[1040px] overflow-hidden rounded-sm border border-edge bg-panel">
        {/* Letterhead */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-6 py-3.5 sm:px-9">
          <Skeleton className="h-3 w-52" />
          <Skeleton className="h-3 w-40" />
        </div>
        {/* Masthead */}
        <div className="px-6 py-7 sm:px-9 sm:py-9">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-2.5 h-8 w-72 max-w-full" />
          <Skeleton className="mt-3 h-4 w-[60%] max-w-[560px]" />
        </div>
        {/* Summary row */}
        <div className="grid gap-x-10 gap-y-3 border-t border-edge px-6 py-6 sm:grid-cols-[150px_1fr] sm:px-9 sm:py-7">
          <Skeleton className="h-3 w-20" />
          <div className="space-y-2.5">
            <Skeleton className="h-4 w-[85%]" />
            <Skeleton className="h-4 w-[55%]" />
          </div>
        </div>
        {/* What-changed row */}
        <div className="grid gap-x-10 gap-y-3 border-t border-edge px-6 py-6 sm:grid-cols-[150px_1fr] sm:px-9 sm:py-7">
          <Skeleton className="h-3 w-24" />
          <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-4 w-14 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        {/* Improved · watch row */}
        <div className="grid gap-x-10 gap-y-3 border-t border-edge px-6 py-6 sm:grid-cols-[150px_1fr] sm:px-9 sm:py-7">
          <Skeleton className="h-3 w-28" />
          <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-[80%]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReviewsSkeleton() {
  return (
    <div className="space-y-10">
      <Header
        right={
          <>
            <Skeleton className="h-6 w-32 rounded-full" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </>
        }
      />
      {/* Reputation per store */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="flex items-end justify-between">
              <div className="space-y-2"><Skeleton className="h-8 w-16" /><Skeleton className="h-3 w-20" /></div>
              <div className="space-y-2"><Skeleton className="h-8 w-12" /><Skeleton className="h-3 w-16" /></div>
            </div>
            <div className="border-t border-edge pt-3">
              <div className="flex items-center justify-between"><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-24" /></div>
              <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
            </div>
          </SkeletonCard>
        ))}
      </div>
      {/* Review browser */}
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1fr_1.6fr]">
        <SkeletonCard className="space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-28" />
          </div>
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-3 w-6 shrink-0" />
                <div className="flex-1"><Skeleton className="h-3 w-full" /></div>
              </div>
            ))}
          </div>
          <div className="border-t border-edge pt-4">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="mt-2.5 h-8 w-full max-w-[280px] rounded-full" />
          </div>
        </SkeletonCard>
        <GhostPanel>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
            <div className="space-y-2"><Skeleton className="h-3 w-16" /><Skeleton className="h-5 w-32" /></div>
            <Skeleton className="h-8 w-56 rounded-full" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-t border-edge px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="mt-2.5 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-[80%]" />
            </div>
          ))}
        </GhostPanel>
      </div>
      {/* Explainers */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i} className="space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-5 w-[80%]" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-[90%]" />
            <Skeleton className="mt-1 h-9 w-44 rounded-lg" />
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}

// Default compare landing: stores × revenue — controls, the period band,
// the two chart cards, then the exact-figures table.
export function CompareSkeleton() {
  return (
    <div className="space-y-3">
      <Header />
      {/* Controls */}
      <SkeletonCard className="space-y-5">
        <div className="space-y-3">
          <Skeleton className="h-3 w-32" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-24 rounded-full" />)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-20 rounded-full" />)}
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-36" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-28 rounded-full" />)}
          </div>
        </div>
        <Skeleton className="h-3 w-64" />
      </SkeletonCard>
      {/* Period band */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-none border border-edge bg-edge md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`bg-cell p-4 ${i === 2 ? "col-span-2 md:col-span-1" : ""}`}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2.5 h-7 w-24" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
      {/* Side-by-side + pace */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i} className="space-y-4">
            <div className="space-y-2"><Skeleton className="h-3 w-36" /><Skeleton className="h-5 w-40" /></div>
            <Skeleton className="h-44 w-full" />
          </SkeletonCard>
        ))}
      </div>
      {/* Exact figures */}
      <GhostPanel>
        <div className="px-5 pb-1 pt-5"><Skeleton className="h-3 w-40" /></div>
        <div className="flex items-center px-5 py-3">
          <Skeleton className="h-2.5 w-14" />
          <div className="ml-auto flex gap-8">
            {Array.from({ length: 3 }).map((_, j) => <Skeleton key={j} className="h-2.5 w-20" />)}
          </div>
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center border-t border-edge px-5 py-3">
            <Skeleton className="h-4 w-32" />
            <div className="ml-auto flex gap-8">
              {Array.from({ length: 3 }).map((_, j) => <Skeleton key={j} className="h-4 w-16" />)}
            </div>
          </div>
        ))}
      </GhostPanel>
    </div>
  );
}

// Search row + one table card: mono thead, text-only rows with right-aligned
// numeric columns, pagination footer — no avatars anywhere on the real page.
export function ProductsSkeleton() {
  return (
    <div className="space-y-3">
      <Header />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-8 w-20" />
        </div>
        <Skeleton className="h-3 w-28" />
      </div>
      <GhostPanel>
        <div className="px-5 pb-1 pt-5"><Skeleton className="h-3 w-40" /></div>
        <div className="flex items-center px-5 py-2.5">
          <Skeleton className="h-2.5 w-24" />
          <div className="ml-auto flex gap-8">
            {Array.from({ length: 5 }).map((_, j) => <Skeleton key={j} className="h-2.5 w-12" />)}
          </div>
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center border-t border-edge px-5 py-3">
            <div className="flex w-[34%] min-w-[160px] items-center gap-2">
              <Skeleton className="h-4 w-[70%]" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <div className="ml-auto flex gap-8">
              {Array.from({ length: 5 }).map((_, j) => <Skeleton key={j} className="h-4 w-12" />)}
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-edge px-5 py-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </GhostPanel>
      <Skeleton className="h-3 w-[65%] max-w-[620px]" />
    </div>
  );
}

// Honesty-tag pills, six-cell KPI band, then the chart stack — traced from
// app/dashboard/money/page.tsx.
export function MoneySkeleton() {
  return (
    <div className="space-y-3">
      <Header />
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-6 w-36 rounded-full" />
        <Skeleton className="h-6 w-56 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-none border border-edge bg-edge md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <BandCell key={i} sub={i > 2} />)}
      </div>
      {/* Trend */}
      <SkeletonCard className="space-y-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-48 w-full" />
      </SkeletonCard>
      {/* Waterfall + cost breakdown */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i} className="space-y-3">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-44 w-full" />
          </SkeletonCard>
        ))}
      </div>
      {/* Cross-store benchmark */}
      <SkeletonCard className="space-y-3">
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-3 w-[75%]" />
      </SkeletonCard>
    </div>
  );
}
