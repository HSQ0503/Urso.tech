"use client";

import { useState, useTransition } from "react";
import { Phone } from "lucide-react";
import { bridgeCall } from "@/app/CanesPressure/actions";

// The single call affordance across the whole app. Every "Call" button routes
// through the Twilio bridge (bridgeCall) so the customer sees the BUSINESS
// number and callbacks land back in our system — never Sebastian's personal
// cell. On tap Twilio rings his own phone first ("answer to connect"), then
// dials the customer. Renders a disabled ghost when there's no number.
export function CallButton({
  phone,
  leadId,
  label = "Call",
  className = "cp-btn cp-btn-sm",
  iconSize = 14,
  showFeedback = true,
  onStarted,
}: {
  phone: string | null | undefined;
  leadId?: string;
  label?: string;
  className?: string;
  iconSize?: number;
  showFeedback?: boolean;
  onStarted?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!phone) {
    return <span className={`${className} pointer-events-none opacity-50`}>{label}</span>;
  }

  function call() {
    setMsg(null);
    startTransition(async () => {
      const res = await bridgeCall(phone, { leadId });
      if (res.notice) setMsg({ ok: res.ok, text: res.notice });
      if (res.ok) onStarted?.();
    });
  }

  return (
    <>
      <button type="button" className={className} disabled={isPending} onClick={call} title={msg?.text}>
        <Phone size={iconSize} strokeWidth={2} /> {isPending ? "Calling…" : label}
      </button>
      {showFeedback && msg && (
        <p
          className={`basis-full text-[12.5px] leading-snug ${
            msg.ok ? "text-[var(--cp-good)]" : "text-[var(--cp-warn)]"
          }`}
        >
          {msg.text}
        </p>
      )}
    </>
  );
}
