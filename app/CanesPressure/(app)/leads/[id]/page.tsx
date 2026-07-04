import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { getLead, getLeadCalls, getLeadEvents, getSettings, getThreadMessages } from "@/lib/canes/data";
import {
  fmtEt,
  fmtPhone,
  SOURCE_LABEL,
  STATUS_CLASS,
  STATUS_LABEL,
  type Call,
  type Lead,
} from "@/lib/canes/types";
import { LeadEditor } from "@/app/CanesPressure/components/leads/lead-editor";
import {
  AppointmentCard,
  BridgeCallButton,
  Disposition,
  ResendConfirmationButton,
  SnoozeCard,
  StatusCard,
} from "@/app/CanesPressure/components/leads/disposition";

export const dynamic = "force-dynamic";

const EVENT_ICON: Record<string, LucideIcon> = {
  created: Sparkles,
  automation: Zap,
  call: Phone,
  status: CheckCircle2,
  edited: Pencil,
  appointment: CalendarClock,
  snooze: CalendarClock,
};

function callText(c: Call): string {
  const dir = c.direction === "out" ? "Outbound call" : "Inbound call";
  const status = (c.status ?? "logged").replace(/-/g, " ");
  const mins = c.duration_seconds ? ` · ${Math.max(1, Math.round(c.duration_seconds / 60))} min` : "";
  return `${dir} · ${status}${mins}`;
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[15px] font-semibold">{children}</h2>;
}

function ApptInfo({ lead }: { lead: Lead }) {
  return (
    <div className="flex items-start gap-2">
      <CalendarClock size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--cp-muted)]" />
      <div className="min-w-0">
        <p className="text-[14px] font-semibold tabular-nums">{fmtEt(lead.appointment_at)}</p>
        {lead.address && <p className="truncate text-[13px] text-[var(--cp-muted)]">{lead.address}</p>}
      </div>
    </div>
  );
}

function MapsLink({ address }: { address: string }) {
  return (
    <a
      href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
      target="_blank"
      rel="noreferrer"
      className="cp-btn w-full"
    >
      <MapPin size={16} strokeWidth={2} /> Open in Maps
    </a>
  );
}

// The status-aware action card at the top of the rail.
function NextStep({ lead }: { lead: Lead }) {
  if (lead.status === "won" || lead.status === "lost") {
    return (
      <div className="space-y-1.5 text-[13.5px]">
        <p>{lead.status === "won" ? "This lead is won." : "This lead was lost."}</p>
        {lead.status === "lost" && lead.lost_reason && (
          <p className="text-[var(--cp-muted)]">{lead.lost_reason}</p>
        )}
        {lead.status === "won" && lead.appointment_at && (
          <p className="tabular-nums text-[var(--cp-muted)]">Visited {fmtEt(lead.appointment_at)}</p>
        )}
      </div>
    );
  }

  if (lead.status === "appointment_set") {
    return (
      <div className="space-y-2.5">
        <ApptInfo lead={lead} />
        <p className="text-[13px] text-[var(--cp-muted)]">Waiting on the customer to reply YES.</p>
        <ResendConfirmationButton leadId={lead.id} />
      </div>
    );
  }

  if (lead.status === "confirmed") {
    return (
      <div className="space-y-2.5">
        <ApptInfo lead={lead} />
        {lead.confirmed_at && (
          <p className="text-[13px] tabular-nums text-[var(--cp-good)]">
            Confirmed {fmtEt(lead.confirmed_at)}
          </p>
        )}
        {lead.address && <MapsLink address={lead.address} />}
      </div>
    );
  }

  // new / contacted / estimated: the phone is the next step.
  return (
    <div className="space-y-2.5">
      {lead.phone ? (
        <>
          <a href={`tel:${lead.phone}`} className="cp-btn cp-btn-primary w-full">
            <Phone size={17} strokeWidth={2} /> Call now
          </a>
          <BridgeCallButton leadId={lead.id} />
        </>
      ) : (
        <p className="text-[13px] text-[var(--cp-warn)]">No phone number on file. Add one in the details.</p>
      )}
      <div className="cp-divider pt-2.5">
        <p className="cp-label mb-2">After the call</p>
        <Disposition leadId={lead.id} />
      </div>
    </div>
  );
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const [events, calls, messages, settings] = await Promise.all([
    getLeadEvents(lead.id),
    getLeadCalls(lead.id),
    lead.phone ? getThreadMessages(lead.phone) : Promise.resolve([]),
    getSettings(),
  ]);
  const lastMessages = messages.slice(-3); // thread comes back oldest-first

  const activity = [
    ...events.map((e) => ({
      id: `e-${e.id}`,
      at: e.created_at,
      icon: EVENT_ICON[e.kind] ?? Sparkles,
      text: e.detail ?? e.kind,
    })),
    ...calls.map((c) => ({ id: `c-${c.id}`, at: c.created_at, icon: Phone, text: callText(c) })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const urgent = lead.type === "cold" && lead.status === "new";

  return (
    <div>
      <Link
        href="/CanesPressure/leads"
        className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-[var(--cp-muted)]"
      >
        <ArrowLeft size={15} strokeWidth={2} /> All leads
      </Link>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h1 className="cp-display text-[24px] leading-tight">{lead.name ?? fmtPhone(lead.phone)}</h1>
        {lead.type === "hot" ? (
          <span className="cp-chip cp-badge-hot">Hot</span>
        ) : (
          <span className="cp-chip cp-badge-cold">Cold</span>
        )}
        <span className={`cp-chip ${STATUS_CLASS[lead.status]}`}>{STATUS_LABEL[lead.status]}</span>
        {lead.opted_out && (
          <span className="cp-chip bg-[var(--cp-danger-bg)] text-[var(--cp-danger)]">Opted out</span>
        )}
      </div>
      <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
        {lead.phone ? (
          <a href={`tel:${lead.phone}`} className="font-medium tabular-nums text-[var(--cp-brand-deep)]">
            {fmtPhone(lead.phone)}
          </a>
        ) : (
          "No phone on file"
        )}
        {" · "}
        {SOURCE_LABEL[lead.source]}
      </p>

      {/* Quick actions — the three things Sebastian does from the truck */}
      <div className="mt-3 flex flex-wrap gap-2">
        {lead.phone && (
          <>
            <a href={`tel:${lead.phone}`} className="cp-btn cp-btn-sm">
              <Phone size={14} strokeWidth={2} /> Call
            </a>
            <Link
              href={`/CanesPressure/inbox?t=${encodeURIComponent(lead.phone)}`}
              className="cp-btn cp-btn-sm"
            >
              <MessageSquare size={14} strokeWidth={2} /> Text
            </Link>
          </>
        )}
        {lead.address && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(lead.address)}`}
            target="_blank"
            rel="noreferrer"
            className="cp-btn cp-btn-sm"
          >
            <MapPin size={14} strokeWidth={2} /> Directions
          </a>
        )}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[2fr_1fr]">
        {/* Rail first on mobile: Sebastian works this page from his phone and
            the next action has to sit above the fold. */}
        <div className="order-1 space-y-4 md:order-2">
          <section className={`cp-card ${urgent ? "cp-urgent" : ""}`}>
            <div className="space-y-3 p-4">
              <CardTitle>Next step</CardTitle>
              <NextStep lead={lead} />
            </div>
          </section>

          <section className="cp-card p-4">
            <div className="space-y-3">
              <CardTitle>Status</CardTitle>
              <StatusCard leadId={lead.id} status={lead.status} />
            </div>
          </section>

          <section className="cp-card p-4">
            <div className="space-y-3">
              <CardTitle>Appointment</CardTitle>
              <AppointmentCard
                leadId={lead.id}
                appointmentAt={lead.appointment_at}
                offsetHours={settings.confirmation_offset_hours}
              />
            </div>
          </section>

          {lead.type === "cold" && lead.status === "contacted" && (
            <section className="cp-card p-4">
              <div className="space-y-3">
                <CardTitle>Snooze follow-up</CardTitle>
                <SnoozeCard leadId={lead.id} snoozedUntil={lead.snoozed_until} />
              </div>
            </section>
          )}
        </div>

        <div className="order-2 min-w-0 space-y-4 md:order-1">
          <section className="cp-card p-4">
            <CardTitle>Details</CardTitle>
            <div className="mt-3">
              <LeadEditor lead={lead} />
            </div>
          </section>

          <section className="cp-card p-4">
            <CardTitle>Conversation</CardTitle>
            <div className="mt-3">
              {lastMessages.length === 0 ? (
                <p className="text-[13.5px] text-[var(--cp-muted)]">
                  {lead.phone ? "No messages yet." : "No phone number on file."}
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {lastMessages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex flex-col ${m.direction === "out" ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`max-w-[85%] px-3.5 py-2 text-[13.5px] leading-relaxed ${
                          m.direction === "out"
                            ? `cp-bubble-out${m.automated ? " cp-bubble-auto" : ""}`
                            : "cp-bubble-in"
                        }`}
                      >
                        {m.body}
                      </div>
                      <span className="mt-1 text-[11px] tabular-nums text-[var(--cp-faint)]">
                        {m.automated ? "Auto · " : ""}
                        {fmtEt(m.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {lead.phone && (
                <Link
                  href={`/CanesPressure/inbox?t=${encodeURIComponent(lead.phone)}`}
                  className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-semibold text-[var(--cp-brand-deep)]"
                >
                  <MessageSquare size={15} strokeWidth={2} /> Open full thread
                </Link>
              )}
            </div>
          </section>

          <section className="cp-card p-4">
            <CardTitle>Activity</CardTitle>
            <ol className="mt-3 space-y-3">
              {activity.length === 0 && (
                <li className="text-[13.5px] text-[var(--cp-muted)]">No activity yet.</li>
              )}
              {activity.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id} className="flex gap-2.5">
                    <Icon size={14} strokeWidth={2} className="mt-[3px] shrink-0 text-[var(--cp-faint)]" />
                    <div className="min-w-0">
                      <p className="text-[13.5px] leading-snug">{item.text}</p>
                      <p className="text-[11.5px] tabular-nums text-[var(--cp-faint)]">{fmtEt(item.at)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {lead.raw_message && (
              <figure className="mt-4 rounded-md border border-[var(--cp-line)] bg-[var(--cp-bg)] px-3.5 py-3">
                <figcaption className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--cp-faint)]">
                  Original vendor text
                  {lead.parse_confidence !== null &&
                    ` · parsed at ${Math.round(lead.parse_confidence * 100)}% confidence`}
                </figcaption>
                <blockquote className="mt-1 text-[13px] leading-relaxed text-[var(--cp-muted)]">
                  {lead.raw_message}
                </blockquote>
              </figure>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
