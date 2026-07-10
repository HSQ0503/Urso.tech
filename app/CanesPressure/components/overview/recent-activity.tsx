import Link from "next/link";
import type { Overview } from "@/lib/canes/data";

const KIND_LABEL: Record<string, string> = {
  created: "Lead created",
  automation: "Automated text sent",
  call: "Call logged",
  status: "Status updated",
  edited: "Details updated",
  appointment: "Appointment set",
  snooze: "Follow-up snoozed",
};

// Server-rendered stamp; the page is force-dynamic so it is fresh on every load.
function relTime(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function RecentActivity({ items }: { items: Overview["recentActivity"] }) {
  const rows = items.map((item, i) => (
    <div
      key={`${item.at}-${i}`}
      className="flex items-baseline gap-3 px-4 py-2.5 md:px-4"
    >
      <p className="min-w-0 flex-1 truncate text-[13px]">
        {item.leadId ? (
          <Link
            href={`/CanesPressure/leads/${item.leadId}`}
            className="font-medium hover:underline"
          >
            {item.leadName ?? "Lead"}
          </Link>
        ) : (
          <span className="font-medium">{item.leadName ?? "System"}</span>
        )}{" "}
        <span className="text-[var(--cp-muted)]">
          {item.detail ?? KIND_LABEL[item.kind] ?? item.kind}
        </span>
      </p>
      <span className="cp-mono shrink-0 tabular-nums">{relTime(item.at)}</span>
    </div>
  ));

  return (
    <>
      {/* Mobile — inset list under a mono header */}
      <section className="md:hidden">
        <p className="cp-list-header">Recent activity</p>
        {items.length > 0 ? (
          <div className="cp-list divide-y divide-[var(--cp-line)]">{rows}</div>
        ) : (
          <div className="cp-list">
            <p className="px-4 py-4 text-[13.5px] text-[var(--cp-muted)]">No activity yet.</p>
          </div>
        )}
      </section>

      {/* Desktop — card */}
      <section className="hidden md:block">
        <h2 className="text-[15px] font-semibold">Recent activity</h2>
        <div className="cp-card mt-2.5">
          {items.length > 0 ? (
            <div className="divide-y divide-[var(--cp-line)]">{rows}</div>
          ) : (
            <p className="px-4 py-4 text-[13.5px] text-[var(--cp-muted)]">No activity yet.</p>
          )}
        </div>
      </section>
    </>
  );
}
