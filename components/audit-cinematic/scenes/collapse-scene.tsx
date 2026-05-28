// 48 cells representing 8 stores (cols) × 6 leak types (rows).
// Each cell flies in from a random origin within ~40vw of its final position,
// timed so the swarm arrives over ~1.2s.

const COLS = 8;
const ROWS = 6;
const CELL_W = 22;
const CELL_H = 16;
const GAP = 3;

// Tone pattern — picks where the "heat" lives. Mirrors the storyboard.
const TONE: ("hot" | "warm" | "cool" | "")[] = [
  "hot","warm","","","warm","hot","","",
  "warm","hot","","","","warm","","hot",
  "hot","warm","","","","hot","","warm",
  "warm","hot","","","","warm","","hot",
  "hot","warm","","","","hot","","warm",
  "warm","hot","","","","warm","","hot",
];

function origin(idx: number) {
  // Deterministic pseudo-random so the layout is stable across renders.
  const r1 = Math.sin(idx * 12.9898) * 43758.5453;
  const r2 = Math.sin(idx * 78.233) * 43758.5453;
  const dx = (r1 - Math.floor(r1) - 0.5) * 600;
  const dy = (r2 - Math.floor(r2) - 0.5) * 400;
  return { dx, dy };
}

export function CollapseScene() {
  const totalW = COLS * CELL_W + (COLS - 1) * GAP;
  const totalH = ROWS * CELL_H + (ROWS - 1) * GAP;

  return (
    <div className="collapse-stage">
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: totalW,
          height: totalH,
          transform: "translate(-50%, -50%)",
        }}
      >
        {Array.from({ length: COLS * ROWS }).map((_, idx) => {
          const col = idx % COLS;
          const row = Math.floor(idx / COLS);
          const tone = TONE[idx] || "cool";
          const { dx, dy } = origin(idx);
          const delay = (idx % 12) * 30; // stagger across ~360ms
          return (
            <div
              key={idx}
              className="collapse-cell"
              data-tone={tone}
              style={{
                left: col * (CELL_W + GAP),
                top: row * (CELL_H + GAP),
                ["--from-x" as string]: `${dx}px`,
                ["--from-y" as string]: `${dy}px`,
                animationDelay: `${delay}ms`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
