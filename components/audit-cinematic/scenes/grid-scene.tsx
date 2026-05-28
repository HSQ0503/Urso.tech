const TONE: ("hot" | "warm" | "cool" | "")[] = [
  "hot","warm","","","warm","hot","","",
  "warm","hot","","","","warm","","hot",
  "hot","warm","","","","hot","","warm",
  "warm","hot","","","","warm","","hot",
  "hot","warm","","","","hot","","warm",
  "warm","hot","","","","warm","","hot",
];

const HOT_COLS = new Set([0, 5]);

export function GridScene() {
  return (
    <>
      <div className="cinematic-grid">
        {TONE.map((tone, i) => (
          <div key={i} data-tone={tone || "cool"} />
        ))}
      </div>
      <div className="cinematic-grid-labels">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} data-hot={HOT_COLS.has(i)}>
            S{String(i + 1).padStart(2, "0")}
          </span>
        ))}
      </div>
    </>
  );
}
