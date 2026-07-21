"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { forgotCanesPin, setupCanesPin, unlockCanesPin, type PinActionResult } from "./actions";

// The PIN entry island — setup (choose + confirm) or unlock (single field).
// Digits only, numeric keypad on phones, auto-submit at 4 digits on unlock.
// Failures render inline; success is a server-side redirect, so there is no
// client "unlocked" state to drift. Inputs stay enabled while pending (only
// buttons disable) so a wrong try on mobile doesn't blur + require re-tapping.

const PIN_RE = /^\d{0,4}$/;

function PinInput({
  id,
  label,
  value,
  onChange,
  onComplete,
  busy,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  busy: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="cp-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        pattern="\d{4}"
        maxLength={4}
        className="cp-input text-center text-[24px] tracking-[0.6em] tabular-nums"
        value={value}
        readOnly={busy}
        autoFocus={autoFocus}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "");
          if (!PIN_RE.test(v)) return;
          onChange(v);
          if (v.length === 4) onComplete?.(v);
        }}
      />
    </div>
  );
}

export function PinForm({ mode, returnTo }: { mode: "setup" | "locked"; returnTo: string }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<PinActionResult | void>) {
    if (isPending) return; // guard double-fire (auto-submit + button)
    setNotice(null);
    startTransition(async () => {
      try {
        const res = await fn();
        // Success redirects server-side — reaching here means a returned failure.
        if (res && !res.ok) {
          setNotice(res.notice ?? "Something went wrong — try again.");
          setPin("");
          setConfirm("");
        }
      } catch {
        // A thrown redirect is handled by the runtime; anything else is a real
        // error — surface it instead of crashing the transition.
        setNotice("Something went wrong — try again.");
      }
    });
  }

  const submitUnlock = (v?: string) => run(() => unlockCanesPin(v ?? pin, returnTo));
  const submitSetup = () => run(() => setupCanesPin(pin, confirm, returnTo));

  if (mode === "locked") {
    return (
      <div className="space-y-3">
        <PinInput
          id="cp-pin"
          label="PIN"
          value={pin}
          onChange={setPin}
          onComplete={submitUnlock}
          busy={isPending}
          autoFocus
        />
        <button
          type="button"
          className="cp-btn cp-btn-primary cp-btn-block"
          disabled={isPending || pin.length !== 4}
          onClick={() => submitUnlock()}
        >
          <KeyRound size={16} strokeWidth={2} />
          {isPending ? "Checking..." : "Unlock"}
        </button>
        {notice && <p className="text-[12.5px] font-medium text-[var(--cp-warn)]">{notice}</p>}
        <button
          type="button"
          className="mx-auto block text-[12.5px] font-medium text-[var(--cp-muted)] hover:text-[var(--cp-ink)]"
          disabled={isPending}
          onClick={() => {
            if (window.confirm("Forgot your PIN? You'll be signed out and can set a new one after signing back in.")) {
              startTransition(() => {
                void forgotCanesPin(returnTo);
              });
            }
          }}
        >
          Forgot PIN? Sign in again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PinInput id="cp-pin-new" label="New PIN" value={pin} onChange={setPin} busy={isPending} autoFocus />
      <PinInput id="cp-pin-confirm" label="Confirm PIN" value={confirm} onChange={setConfirm} busy={isPending} />
      <button
        type="button"
        className="cp-btn cp-btn-primary cp-btn-block"
        disabled={isPending || pin.length !== 4 || confirm.length !== 4}
        onClick={submitSetup}
      >
        <KeyRound size={16} strokeWidth={2} />
        {isPending ? "Saving..." : "Set PIN"}
      </button>
      {notice && <p className="text-[12.5px] font-medium text-[var(--cp-warn)]">{notice}</p>}
    </div>
  );
}
