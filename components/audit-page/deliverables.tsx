import { Pill } from "@/components/ui/pill";

export function AuditDeliverables() {
  return (
    <section className="relative border-t border-edge bg-bg px-5 py-20 text-ink sm:px-8 sm:py-24 md:px-14">
      <div className="mx-auto max-w-[1100px]">
        <div className="max-w-[640px]">
          <Pill>What you walk away with</Pill>
          <h2 className="mt-5 text-[clamp(34px,7.5vw,60px)] font-medium leading-[1.05] tracking-[-0.035em] sm:mt-6">
            Two artifacts<span className="text-orange">.</span>
          </h2>
          <p className="mt-5 max-w-[520px] text-[15px] leading-[1.55] tracking-[-0.005em] text-ink-dim sm:mt-6 sm:text-[16px]">
            Both yours to keep — even if we never work together again.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 md:mt-14 md:grid-cols-2 md:gap-6">
          <ArtifactCard
            format="Live web dashboard · per-location views"
            title="Your operating system."
            body="Every location in one view — filterable, comparable side by side, observable in real time. You're logged in and using it during the audit, not after."
            preview={<DashboardPreview />}
          />
          <ArtifactCard
            format="PDF + Notion workspace"
            title="The Leak Report."
            body="Your top leaks, in your numbers, priced to the dollar — each with a plain-language fix and a measurement plan so you'll know when it worked."
            preview={<ReportPreview />}
          />
        </div>
      </div>
    </section>
  );
}

function ArtifactCard({
  format,
  title,
  body,
  preview,
}: {
  format: string;
  title: string;
  body: string;
  preview: React.ReactNode;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-edge bg-panel">
      <div className="relative border-b border-edge bg-[#0a0a0a] p-5 sm:p-6">
        {preview}
      </div>
      <div className="p-7 sm:p-9">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-orange">
          {format}
        </span>
        <h3 className="mt-4 text-[22px] font-medium leading-[1.2] tracking-[-0.02em] sm:text-[24px]">
          {title}
        </h3>
        <p className="mt-4 text-[14px] leading-[1.55] tracking-[-0.005em] text-ink-dim sm:text-[15px]">
          {body}
        </p>
      </div>
    </div>
  );
}

function DashboardPreview() {
  const tiles: Array<{ label: string; value: string; tint: string; bars: number[] }> = [
    { label: "Capture", value: "94%", tint: "bg-emerald-400", bars: [40, 60, 55, 78, 70, 92] },
    { label: "Find", value: "#1", tint: "bg-sky-400", bars: [30, 45, 55, 60, 70, 82] },
    { label: "Reviews", value: "4.8★", tint: "bg-orange", bars: [50, 55, 60, 65, 70, 75] },
    { label: "ROAS", value: "3.4×", tint: "bg-rose-400", bars: [35, 50, 45, 65, 80, 90] },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]" />
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-dimmer">
            your business · live
          </span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dimmer">
          6 locations
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="flex flex-col gap-1.5 rounded-md border border-edge bg-bg p-2"
          >
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-ink-dimmer">
              {t.label}
            </span>
            <span className="font-sans text-[13px] font-medium leading-none tabular-nums text-ink">
              {t.value}
            </span>
            <div className="mt-1 flex h-[18px] items-end gap-[2px]">
              {t.bars.map((h, i) => (
                <div
                  key={i}
                  className={`${t.tint} w-full rounded-[1px] opacity-80`}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportPreview() {
  return (
    <div className="flex gap-3">
      <div className="relative w-full overflow-hidden rounded-md border border-edge bg-[#070707] p-3 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-orange">
            Leak report · Q2
          </span>
          <span className="font-mono text-[8px] text-ink-dimmer">v.1</span>
        </div>
        <div className="mt-2 font-sans text-[14px] font-medium leading-tight tracking-tight text-ink">
          Your business,
          <br />
          quantified<span className="text-orange">.</span>
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          <ReportLine label="Capture · after-hours" value="$3,240" tone="bad" />
          <ReportLine label="Findability · maps" value="$1,820" tone="bad" />
          <ReportLine label="Reputation · response time" value="$960" tone="warn" />
          <ReportLine label="Ad spend · reallocated" value="+$3,200" tone="good" />
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-edge pt-2">
          <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-ink-dim">
            Net surfaced
          </span>
          <span className="font-mono text-[11px] font-medium tabular-nums text-orange">
            $9,220 / wk
          </span>
        </div>
      </div>
    </div>
  );
}

function ReportLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "warn";
}) {
  const valueColor =
    tone === "good"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-400"
        : "text-rose-400";
  return (
    <div className="flex items-center justify-between">
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={`h-1 w-1 shrink-0 rounded-full ${
            tone === "good"
              ? "bg-emerald-400"
              : tone === "warn"
                ? "bg-amber-400"
                : "bg-rose-400"
          }`}
        />
        <span className="truncate font-sans text-[9.5px] text-ink-dim">
          {label}
        </span>
      </div>
      <span
        className={`font-mono text-[9.5px] tabular-nums ${valueColor}`}
      >
        {value}
      </span>
    </div>
  );
}
