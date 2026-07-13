"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import {
  sendTechnicianSignInLink,
  type TechnicianLoginResult,
} from "@/app/CanesPressure/crew/auth-actions";

const INITIAL: TechnicianLoginResult = { ok: false };

export function TechnicianLoginForm() {
  const [state, action, pending] = useActionState(sendTechnicianSignInLink, INITIAL);
  if (state.ok) {
    return (
      <div className="rounded-lg border border-[var(--cp-line)] bg-[var(--cp-good-bg)] p-4">
        <p className="text-[14px] font-semibold text-[var(--cp-good)]">Check your email</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--cp-muted)]">
          If that address is an active Canes technician account, its secure sign-in link is on the way.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="cp-label" htmlFor="technician-email">
          Work email
        </label>
        <div className="relative">
          <Mail
            aria-hidden
            size={17}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cp-faint)]"
          />
          <input
            id="technician-email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            className="cp-input min-h-12 pl-10 text-[16px]"
            placeholder="you@company.com"
            required
            autoFocus
          />
        </div>
      </div>
      {state.notice && (
        <p role="alert" className="text-[13px] font-medium text-[var(--cp-danger)]">
          {state.notice}
        </p>
      )}
      <button
        type="submit"
        className="cp-btn cp-btn-primary min-h-12 w-full text-[15px]"
        disabled={pending}
      >
        {pending ? "Sending secure link…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
