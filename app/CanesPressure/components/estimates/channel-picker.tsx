"use client";

import { fmtPhone } from "@/lib/canes/types";

// Shared send-channel picker for the estimate builder and the detail-page action
// rail. Adapts to what's on file: phone + email → a Text / Email / Both segment
// (default Both); one contact method → a plain "we'll text/email" line; neither
// → nothing to pick (the caller disables send). Opt-out disables Text with a
// muted note. Purely presentational — the server recomputes effective channels
// in sendEstimate, so this is advisory guidance for the owner.

export type SendChannels = { email: boolean; text: boolean };
export type ChannelChoice = "text" | "email" | "both";

export function choiceToChannels(choice: ChannelChoice): SendChannels {
  return { text: choice !== "email", email: choice !== "text" };
}

// What the segmented control should show, given the contact fields + opt-out.
export function channelAvailability(opts: {
  phone: string;
  email: string;
  optedOut: boolean;
}): { hasPhone: boolean; hasEmail: boolean; textBlocked: boolean; canSend: boolean } {
  const hasPhone = Boolean(opts.phone.trim());
  const hasEmail = Boolean(opts.email.trim());
  const textBlocked = opts.optedOut;
  const canSend = hasEmail || (hasPhone && !textBlocked);
  return { hasPhone, hasEmail, textBlocked, canSend };
}

function segment(active: boolean, label: string, onClick: () => void, disabled: boolean) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[32px] cursor-pointer rounded text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? "bg-[var(--cp-brand-fill)] text-white"
          : "text-[var(--cp-muted)] hover:text-[var(--cp-ink)]"
      }`}
    >
      {label}
    </button>
  );
}

export function ChannelPicker({
  phone,
  email,
  optedOut,
  choice,
  onChange,
  disabled = false,
}: {
  phone: string;
  email: string;
  optedOut: boolean;
  choice: ChannelChoice;
  onChange: (choice: ChannelChoice) => void;
  disabled?: boolean;
}) {
  const { hasPhone, hasEmail, textBlocked } = channelAvailability({ phone, email, optedOut });

  const disclaimer = (
    <p className="mt-1.5 text-[12px] text-[var(--cp-faint)]">
      Automated texts may be delayed until carrier (A2P) approval.
    </p>
  );

  // Neither on file: caller disables the send button; surface the reason here.
  if (!hasPhone && !hasEmail) {
    return (
      <p className="text-[12.5px] text-[var(--cp-warn)]">
        Add a phone or email to send this estimate.
      </p>
    );
  }

  // Only email (or phone present but opted out and no email would be the neither
  // case above): email-only path.
  if (hasEmail && (!hasPhone || textBlocked)) {
    return (
      <div>
        <p className="text-[12.5px] text-[var(--cp-muted)]">
          Emailing {email.trim()}
          {hasPhone && textBlocked && " — customer opted out of texts"}
        </p>
        {disclaimer}
      </div>
    );
  }

  // Only phone.
  if (hasPhone && !hasEmail) {
    if (textBlocked) {
      return (
        <p className="text-[12.5px] text-[var(--cp-warn)]">
          This customer opted out of texts and has no email. Add an email to send.
        </p>
      );
    }
    return (
      <div>
        <p className="text-[12.5px] text-[var(--cp-muted)] tabular-nums">Texting {fmtPhone(phone.trim())}</p>
        {disclaimer}
      </div>
    );
  }

  // Both on file → segmented Text / Email / Both.
  return (
    <div>
      <div className="grid grid-cols-3 gap-1 rounded-md border border-[var(--cp-line)] bg-[var(--cp-surface)] p-1">
        {segment(choice === "text", "Text", () => onChange("text"), disabled || textBlocked)}
        {segment(choice === "email", "Email", () => onChange("email"), disabled)}
        {segment(choice === "both", "Both", () => onChange("both"), disabled || textBlocked)}
      </div>
      {textBlocked && (
        <p className="mt-1.5 text-[12px] text-[var(--cp-faint)]">Opted out of texts — sending by email.</p>
      )}
      {disclaimer}
    </div>
  );
}
