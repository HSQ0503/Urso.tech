"use client";

import { useFormStatus } from "react-dom";

function VoidButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 cursor-pointer border border-edge px-3 text-[11px] font-medium text-ink-dim transition-colors hover:border-orange/40 hover:text-orange disabled:cursor-wait disabled:opacity-50"
    >
      {pending ? "Removing…" : "Remove from totals"}
    </button>
  );
}

export function VoidEntryButton({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("Remove this transaction from all finance totals? Its audit record will be preserved.")) {
          event.preventDefault();
        }
      }}
    >
      <VoidButton />
    </form>
  );
}
