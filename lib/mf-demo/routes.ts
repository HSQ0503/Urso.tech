import type { DemoView } from "./types";

export const mfRouteByView = {
  control: "/mf/overview",
  changes: "/mf/changes",
  disciplines: "/mf/team",
  workflows: "/mf/workflows",
  artifacts: "/mf/outputs",
  brain: "/mf/brain",
  audit: "/mf/history",
} as const satisfies Record<DemoView, string>;

export const mfViewForStep: readonly DemoView[] = [
  "control",
  "changes",
  "changes",
  "changes",
  "changes",
  "disciplines",
  "artifacts",
  "workflows",
  "control",
];

export function getMfViewFromPathname(pathname: string): DemoView {
  const match = (Object.entries(mfRouteByView) as Array<[DemoView, string]>)
    .find(([, href]) => pathname === href || pathname.startsWith(`${href}/`));

  return match?.[0] ?? "control";
}

export function getMfRouteForStep(step: number) {
  const boundedStep = Math.max(0, Math.min(mfViewForStep.length - 1, step));
  return mfRouteByView[mfViewForStep[boundedStep]];
}
