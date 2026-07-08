"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhoneIncoming, PhoneMissed, PhoneOutgoing, Search } from "lucide-react";
import { fmtEt, fmtPhone, isMissedCall, minutesSince, type Thread } from "@/lib/canes/types";

// Left pane of the inbox: the vendor feed pinned on top as a compact row, then
// LEADS and CUSTOMERS groups under mono headers (Jobber's grouped-list move),
// newest activity first inside each. Search filters by name or phone.

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
function Preview({ t, unread }: { t: Thread; unread: boolean }) {
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
    <span
      className={`min-w-0 flex-1 truncate text-[13px] ${
        unread ? "font-medium text-[var(--cp-ink)]" : "text-[var(--cp-muted)]"
      }`}
    >
      {t.last_message.direction === "out" ? `You: ${preview}` : preview}
    </span>
  );
}

function threadHref(t: Thread): string {
  return `/CanesPressure/inbox?thread=${encodeURIComponent(t.peer_phone)}`;
}

// The vendor feed is auto-parsed into lead cards and never needs a reply, so
// its pinned row is compact and never shows unread-urgency styling.
function VendorRow({ t, active }: { t: Thread; active: boolean }) {
  return (
    <Link
      href={threadHref(t)}
      className={`flex min-h-[44px] items-center gap-2 border-b border-[var(--cp-line)] px-4 py-2.5 transition-colors ${
        active ? "bg-[var(--cp-brand-soft)]" : "hover:bg-[var(--cp-hover)]"
      }`}
    >
      <span className="truncate text-[13.5px] font-medium">Lead vendor</span>
      <span className="cp-chip shrink-0 bg-[var(--cp-bg)] text-[var(--cp-muted)]">Vendor</span>
      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[var(--cp-faint)]">
        {relTime(t.last_activity_at)}
      </span>
    </Link>
  );
}

function ThreadRow({ t, active }: { t: Thread; active: boolean }) {
  const unread = t.unread;
  return (
    <li>
      <Link
        href={threadHref(t)}
        className={`block min-h-[44px] px-4 py-3 transition-colors ${
          active ? "bg-[var(--cp-brand-soft)]" : "hover:bg-[var(--cp-hover)]"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`truncate text-[14px] ${unread ? "font-semibold" : "font-medium"}`}>
            {t.display_name ?? fmtPhone(t.peer_phone)}
          </span>
          {t.kind === "customer" ? (
            <span className="cp-chip shrink-0 bg-[var(--cp-bg)] text-[var(--cp-muted)]">
              Customer
            </span>
          ) : t.lead ? (
            <span
              className={`cp-chip shrink-0 ${t.lead.type === "hot" ? "cp-badge-hot" : "cp-badge-cold"}`}
            >
              {t.lead.type === "hot" ? "Hot" : "Cold"}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[var(--cp-faint)]">
            {relTime(t.last_activity_at)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <Preview t={t} unread={unread} />
          {unread && (
            <span
              aria-label="Unread"
              className="ml-auto h-2 w-2 shrink-0 rounded-full bg-[var(--cp-brand)]"
            />
          )}
        </div>
      </Link>
    </li>
  );
}

function Group({
  label,
  threads,
  activePhone,
}: {
  label: string;
  threads: Thread[];
  activePhone: string | null;
}) {
  if (threads.length === 0) return null;
  return (
    <>
      <p className="cp-group-label sticky top-0 z-10 border-b border-[var(--cp-line)] bg-[var(--cp-surface)] px-4 pb-1.5 pt-3">
        {label} — {threads.length}
      </p>
      <ul className="divide-y divide-[var(--cp-line)] border-b border-[var(--cp-line)]">
        {threads.map((t) => (
          <ThreadRow key={t.peer_phone} t={t} active={t.peer_phone === activePhone} />
        ))}
      </ul>
    </>
  );
}

export function ThreadList({
  threads,
  activePhone,
}: {
  threads: Thread[];
  activePhone: string | null;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const matches = (t: Thread) => {
    if (!q) return true;
    const name = t.kind === "vendor" ? "lead vendor" : (t.display_name ?? "");
    return name.toLowerCase().includes(q) || (qDigits.length > 0 && t.peer_phone.includes(qDigits));
  };

  const visible = threads.filter(matches);
  const vendors = visible.filter((t) => t.kind === "vendor");
  const leads = visible.filter((t) => t.kind === "lead");
  const customers = visible.filter((t) => t.kind === "customer");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2.5 border-b border-[var(--cp-line)] px-4 py-3">
        <div className="flex items-center gap-2">
          <h1 className="cp-display text-[17px]">
            Inbox<span className="text-[var(--cp-brand)]">.</span>
          </h1>
          <span className="cp-chip bg-[var(--cp-bg)] text-[var(--cp-muted)]">{threads.length}</span>
        </div>
        <div className="relative">
          <Search
            size={15}
            strokeWidth={2}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cp-faint)]"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or phone"
            aria-label="Search conversations"
            className="cp-input cp-search"
          />
        </div>
      </div>
      <div className="cp-scroll min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && (
          <p className="px-4 py-6 text-[13px] text-[var(--cp-muted)]">
            {q ? "No matches." : "No conversations yet."}
          </p>
        )}
        {vendors.map((t) => (
          <VendorRow key={t.peer_phone} t={t} active={t.peer_phone === activePhone} />
        ))}
        <Group label="Leads" threads={leads} activePhone={activePhone} />
        <Group label="Customers" threads={customers} activePhone={activePhone} />
      </div>
    </div>
  );
}
