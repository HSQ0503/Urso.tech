function format(ms: number) {
  const total = Math.floor(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function Timer({ elapsedMs }: { elapsedMs: number }) {
  return (
    <div className="pointer-events-none absolute right-5 top-5 font-mono text-[11px] tracking-[0.16em] text-orange sm:right-8 sm:top-8">
      {format(elapsedMs)}
    </div>
  );
}
