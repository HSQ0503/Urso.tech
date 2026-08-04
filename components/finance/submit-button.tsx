"use client";

import { useFormStatus } from "react-dom";

export function FinanceSubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="dash-press inline-flex min-h-11 cursor-pointer items-center justify-center bg-orange px-5 text-[13px] font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-55"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
