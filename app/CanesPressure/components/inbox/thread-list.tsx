"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
import { fmtEt, fmtPhone, isMissedCall, isVendorThread, minutesSince, type Thread } from "@/lib/canes/types";

// Left pane of the inbox: one row per conversation (SMS or calls), newest
// activity first. Call-only threads get OpenPhone-style call previews.

// Silent poll — new inbound texts show up without a manual reload.
export function InboxPoll() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}

function relTime(iso: string): string {
  const m = minutesSince(iso);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 24 * 60) return `${Math.floor(m / 60)}h`;
  if (m < 7 * 24 * 60) return fmtEt(iso, { weekday: "short" });
  return fmtEt(iso, { month: "short", day: "numeric" });
}

// What the row's one-line preview shows: the newest event, message or call.
function Preview({ t }: { t: Thread }) {
  const callIsNewest =
    t.last_call && (!t.last_message || t.last_call.created_at > t.last_message.created_at);

  if (callIsNewest && t.last_call) {
    const c = t.last_call;
    const missed = isMissedCall(c);
    const Icon = missed ? PhoneMissed : c.direction === "out" ? PhoneOutgoing : PhoneIncoming;
    const text = missed
      ? c.recording_url || c.transcript
        ? "Voicemail"
        : "Missed call"
      : c.direction === "out"
        ? c.status === "completed"
          ? "You called"
          : "You called · no answer"
        : "Incoming call";
    return (
      <span
        className={`inline-flex min-w-0 items-center gap-1.5 truncate text-[13px] ${
          missed ? "font-medium text-[var(--cp-danger)]" : "text-[var(--cp-muted)]"
        }`}
      >
        <Icon size={13} strokeWidth={2} className="shrink-0" />
        {text}
      </span>
    );
  }

  if (!t.last_message) return null;
  const preview = t.last_message.body.replace(/\s+/g, " ").trim();
  return (
    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--cp-muted)]">
      {t.last_message.direction === "out" ? `You: ${preview}` : preview}
    </span>
  );
}

export function ThreadList({
  threads,
  activePhone,
  vendorPhones,
}: {
  threads: Thread[];
  activePhone: string | null;
  vendorPhones: string[];
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--cp-line)] px-4 py-3">
        <h1 className="cp-display text-[17px]">Inbox</h1>
        <span className="cp-chip bg-[var(--cp-bg)] text-[var(--cp-muted)]">{threads.length}</span>
      </div>
      <ul className="cp-scroll min-h-0 flex-1 divide-y divide-[var(--cp-line)] overflow-y-auto">
        {threads.length === 0 && (
          <li className="px-4 py-6 text-[13px] text-[var(--cp-muted)]">No conversations yet.</li>
        )}
        {threads.map((t) => {
          const active = t.peer_phone === activePhone;
          const isVendor = isVendorThread(t, vendorPhones);
          return (
            <li key={t.peer_phone}>
              <Link
                href={`/CanesPressure/inbox?t=${encodeURIComponent(t.peer_phone)}`}
                className={`block min-h-[44px] px-4 py-3 transition-colors ${
                  active ? "bg-[var(--cp-brand-soft)]" : "hover:bg-[var(--cp-hover)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-semibold">
                    {isVendor ? "Lead vendor" : (t.lead?.name ?? fmtPhone(t.peer_phone))}
                  </span>
                  {!isVendor && t.lead && (
                    <span
                      className={`cp-chip shrink-0 ${t.lead.type === "hot" ? "cp-badge-hot" : "cp-badge-cold"}`}
                    >
                      {t.lead.type === "hot" ? "Hot" : "Cold"}
                    </span>
                  )}
                  {isVendor && (
                    <span className="cp-chip shrink-0 bg-[var(--cp-bg)] text-[var(--cp-muted)]">
                      Vendor
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[var(--cp-faint)]">
                    {relTime(t.last_activity_at)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <Preview t={t} />
                  {t.unread && (
                    <span
                      aria-label="Unread"
                      className="ml-auto h-2 w-2 shrink-0 rounded-full bg-[var(--cp-brand)]"
                    />
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
