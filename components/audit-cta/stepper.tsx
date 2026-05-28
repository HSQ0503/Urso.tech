const steps: Array<readonly [string, string]> = [
  ["01", "Email"],
  ["02", "Confirm"],
  ["03", "About your stores"],
];

export function Stepper({ stepIdx }: { stepIdx: number }) {
  return (
    <div className="mt-10 flex flex-wrap justify-center gap-x-5 gap-y-3 font-mono text-[10.5px] uppercase tracking-[0.08em] sm:mt-14 sm:gap-8 sm:text-[11px] sm:tracking-[0.1em]">
      {steps.map(([n, l], i) => {
        const active = i <= stepIdx;
        const current = i === stepIdx;
        const past = active && !current;
        return (
          <div
            key={n}
            className="flex items-center gap-2 transition-opacity duration-300"
            style={{ opacity: active ? 1 : 0.4 }}
          >
            <span
              className="grid size-[22px] place-items-center rounded-full border text-[10px] transition-colors duration-300"
              style={{
                borderColor: current ? "#FE5100" : "rgba(255,255,255,0.08)",
                background: past ? "#FE5100" : "transparent",
                color: past ? "#fff" : current ? "#FE5100" : "rgba(255,255,255,0.58)",
              }}
            >
              {past ? (
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <path
                    d="M2 5l2 2 4-5"
                    stroke="#fff"
                    strokeWidth="1.4"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                n
              )}
            </span>
            <span
              style={{ color: current ? "#fff" : "rgba(255,255,255,0.58)" }}
            >
              {l}
            </span>
          </div>
        );
      })}
    </div>
  );
}
