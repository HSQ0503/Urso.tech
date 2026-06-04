import { Skeleton, SkeletonCard } from "./ui";

function Header() {
  return (
    <div className="mb-8 space-y-3.5">
      <Skeleton className="h-3 w-72" />
      <Skeleton className="h-9 w-[68%] max-w-[620px]" />
      <Skeleton className="h-9 w-[40%] max-w-[360px]" />
      <Skeleton className="mt-2 h-4 w-[50%] max-w-[460px]" />
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

function ListCard({ rows = 4 }: { rows?: number }) {
  return (
    <SkeletonCard className="p-0">
      <div className="space-y-2.5 p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-48" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-t border-edge px-5 py-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-[70%]" />
            <Skeleton className="h-2.5 w-[40%]" />
          </div>
          <Skeleton className="h-7 w-16 rounded-lg" />
        </div>
      ))}
    </SkeletonCard>
  );
}

export function HomeSkeleton() {
  return (
    <div>
      <div className="mb-7 flex items-end justify-between">
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-64" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-8 w-72 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-edge bg-edge md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 bg-bg p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>
      <SkeletonCard className="mt-5 space-y-4">
        <div className="flex justify-between"><Skeleton className="h-7 w-40" /><Skeleton className="h-8 w-48 rounded-full" /></div>
        <Skeleton className="h-48 w-full" />
      </SkeletonCard>
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i} className="space-y-4">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-48 w-full" />
          </SkeletonCard>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1fr]">
        <ListCard rows={4} />
        <ListCard rows={4} />
      </div>
    </div>
  );
}

export function LeaksSkeleton() {
  return (
    <div>
      <Header />
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} className="space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-32" />
          </SkeletonCard>
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
            <Skeleton className="h-9 w-28" />
            <div className="flex-1 space-y-2.5">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-72" />
              <Skeleton className="h-3 w-[80%]" />
            </div>
            <Skeleton className="h-9 w-28 rounded-lg" />
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}

export function StoresSkeleton() {
  return (
    <div className="space-y-12">
      <div>
        <Header />
        <SkeletonCard className="p-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-t border-edge px-5 py-4 first:border-t-0">
              <Skeleton className="h-4 w-40" />
              <div className="ml-auto flex gap-6">
                {Array.from({ length: 6 }).map((_, j) => <Skeleton key={j} className="h-4 w-12" />)}
              </div>
            </div>
          ))}
        </SkeletonCard>
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i} className="space-y-4">
            <Skeleton className="h-5 w-44" />
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, j) => <Skeleton key={j} className="h-14 w-full rounded-xl" />)}
            </div>
            <Skeleton className="h-28 w-full" />
          </SkeletonCard>
        ))}
      </div>
      <SkeletonCard className="space-y-4">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-28 w-full" />
      </SkeletonCard>
    </div>
  );
}

export function CustomersSkeleton() {
  return (
    <div>
      <Header />
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-y border-edge py-7 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <StatBlock key={i} />)}
      </div>
      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SkeletonCard className="space-y-5">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
        </SkeletonCard>
        <ListCard rows={5} />
      </div>
    </div>
  );
}

export function TeamSkeleton() {
  return (
    <div>
      <Header />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.45fr_1fr]">
        <SkeletonCard className="p-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-t border-edge px-5 py-4 first:border-t-0">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-2.5 w-20" />
              </div>
              <div className="flex gap-6">
                {Array.from({ length: 5 }).map((_, j) => <Skeleton key={j} className="h-4 w-10" />)}
              </div>
            </div>
          ))}
        </SkeletonCard>
        <SkeletonCard className="space-y-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20" /></div>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
          <Skeleton className="h-20 w-full" />
        </SkeletonCard>
      </div>
    </div>
  );
}

export function ReviewsSkeleton() {
  return (
    <div className="space-y-10">
      <div>
        <Header />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} className="space-y-4">
              <Skeleton className="h-4 w-28" />
              <div className="flex justify-between"><Skeleton className="h-8 w-16" /><Skeleton className="h-8 w-12" /></div>
              <Skeleton className="h-1.5 w-full" />
            </SkeletonCard>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i} className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-[80%]" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-[90%]" />
            <Skeleton className="h-9 w-40 rounded-lg" />
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}
