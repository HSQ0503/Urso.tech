"use client";

import { CircleAlert, RotateCcw } from "lucide-react";

export default function BrainLearningError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="grid min-h-[420px] place-items-center px-5 py-12 text-ink">
      <div className="w-full max-w-md rounded-[24px] border border-edge bg-panel p-7 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-orange-soft text-orange">
          <CircleAlert className="size-5" />
        </span>
        <h1 className="mt-4 text-[18px] font-semibold">Learning inbox unavailable</h1>
        <p className="mt-2 text-[13px] leading-6 text-ink-dim">
          The steward review surface could not be loaded. No learning candidate was changed.
        </p>
        <button
          type="button"
          onClick={unstable_retry}
          className="ob-btn mx-auto mt-5 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
        >
          <RotateCcw className="size-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
