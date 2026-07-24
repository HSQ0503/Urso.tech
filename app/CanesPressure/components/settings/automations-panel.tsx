"use client";

import { useState, useTransition } from "react";
import { Info } from "lucide-react";
import { saveSettings, type ActionResult } from "@/app/CanesPressure/actions";
import type { CanesSettings } from "@/lib/canes/types";

// Read-mostly overview of every automation that fires once the Twilio number is
// live. Wording lives in the template editors above — this card only shows each
// trigger and its timing, plus the two reminder-day lists that are edited here.

type Notice = { ok: boolean; text: string } | null;

function ChannelChip({ channel }: { channel: "Text" | "Email" }) {
  return (
    <span className="rounded-full bg-[var(--cp-cold-bg)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--cp-cold)]">
      {channel}
    </span>
  );
}

function AutomationRow({
  name,
  description,
  config,
  channel,
}: {
  name: string;
  description: string;
  config: string;
  channel: "Text" | "Email";
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
          {name}
          <ChannelChip channel={channel} />
        </p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--cp-muted)]">{description}</p>
      </div>
      <p className="shrink-0 text-[12.5px] font-semibold tabular-nums">{config}</p>
    </div>
  );
}

function DayListRow({
  name,
  description,
  days,
  save,
}: {
  name: string;
  description: string;
  days: number[];
  save: (days: number[]) => Promise<ActionResult>;
}) {
  const [draft, setDraft] = useState(days.join(", "));
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
    const parsed = parts.map(Number);
    if (parsed.some((n) => !Number.isInteger(n) || n < 1 || n > 365)) {
      setNotice({ ok: false, text: "Use whole days between 1 and 365, e.g. 2, 5, 10." });
      return;
    }
    const unique = [...new Set(parsed)].sort((a, b) => a - b);
    startTransition(async () => {
      const res = await save(unique);
      setNotice(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.notice ?? "Could not save." });
      if (res.ok) setDraft(unique.join(", "));
    });
  };

  return (
    <div className="py-3">
      <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
        {name}
        <ChannelChip channel="Text" />
      </p>
      <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--cp-muted)]">{description}</p>
      <div className="mt-2 flex max-w-[320px] gap-2">
        <input
          className="cp-input min-h-[44px] md:min-h-[38px]"
          inputMode="numeric"
          aria-label={`${name} days`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSave();
            }
          }}
        />
        <button
          type="button"
          className="cp-btn min-h-[44px] shrink-0 cursor-pointer md:min-h-9"
          onClick={onSave}
          disabled={pending}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="mt-1 text-[12px] text-[var(--cp-faint)]">
        Days after sending, comma-separated. Leave empty to turn these off.
      </p>
      {notice && (
        <p
          className="mt-1 text-[12.5px] font-medium"
          style={{ color: notice.ok ? "var(--cp-good)" : "var(--cp-warn)" }}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}

export function AutomationsPanel({ settings }: { settings: CanesSettings }) {
  return (
    <section className="cp-card rounded-xl p-4 md:rounded-md md:p-5">
      <h2 className="text-[15px] font-semibold">Automations</h2>
      <p className="mt-1 text-[13px] text-[var(--cp-muted)]">
        Everything that fires on its own once the phone number is live. The wording for each
        text comes from the templates above.
      </p>

      <div className="mt-3 flex items-start gap-2.5 rounded-md bg-[var(--cp-cold-bg)] px-3 py-2.5">
        <Info aria-hidden size={15} className="mt-0.5 shrink-0 text-[var(--cp-cold)]" />
        <p className="text-[12.5px] leading-snug text-[var(--cp-muted)]">
          Outbound texts queue until the number&rsquo;s A2P registration is approved, then send
          automatically. Email alerts already work today.
        </p>
      </div>

      <div className="mt-2 flex flex-col">
        <AutomationRow
          name="New-lead greeting"
          description="Sent the moment a form submission or vendor lead arrives, so they know a call is coming. Uses the Hold text template."
          config="Instant"
          channel="Text"
        />
        <div className="cp-divider" />
        <AutomationRow
          name="Estimate-visit confirmation"
          description="Asks the customer to reply YES before the estimate visit; a final notice follows if they haven't. Uses the Appointment confirmation template."
          config={`${settings.confirmation_offset_hours}h before · final ${settings.confirmation_final_offset_hours}h`}
          channel="Text"
        />
        <div className="cp-divider" />
        <AutomationRow
          name="Day-before job confirmation"
          description="Reminds the customer their scheduled job is coming up."
          config={`${settings.job_confirmation_offset_hours}h before`}
          channel="Text"
        />
        <div className="cp-divider" />
        <DayListRow
          name="Estimate follow-ups"
          description="Nudges a customer who hasn't answered an estimate."
          days={settings.estimate_reminder_days}
          save={(days) => saveSettings({ estimate_reminder_days: days })}
        />
        <div className="cp-divider" />
        <DayListRow
          name="Invoice reminders"
          description="Chases an unpaid invoice."
          days={settings.invoice_reminder_days}
          save={(days) => saveSettings({ invoice_reminder_days: days })}
        />
        <div className="cp-divider" />
        <AutomationRow
          name="Morning digest"
          description="Today's jobs, unconfirmed visits and overdue invoices, in your inbox."
          config="7:00 AM ET"
          channel="Email"
        />
      </div>

      <p className="mt-2 text-[12px] text-[var(--cp-faint)]">
        Texts respect the quiet hours set above and queue for the morning instead.
      </p>
    </section>
  );
}
