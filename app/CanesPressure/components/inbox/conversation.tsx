"use client";

import { Fragment, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  FileText,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Voicemail,
} from "lucide-react";
import {
  ET,
  STATUS_CLASS,
  STATUS_LABEL,
  fmtCallDuration,
  fmtEt,
  fmtPhone,
  isMissedCall,
  type Call,
  type Lead,
  type Message,
  type ThreadKind,
} from "@/lib/canes/types";
import { Composer } from "./composer";

// Right pane of the inbox: contact header, then one chronological stream of
// SMS bubbles and call events (OpenPhone-style), then the composer.

const etDay = new Intl.DateTimeFormat("en-US", { timeZone: ET, dateStyle: "short" });

function stamp(iso: string): string {
  const today = etDay.format(new Date(iso)) === etDay.format(new Date());
  return today
    ? fmtEt(iso, { hour: "numeric", minute: "2-digit" })
    : fmtEt(iso, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function CallEvent({ call }: { call: Call }) {
  const out = call.direction === "out";
  const missed = isMissedCall(call);
  const voicemail = missed && Boolean(call.recording_url || call.transcript);
  const duration = fmtCallDuration(call.duration_seconds);

  const Icon = voicemail ? Voicemail : missed ? PhoneMissed : out ? PhoneOutgoing : PhoneIncoming;
  const title = voicemail
    ? "Voicemail"
    : missed
      ? "Missed call"
      : out && call.status !== "completed"
        ? "No answer"
        : "Call ended";
  const detail = out
    ? `You called${duration ? ` · ${duration}` : ""}`
    : missed
      ? voicemail
        ? "They left a message"
        : "No one answered"
      : `Answered${duration ? ` · ${duration}` : ""}`;

  return (
    <div className={`flex max-w-[78%] flex-col ${out ? "items-end self-end" : "items-start self-start"}`}>
      <div className={`cp-call-card ${out ? "cp-call-card-out" : ""}`}>
        <div className="flex items-center gap-2">
          <Icon
            size={15}
            strokeWidth={2}
            className={`shrink-0 ${
              missed && !voicemail ? "text-[var(--cp-danger)]" : "text-[var(--cp-muted)]"
            }`}
          />
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold leading-tight">{title}</p>
            <p className="text-[12px] leading-tight text-[var(--cp-muted)]">{detail}</p>
          </div>
        </div>
        {call.recording_url && <audio controls preload="none" src={call.recording_url} />}
        {call.transcript && (
          <p className="border-l-2 border-[var(--cp-line-strong)] pl-2.5 text-[12.5px] italic leading-snug text-[var(--cp-muted)]">
            {call.transcript}
          </p>
        )}
      </div>
      <span className="mt-1 text-[11px] tabular-nums text-[var(--cp-faint)]">{stamp(call.created_at)}</span>
    </div>
  );
}

// An outbound estimate text carries the customer link "…/CanesPressure/e/<token>".
// Pull the URL out so we can render a tidy card with an "open" action instead of
// a raw link bubble. Display-only; no schema change.
const ESTIMATE_LINK = /\bhttps?:\/\/\S*\/CanesPressure\/e\/\S+/;

function estimateUrl(body: string): string | null {
  return body.match(ESTIMATE_LINK)?.[0] ?? null;
}

// Mirrors CallEvent's outbound inline-event card: the estimate-sent marker in
// the thread, with a link to open the customer estimate page.
function EstimateSentCard({ url, title, automated, at }: { url: string; title: string; automated: boolean; at: string }) {
  return (
    <div className="flex max-w-[78%] flex-col items-end self-end">
      {automated && <span className="cp-mono mb-0.5">Auto</span>}
      <div className="cp-call-card cp-call-card-out">
        <div className="flex items-center gap-2">
          <FileText size={15} strokeWidth={2} className="shrink-0 text-[var(--cp-muted)]" />
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold leading-tight">{title}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-medium leading-tight text-[var(--cp-brand-fill)] hover:underline"
            >
              Open estimate
            </a>
          </div>
        </div>
      </div>
      <span className="mt-1 text-[11px] tabular-nums text-[var(--cp-faint)]">{stamp(at)}</span>
    </div>
  );
}

type StreamItem = { at: string; key: string; node: React.ReactNode };

// The thread readers cap what they return (500 messages / 200 calls); render
// only the newest slice so a very long thread opens at its latest activity
// instead of an old page of history.
const MAX_STREAM_ITEMS = 400;

export function Conversation({
  peerPhone,
  lead,
  displayName,
  kind,
  contactId,
  messages,
  calls,
}: {
  peerPhone: string;
  lead: Lead | null;
  displayName: string | null;
  kind: ThreadKind;
  contactId: string | null;
  messages: Message[];
  calls: Call[];
}) {
  const isVendor = kind === "vendor";
  const streamRef = useRef<HTMLDivElement>(null);
  const lastKey = messages[messages.length - 1]?.id ?? calls[calls.length - 1]?.id;

  // A lead parsed from a vendor blob starts its thread with an outbound hold
  // text; surface the originating vendor text so the conversation has context.
  const originNote = !isVendor && lead?.source === "lead_vendor" && Boolean(lead.raw_message);

  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastKey]);

  const stream: StreamItem[] = [
    ...messages.map((m) => {
      const out = m.direction === "out";
      const estUrl = out ? estimateUrl(m.body) : null;
      if (estUrl) {
        // Both the initial send and the day-2/5 reminders carry the /e/ link;
        // the reminder body says "following up", so label the card accordingly.
        const title = /following up/i.test(m.body) ? "Estimate reminder" : "Estimate sent";
        return {
          at: m.created_at,
          key: `m-${m.id}`,
          node: <EstimateSentCard url={estUrl} title={title} automated={Boolean(m.automated)} at={m.created_at} />,
        };
      }
      return {
        at: m.created_at,
        key: `m-${m.id}`,
        node: (
          <div className={`flex max-w-[78%] flex-col ${out ? "items-end self-end" : "items-start self-start"}`}>
            {out && m.automated && <span className="cp-mono mb-0.5">Auto</span>}
            <div
              className={`${
                out ? (m.automated ? "cp-bubble-out cp-bubble-auto" : "cp-bubble-out") : "cp-bubble-in"
              } whitespace-pre-wrap break-words px-3.5 py-2 text-[14px] leading-relaxed`}
            >
              {m.body}
            </div>
            <span className="mt-1 text-[11px] tabular-nums text-[var(--cp-faint)]">
              {stamp(m.created_at)}
            </span>
            {(m.delivery_status === "failed" || m.delivery_status === "undelivered") && (
              <span className="text-[11px] font-medium text-[var(--cp-danger)]">Not delivered</span>
            )}
          </div>
        ),
      };
    }),
    ...calls.map((c) => ({ at: c.created_at, key: `c-${c.id}`, node: <CallEvent call={c} /> })),
  ]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-MAX_STREAM_ITEMS);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--cp-line)] px-3 py-3 md:px-4">
        <Link
          href="/CanesPressure/inbox"
          aria-label="Back to inbox"
          className="-ml-1 flex h-11 w-9 items-center justify-center rounded-md text-[var(--cp-muted)] md:hidden"
        >
          <ChevronLeft size={22} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold">
              {isVendor ? "Lead vendor" : (displayName ?? fmtPhone(peerPhone))}
            </h2>
            {isVendor && (
              <span className="cp-chip shrink-0 bg-[var(--cp-bg)] text-[var(--cp-muted)]">Vendor</span>
            )}
            {kind === "customer" && (
              <span className="cp-chip shrink-0 bg-[var(--cp-bg)] text-[var(--cp-muted)]">
                Customer
              </span>
            )}
            {kind === "lead" && lead && (
              <span
                className={`cp-chip shrink-0 ${lead.type === "hot" ? "cp-badge-hot" : "cp-badge-cold"}`}
              >
                {lead.type === "hot" ? "Hot" : "Cold"}
              </span>
            )}
            {kind === "lead" && lead && (
              <span className={`cp-chip shrink-0 ${STATUS_CLASS[lead.status]} xl:hidden`}>
                {STATUS_LABEL[lead.status]}
              </span>
            )}
          </div>
          {(isVendor || displayName) && (
            <p className="text-[12px] tabular-nums text-[var(--cp-muted)]">{fmtPhone(peerPhone)}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 xl:hidden">
          {kind === "customer" && contactId && (
            <Link href={`/CanesPressure/customers/${contactId}`} className="cp-btn cp-btn-sm">
              View profile
            </Link>
          )}
          {kind === "lead" && lead && (
            <Link href={`/CanesPressure/leads/${lead.id}`} className="cp-btn cp-btn-sm">
              Open lead
            </Link>
          )}
          <a href={`tel:${peerPhone}`} className="cp-btn cp-btn-sm">
            <Phone size={14} strokeWidth={2} />
            Call
          </a>
        </div>
      </div>

      <div
        ref={streamRef}
        className="cp-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-4 md:px-4"
      >
        {isVendor && (
          <p className="mx-auto mb-1 max-w-[420px] rounded-lg bg-[var(--cp-bg)] px-3 py-2 text-center text-[12px] leading-snug text-[var(--cp-muted)]">
            Texts from your lead vendor land here and become lead cards automatically. Each
            customer gets their own conversation.
          </p>
        )}
        {originNote && lead && (
          <div className="flex max-w-[78%] flex-col items-start self-start">
            <div className="rounded-2xl border border-dashed border-[var(--cp-line-strong)] bg-[var(--cp-bg)] px-3.5 py-2">
              <p className="cp-mono">From the lead vendor</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--cp-muted)]">
                {lead.raw_message}
              </p>
            </div>
            <span className="mt-1 text-[11px] tabular-nums text-[var(--cp-faint)]">
              {stamp(lead.created_at)}
            </span>
          </div>
        )}
        {stream.length === 0 && !isVendor && !originNote && (
          <p className="m-auto text-[13px] text-[var(--cp-muted)]">No messages in this thread yet.</p>
        )}
        {stream.map((item) => (
          <Fragment key={item.key}>{item.node}</Fragment>
        ))}
      </div>

      <div className="border-t border-[var(--cp-line)] px-3 py-3 md:px-4">
        <Composer peerPhone={peerPhone} leadId={lead?.id ?? null} />
      </div>
    </div>
  );
}
