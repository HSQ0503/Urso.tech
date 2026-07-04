"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtEt, fmtPhone, minutesSince, type Thread } from "@/lib/canes/types";

// Left pane of the inbox: one row per SMS thread, newest first.

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
        <span className="cp-chip border border-[var(--cp-line)] text-[var(--cp-muted)]">
          {threads.length}
        </span>
      </div>
      <ul className="cp-scroll min-h-0 flex-1 divide-y divide-[var(--cp-line)] overflow-y-auto">
        {threads.length === 0 && (
          <li className="px-4 py-6 text-[13px] text-[var(--cp-muted)]">No conversations yet.</li>
        )}
        {threads.map((t) => {
          const active = t.peer_phone === activePhone;
          // Vendor threads carry raw lead drops: no lead record, inbound, unattributed.
          const isVendor =
            !t.lead &&
            (vendorPhones.includes(t.peer_phone) ||
              (t.last_message.direction === "in" && t.last_message.lead_id === null));
          const preview = t.last_message.body.replace(/\s+/g, " ").trim();
          return (
            <li key={t.peer_phone}>
              <Link
                href={`/CanesPressure/inbox?t=${encodeURIComponent(t.peer_phone)}`}
                className={`block min-h-[44px] px-4 py-3 transition-colors ${
                  active ? "bg-[var(--cp-brand-soft)]" : "hover:bg-[#f2f4f0]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-semibold">
                    {t.lead?.name ?? fmtPhone(t.peer_phone)}
                  </span>
                  {t.lead && (
                    <span
                      className={`cp-chip shrink-0 ${t.lead.type === "hot" ? "cp-badge-hot" : "cp-badge-cold"}`}
                    >
                      {t.lead.type === "hot" ? "Hot" : "Cold"}
                    </span>
                  )}
                  {isVendor && (
                    <span className="cp-chip shrink-0 border border-[var(--cp-line)] text-[var(--cp-muted)]">
                      Vendor
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[var(--cp-faint)]">
                    {relTime(t.last_message.created_at)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--cp-muted)]">
                    {t.last_message.direction === "out" ? `You: ${preview}` : preview}
                  </span>
                  {t.unread && (
                    <span
                      aria-label="Unread"
                      className="h-2 w-2 shrink-0 rounded-full bg-[var(--cp-brand)]"
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
