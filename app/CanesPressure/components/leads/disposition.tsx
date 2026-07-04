"use client";

import { useState, useTransition } from "react";
import { CalendarClock, MessageSquareText, PhoneForwarded } from "lucide-react";
import {
  initiateCall,
  logCallOutcome,
  sendConfirmationNow,
  setAppointment,
  setLeadStatus,
  snoozeLead,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import { etLocalToIso, fmtEt, STATUS_LABEL, type LeadStatus } from "@/lib/canes/types";
import { isCompleteWhen, SchedulePicker } from "./schedule-picker";

// Every interactive widget for the lead-profile rail lives here: the profile
// page is a Server Component, so the dispositions, call bridge, status,
// appointment, and snooze controls all need one small client home.

type Feedback = { ok: boolean; text: string } | null;

function useAction() {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  function run(fn: () => Promise<ActionResult>, onOk?: () => void) {
    setFeedback(null);
    startTransition(async () => {
      const res = await fn();
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
      if (res.ok) onOk?.();
    });
  }
  return { isPending, feedback, run };
}

function Notice({ value }: { value: Feedback }) {
  if (!value) return null;
  return (
    <p className={`text-[12.5px] leading-snug ${value.ok ? "text-[var(--cp-good)]" : "text-[var(--cp-warn)]"}`}>
      {value.text}
    </p>
  );
}

// ── Post-call dispositions ───────────────────────────────────────────────────
// "Closed" over the phone means the estimate visit is booked, so it only calls
// setAppointment — that action moves the lead to appointment_set and schedules
// the confirmation text.

export function Disposition({ leadId }: { leadId: string }) {
  const { isPending, feedback, run } = useAction();
  const [mode, setMode] = useState<"closed" | "lost" | null>(null);
  const [when, setWhen] = useState("");
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="cp-btn cp-btn-sm"
          disabled={isPending}
          onClick={() => setMode(mode === "closed" ? null : "closed")}
        >
          Closed - book estimate
        </button>
        <button
          type="button"
          className="cp-btn cp-btn-sm"
          disabled={isPending}
          onClick={() => run(() => logCallOutcome(leadId, "follow_up"))}
        >
          Follow up
        </button>
        <button
          type="button"
          className="cp-btn cp-btn-sm"
          disabled={isPending}
          onClick={() => run(() => logCallOutcome(leadId, "no_answer"))}
        >
          No answer
        </button>
        <button
          type="button"
          className="cp-btn cp-btn-sm cp-btn-danger"
          disabled={isPending}
          onClick={() => setMode(mode === "lost" ? null : "lost")}
        >
          Lost
        </button>
      </div>

      {mode === "closed" && (
        <div className="space-y-2.5">
          <SchedulePicker value={when} onChange={setWhen} />
          <button
            type="button"
            className="cp-btn cp-btn-primary w-full"
            disabled={!isCompleteWhen(when) || isPending}
            onClick={() =>
              run(
                () => setAppointment(leadId, etLocalToIso(when)),
                () => {
                  setMode(null);
                  setWhen("");
                },
              )
            }
          >
            {isPending ? "Booking..." : "Book estimate visit"}
          </button>
        </div>
      )}

      {mode === "lost" && (
        <div className="flex gap-2">
          <input
            className="cp-input flex-1"
            placeholder="Why did we lose it?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            type="button"
            className="cp-btn cp-btn-danger"
            disabled={isPending}
            onClick={() =>
              run(
                () => logCallOutcome(leadId, "lost", reason.trim() || undefined),
                () => {
                  setMode(null);
                  setReason("");
                },
              )
            }
          >
            Confirm
          </button>
        </div>
      )}

      <Notice value={feedback} />
    </div>
  );
}

// ── One-shot buttons ─────────────────────────────────────────────────────────

export function BridgeCallButton({ leadId }: { leadId: string }) {
  const { isPending, feedback, run } = useAction();
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        className="cp-btn w-full"
        disabled={isPending}
        onClick={() => run(() => initiateCall(leadId))}
      >
        <PhoneForwarded size={16} strokeWidth={2} />
        {isPending ? "Connecting..." : "Bridge via business line"}
      </button>
      <Notice value={feedback} />
    </div>
  );
}

export function ResendConfirmationButton({ leadId }: { leadId: string }) {
  const { isPending, feedback, run } = useAction();
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        className="cp-btn w-full"
        disabled={isPending}
        onClick={() => run(() => sendConfirmationNow(leadId))}
      >
        <MessageSquareText size={16} strokeWidth={2} />
        {isPending ? "Sending..." : "Resend confirmation"}
      </button>
      <Notice value={feedback} />
    </div>
  );
}

// ── Status ───────────────────────────────────────────────────────────────────

export function StatusCard({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const { isPending, feedback, run } = useAction();
  const [lostOpen, setLostOpen] = useState(false);
  const [reason, setReason] = useState("");

  const apply = (next: LeadStatus, lostReason?: string) =>
    run(
      () => setLeadStatus(leadId, next, lostReason),
      () => {
        setLostOpen(false);
        setReason("");
      },
    );

  return (
    <div className="space-y-2.5">
      <select
        className="cp-select"
        value={status}
        disabled={isPending}
        onChange={(e) => apply(e.target.value as LeadStatus)}
      >
        {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((s) => (
          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          type="button"
          className="cp-btn cp-btn-sm flex-1"
          disabled={isPending || status === "won"}
          onClick={() => apply("won")}
        >
          Won
        </button>
        <button
          type="button"
          className="cp-btn cp-btn-sm cp-btn-danger flex-1"
          disabled={isPending}
          onClick={() => setLostOpen((v) => !v)}
        >
          Lost
        </button>
      </div>
      {lostOpen && (
        <div className="flex gap-2">
          <input
            className="cp-input flex-1"
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            type="button"
            className="cp-btn cp-btn-sm cp-btn-danger"
            disabled={isPending}
            onClick={() => apply("lost", reason.trim() || undefined)}
          >
            Confirm
          </button>
        </div>
      )}
      <Notice value={feedback} />
    </div>
  );
}

// ── Appointment ──────────────────────────────────────────────────────────────

export function AppointmentCard({
  leadId,
  appointmentAt,
  offsetHours,
}: {
  leadId: string;
  appointmentAt: string | null;
  offsetHours: number;
}) {
  const { isPending, feedback, run } = useAction();
  const [when, setWhen] = useState("");

  return (
    <div className="space-y-2.5">
      <p className="text-[13.5px] tabular-nums">
        {appointmentAt ? (
          <>Currently <span className="font-semibold">{fmtEt(appointmentAt)}</span></>
        ) : (
          <span className="text-[var(--cp-muted)]">No visit scheduled.</span>
        )}
      </p>
      <SchedulePicker value={when} onChange={setWhen} />
      <button
        type="button"
        className="cp-btn cp-btn-sm w-full"
        disabled={!isCompleteWhen(when) || isPending}
        onClick={() => run(() => setAppointment(leadId, etLocalToIso(when)), () => setWhen(""))}
      >
        <CalendarClock size={15} strokeWidth={2} />
        {isPending ? "Saving..." : appointmentAt ? "Reschedule" : "Save"}
      </button>
      <p className="text-[12px] leading-snug text-[var(--cp-faint)]">
        Confirmation text goes out automatically {offsetHours}h before the visit.
      </p>
      <Notice value={feedback} />
    </div>
  );
}

// ── Snooze ───────────────────────────────────────────────────────────────────

const SNOOZES = [
  { label: "Tomorrow", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "Next week", hours: 168 },
] as const;

export function SnoozeCard({ leadId, snoozedUntil }: { leadId: string; snoozedUntil: string | null }) {
  const { isPending, feedback, run } = useAction();
  const [mountedAt] = useState(() => Date.now());
  const active = snoozedUntil !== null && new Date(snoozedUntil).getTime() > mountedAt;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-2">
        {SNOOZES.map((s) => (
          <button
            key={s.label}
            type="button"
            className="cp-btn cp-btn-sm flex-1"
            disabled={isPending}
            onClick={() =>
              run(() => snoozeLead(leadId, new Date(Date.now() + s.hours * 3_600_000).toISOString()))
            }
          >
            {s.label}
          </button>
        ))}
      </div>
      {active && (
        <p className="text-[12.5px] tabular-nums text-[var(--cp-muted)]">
          Snoozed until {fmtEt(snoozedUntil)}
        </p>
      )}
      <Notice value={feedback} />
    </div>
  );
}
