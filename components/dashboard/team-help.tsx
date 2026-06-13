// Shared definitions for the groomer scorecard columns, surfaced via InfoTip on
// both the Team page and the manager Home so "what does each column mean" is
// answered in place.

const COLS: { label: string; desc: string }[] = [
  { label: "Revenue", desc: "Service revenue performed in the selected period — grooming lines FranPOS attributes to this groomer at checkout." },
  { label: "Appts", desc: "Grooming appointments in the selected period." },
  { label: "Avg ticket", desc: "Service revenue per appointment for the period." },
  { label: "Return", desc: "Share of their customers who have ever come back for another visit (lifetime, not period)." },
  { label: "Attach", desc: "Share of their grooming visits that also bought a retail item (lifetime, not period)." },
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
