type Props = { step: 1 | 2 | 3; title: string };

const STEP_DATA: Record<1 | 2 | 3, { eyebrow: string; rows: Array<[string, string]> }> = {
  1: {
    eyebrow: "01 · We dig before we talk",
    rows: [
      ["After-hours call test", "ring 14 · no answer"],
      ["Citation parity", "5/8 stores"],
      ["Booking flow walk-through", "complete"],
    ],
  },
  2: {
    eyebrow: "02 · We stand up your operating system",
    rows: [
      ["POS · Google · Books · Calls", "→ one panel"],
      ["Per-store comparison", "live"],
      ["Observation mode", "no changes yet"],
    ],
  },
  3: {
    eyebrow: "03 · We hand you the one fix worth making",
    rows: [],
  },
};

export function ProcessStepScene({ step, title }: Props) {
  const data = STEP_DATA[step];
  return (
    <div className="process-step">
      <div className="eyebrow">{data.eyebrow}</div>
      <div className="title">{title}</div>
      {data.rows.length > 0 && (
        <div className="panel">
          {data.rows.map(([k, v]) => (
            <div key={k} className="row">
              <span className="k">{k}</span>
              <span className="v">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
