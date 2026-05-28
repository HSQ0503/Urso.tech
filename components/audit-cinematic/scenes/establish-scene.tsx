export function EstablishScene() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-12 left-12 font-mono text-[12px] tracking-[0.1em] text-ink-dim"
      style={{
        animation: "cinematic-cursor-blink 1s steps(2) infinite",
      }}
    >
      ▍
    </div>
  );
}
