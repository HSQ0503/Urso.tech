import { ACT_WINDOWS, currentAct } from "../timeline";

export function ActTag({ elapsedMs }: { elapsedMs: number }) {
  const act = currentAct(elapsedMs);
  const label = ACT_WINDOWS[act].label;
  return (
    <div
      key={act}
      className="pointer-events-none absolute left-5 top-5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dimmer sm:left-8 sm:top-8"
      style={{ animation: "cinematic-fade-in 300ms ease both" }}
    >
      {label}
    </div>
  );
}
