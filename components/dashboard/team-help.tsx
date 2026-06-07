// Shared definitions for the groomer scorecard columns, surfaced via InfoTip on
// both the Team page and the manager Home so "what does each column mean" is
// answered in place.

const COLS: { label: string; desc: string }[] = [
  { label: "$/hr", desc: "Revenue per labour hour — total revenue divided by hours worked. The cleanest read on productivity." },
  { label: "Appts", desc: "Completed appointments in the selected period." },
  { label: "Rebook", desc: "Share of customers who booked their next visit before leaving the chair." },
  { label: "Attach", desc: "Share of grooming visits that also bought a retail item." },
  { label: "Util", desc: "Utilisation — booked hours as a share of available hours." },
];

export const GROOMER_COL_HELP = (
  <div>
    <div className="font-medium text-ink">What each column means</div>
    <ul className="mt-2 space-y-1.5">
      {COLS.map((c) => (
        <li key={c.label}>
          <span className="font-mono text-ink">{c.label}</span>
          <span className="text-ink-dim"> — {c.desc}</span>
        </li>
      ))}
    </ul>
  </div>
);
