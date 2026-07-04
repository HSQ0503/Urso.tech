"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, Phone } from "lucide-react";
import {
  ET,
  STATUS_CLASS,
  STATUS_LABEL,
  fmtEt,
  fmtPhone,
  type Lead,
  type Message,
} from "@/lib/canes/types";
import { Composer } from "./composer";

// Right pane of the inbox: contact header, message stream, composer.

const etDay = new Intl.DateTimeFormat("en-US", { timeZone: ET, dateStyle: "short" });

function stamp(iso: string): string {
  const today = etDay.format(new Date(iso)) === etDay.format(new Date());
  return today
    ? fmtEt(iso, { hour: "numeric", minute: "2-digit" })
    : fmtEt(iso, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function Conversation({
  peerPhone,
  lead,
  messages,
}: {
  peerPhone: string;
  lead: Lead | null;
  messages: Message[];
}) {
  const streamRef = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;

  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--cp-line)] px-3 py-3 md:px-4">
        <Link
          href="/CanesPressure/inbox"
          aria-label="Back to inbox"
          className="-ml-1 flex h-11 w-9 items-center justify-center rounded-lg text-[var(--cp-muted)] md:hidden"
        >
          <ChevronLeft size={22} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold">
              {lead?.name ?? fmtPhone(peerPhone)}
            </h2>
            {lead && (
              <span
                className={`cp-chip shrink-0 ${lead.type === "hot" ? "cp-badge-hot" : "cp-badge-cold"}`}
              >
                {lead.type === "hot" ? "Hot" : "Cold"}
              </span>
            )}
            {lead && (
              <span className={`cp-chip shrink-0 ${STATUS_CLASS[lead.status]}`}>
                {STATUS_LABEL[lead.status]}
              </span>
            )}
          </div>
          {lead?.name && (
            <p className="text-[12px] tabular-nums text-[var(--cp-muted)]">{fmtPhone(peerPhone)}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {lead && (
            <Link href={`/CanesPressure/leads/${lead.id}`} className="cp-btn cp-btn-sm">
              Open lead
            </Link>
          )}
          <a href={`tel:${peerPhone}`} className="cp-btn cp-btn-sm">
            <Phone size={14} />
            Call
          </a>
        </div>
      </div>

      <div
        ref={streamRef}
        className="cp-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-4 md:px-4"
      >
        {messages.length === 0 && (
          <p className="m-auto text-[13px] text-[var(--cp-muted)]">No messages in this thread yet.</p>
        )}
        {messages.map((m) => {
          const out = m.direction === "out";
          return (
            <div
              key={m.id}
              className={`flex max-w-[78%] flex-col ${out ? "items-end self-end" : "items-start self-start"}`}
            >
              {out && m.automated && (
                <span className="mb-0.5 text-[11px] font-medium opacity-70">Auto</span>
              )}
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
              {m.delivery_status === "failed" && (
                <span className="text-[11px] font-medium text-[var(--cp-danger)]">
                  Not delivered
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-[var(--cp-line)] px-3 py-3 md:px-4">
        <Composer peerPhone={peerPhone} leadId={lead?.id ?? null} />
      </div>
    </div>
  );
}
