export default function BrainLearningLoading() {
  return (
    <div className="ob-content bg-bg text-ink" aria-busy="true" aria-label="Loading Learning inbox">
      <div className="ob-workspace">
        <div className="h-9 w-52 animate-pulse rounded-md bg-raise motion-reduce:animate-none" />
        <div className="mt-3 h-5 w-full max-w-xl animate-pulse rounded-md bg-raise motion-reduce:animate-none" />
        <div className="mt-12 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-[20px] border border-edge bg-panel motion-reduce:animate-none"
            />
          ))}
        </div>
        <div className="mt-8 h-96 animate-pulse rounded-[24px] border border-edge bg-panel motion-reduce:animate-none" />
      </div>
    </div>
  );
}
