"use client";

import { useId } from "react";

// Shared send-channel picker for the estimate builder and the estimate/invoice
// action rails. Adapts to what's on file: phone + email → a Text / Email / Both
// segment (default Both); one contact method → a plain "we'll text/email" line;
// neither → nothing to pick (the caller disables send). Opt-out disables Text
// with a muted note. A "Send to a different contact" disclosure lets the owner
// redirect the send to a custom email/phone; those overrides ride through the
// send actions' toEmail/toPhone params and are persisted server-side. Purely
// presentational otherwise — the server recomputes effective channels on send.

export type SendChannels = { email: boolean; text: boolean };
export type ChannelChoice = "text" | "email" | "both";

export function choiceToChannels(choice: ChannelChoice): SendChannels {
  return { text: choice !== "email", email: choice !== "text" };
}

// Owner-entered custom destination. Parent owns the state so it can build the
// send action's override params from it.
export type SendOverride = { enabled: boolean; email: string; phone: string };

export const EMPTY_OVERRIDE: SendOverride = { enabled: false, email: "", phone: "" };

// Mirrors EMAIL_RE in actions.ts so the inline check agrees with the server.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

// US numbers only: 10 digits, or 11 with a leading 1 (matches toE164).
export function isValidUsPhone(v: string): boolean {
  const digits = v.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

// Renders raw input or stored E.164 as (XXX) XXX-XXXX when it parses as US.
function displayPhone(v: string): string {
  const digits = v.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  return v;
}

export type SendTarget = {
  phone: string;
  email: string;
  phoneInvalid: boolean;
  emailInvalid: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  textBlocked: boolean;
  canSend: boolean;
};

// The destination a send will actually use: a valid override entry beats the
// on-file contact, field by field. An invalid entry never falls back silently —
// it zeroes that channel and blocks send until fixed or cleared.
export function resolveSendTarget(opts: {
  phone: string;
  email: string;
  optedOut: boolean;
  override?: SendOverride;
}): SendTarget {
  const oPhone = opts.override?.enabled ? opts.override.phone.trim() : "";
  const oEmail = opts.override?.enabled ? opts.override.email.trim() : "";
  const phoneInvalid = Boolean(oPhone) && !isValidUsPhone(oPhone);
  const emailInvalid = Boolean(oEmail) && !isValidEmail(oEmail);
  const phone = oPhone ? (phoneInvalid ? "" : oPhone) : opts.phone.trim();
  const email = oEmail ? (emailInvalid ? "" : oEmail) : opts.email.trim();
  const hasPhone = Boolean(phone);
  const hasEmail = Boolean(email);
  const textBlocked = opts.optedOut;
  const canSend = !phoneInvalid && !emailInvalid && (hasEmail || (hasPhone && !textBlocked));
  return { phone, email, phoneInvalid, emailInvalid, hasPhone, hasEmail, textBlocked, canSend };
}

// Override params for sendEstimate/sendInvoice — only valid entries go through,
// so the row is never patched with a value the server would reject.
export function overrideSendOpts(o: SendOverride): { toEmail?: string; toPhone?: string } {
  if (!o.enabled) return {};
  const out: { toEmail?: string; toPhone?: string } = {};
  const email = o.email.trim();
  const phone = o.phone.trim();
  if (email && isValidEmail(email)) out.toEmail = email;
  if (phone && isValidUsPhone(phone)) out.toPhone = phone;
  return out;
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
  override,
  onOverrideChange,
}: {
  phone: string;
  email: string;
  optedOut: boolean;
  choice: ChannelChoice;
  onChange: (choice: ChannelChoice) => void;
  disabled?: boolean;
  // When both are provided the picker grows the "Send to a different contact"
  // disclosure; the parent threads the values into the send action.
  override?: SendOverride;
  onOverrideChange?: (o: SendOverride) => void;
}) {
  const uid = useId();
  const target = resolveSendTarget({ phone, email, optedOut, override });
  const { hasPhone, hasEmail, textBlocked } = target;

  const disclaimer = (
    <p className="mt-1.5 text-[12px] text-[var(--cp-faint)]">
      Automated texts may be delayed until carrier (A2P) approval.
    </p>
  );

  let channelArea: React.ReactNode;
  if (!hasPhone && !hasEmail) {
    // Neither reachable: caller disables the send button; surface the reason.
    channelArea = (
      <p className="text-[12.5px] text-[var(--cp-warn)]">
        Add a phone or email to send this.
      </p>
    );
  } else if (hasEmail && (!hasPhone || textBlocked)) {
    channelArea = (
      <p className="text-[12.5px] text-[var(--cp-muted)]">
        Emailing {target.email}
        {hasPhone && textBlocked && " — customer opted out of texts"}
      </p>
    );
  } else if (hasPhone && !hasEmail) {
    channelArea = textBlocked ? (
      <p className="text-[12.5px] text-[var(--cp-warn)]">
        This customer opted out of texts and has no email. Add an email to send.
      </p>
    ) : (
      <p className="text-[12.5px] text-[var(--cp-muted)] tabular-nums">
        Texting {displayPhone(target.phone)}
      </p>
    );
  } else {
    // Both reachable → segmented Text / Email / Both.
    channelArea = (
      <div>
        <div className="grid grid-cols-3 gap-1 rounded-md border border-[var(--cp-line)] bg-[var(--cp-surface)] p-1">
          {segment(choice === "text", "Text", () => onChange("text"), disabled || textBlocked)}
          {segment(choice === "email", "Email", () => onChange("email"), disabled)}
          {segment(choice === "both", "Both", () => onChange("both"), disabled || textBlocked)}
        </div>
        {textBlocked && (
          <p className="mt-1.5 text-[12px] text-[var(--cp-faint)]">Opted out of texts — sending by email.</p>
        )}
      </div>
    );
  }

  // Plain-words summary of exactly where the send will land, given the current
  // channel choice and any overrides.
  const chosen = choiceToChannels(choice);
  const parts: string[] = [];
  if (chosen.text && hasPhone && !textBlocked) parts.push(`text ${displayPhone(target.phone)}`);
  if (chosen.email && hasEmail) parts.push(`email ${target.email}`);
  const summary = parts.length > 0 ? `Will ${parts.join(" and ")}.` : "Nowhere to send yet.";

  const overrideArea = override && onOverrideChange && (
    <div className="mt-2.5">
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-[var(--cp-muted)]">
        <input
          type="checkbox"
          checked={override.enabled}
          onChange={(e) => onOverrideChange({ ...override, enabled: e.target.checked })}
          disabled={disabled}
        />
        Send to a different contact
      </label>
      {override.enabled && (
        <div className="mt-2 space-y-2.5">
          <div>
            <label className="cp-label" htmlFor={`${uid}-email`}>Other email</label>
            <input
              id={`${uid}-email`}
              type="email"
              className="cp-input"
              value={override.email}
              onChange={(e) => onOverrideChange({ ...override, email: e.target.value })}
              disabled={disabled}
              placeholder="name@email.com"
            />
            {target.emailInvalid && (
              <p className="mt-1 text-[12px] text-[var(--cp-warn)]">That email doesn&apos;t look right.</p>
            )}
          </div>
          <div>
            <label className="cp-label" htmlFor={`${uid}-phone`}>Other phone</label>
            <input
              id={`${uid}-phone`}
              type="tel"
              className="cp-input tabular-nums"
              value={override.phone}
              onChange={(e) => onOverrideChange({ ...override, phone: e.target.value })}
              disabled={disabled}
              placeholder="(561) 555-0123"
            />
            {target.phoneInvalid && (
              <p className="mt-1 text-[12px] text-[var(--cp-warn)]">Enter a 10 digit US number.</p>
            )}
          </div>
          <p className="text-[12px] tabular-nums text-[var(--cp-faint)]">{summary}</p>
        </div>
      )}
    </div>
  );

  return (
    <div>
      {channelArea}
      {overrideArea}
      {disclaimer}
    </div>
  );
}
