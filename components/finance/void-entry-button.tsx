"use client";

import { useFormStatus } from "react-dom";

function VoidButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 cursor-pointer px-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer transition-colors hover:text-orange disabled:cursor-wait disabled:opacity-50"
    >
      {pending ? "Voiding…" : "Void"}
    </button>
  );
}

export function VoidEntryButton({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("Void this cash entry? It will stop affecting every finance total.")) {
          event.preventDefault();
        }
      }}
    >
      <VoidButton />
    </form>
  );
}
