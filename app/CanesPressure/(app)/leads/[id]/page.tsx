import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  FileText,
  MapPin,
  MessageSquare,
  Navigation,
  Pencil,
  Phone,
  Plus,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { getLead, getLeadCalls, getLeadEvents, getSettings, getThreadMessages } from "@/lib/canes/data";
import { listEstimates } from "@/lib/canes/estimates";
import {
  ESTIMATE_STATUS_CLASS,
  ESTIMATE_STATUS_LABEL,
  fmtEt,
  fmtMoney,
  fmtPhone,
  SOURCE_LABEL,
  STATUS_CLASS,
  STATUS_LABEL,
  type Call,
  type Lead,
} from "@/lib/canes/types";
import { CallButton } from "@/app/CanesPressure/components/call-button";
import { LeadEditor } from "@/app/CanesPressure/components/leads/lead-editor";
import { WaitTimer } from "@/app/CanesPressure/components/leads/wait-timer";
import {
  AppointmentCard,
  CallFlow,
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
    // eslint-disable-next-line react-hooks/purity -- per-request dynamic server render; "now" is stable for this render
    const nowMs = Date.now();
    const hoursUntil = lead.appointment_at
      ? (new Date(lead.appointment_at).getTime() - nowMs) / 3_600_000
      : null;
    const soon = hoursUntil !== null && hoursUntil < 24;
    return (
      <div className="space-y-2.5">
        <ApptInfo lead={lead} />
        <p className={`text-[13px] ${soon ? "font-medium text-[var(--cp-warn)]" : "text-[var(--cp-muted)]"}`}>
          {soon
            ? "No YES yet and the visit is soon — worth a call to confirm."
            : "Waiting on the customer to reply YES to the confirmation text."}
        </p>
        <ResendConfirmationButton leadId={lead.id} />
        <CallButton
          phone={lead.phone}
          leadId={lead.id}
          label="Call to confirm"
          className="cp-btn w-full"
          iconSize={16}
        />
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

  // new / contacted / estimated: the phone is the next step. One dominant
  // button; the outcome questions appear only after a call starts.
  return (
    <div className="space-y-3">
      {lead.type === "cold" && lead.status === "new" && (
        <div className="flex flex-wrap items-center gap-2">
          <WaitTimer createdAt={lead.created_at} />
          <p className="text-[13px] text-[var(--cp-muted)]">
            They asked for a quote — call while it&rsquo;s warm.
          </p>
        </div>
      )}
      {lead.status === "contacted" && (
        <p className="text-[13px] text-[var(--cp-muted)]">
          You&rsquo;ve spoken before — close it, or log another call.
        </p>
      )}
      <CallFlow leadId={lead.id} phone={lead.phone} />
    </div>
  );
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const [events, calls, messages, settings, estimates] = await Promise.all([
    getLeadEvents(lead.id),
    getLeadCalls(lead.id),
    lead.phone ? getThreadMessages(lead.phone) : Promise.resolve([]),
    getSettings(),
    listEstimates({ leadId: lead.id }),
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

  const statusChips = (
    <>
      {lead.type === "hot" ? (
        <span className="cp-chip cp-badge-hot">Hot</span>
      ) : (
        <span className="cp-chip cp-badge-cold">Cold</span>
      )}
      <span className={`cp-chip ${STATUS_CLASS[lead.status]}`}>{STATUS_LABEL[lead.status]}</span>
      {lead.opted_out && (
        <span className="cp-chip bg-[var(--cp-danger-bg)] text-[var(--cp-danger)]">Opted out</span>
      )}
    </>
  );

  return (
    <div>
      {/* ── Mobile: iOS contact-card header ────────────────────────────────── */}
      <div className="md:hidden">
        <Link
          href="/CanesPressure/leads"
          className="mb-1 inline-flex min-h-9 items-center gap-1 text-[13px] text-[var(--cp-muted)]"
        >
          <ChevronLeft size={16} strokeWidth={2} /> Leads
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="cp-ios-title">
            {lead.name ?? fmtPhone(lead.phone)}
            <span className="text-[var(--cp-brand)]">.</span>
          </h1>
          {statusChips}
        </div>
        <p className="mt-1 text-[13px] text-[var(--cp-muted)]">
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

        {/* Quick actions — Telegram-style tile row */}
        <div className="cp-quick-row mt-4">
          <CallButton
            phone={lead.phone}
            leadId={lead.id}
            className="cp-quick"
            iconSize={20}
            showFeedback={false}
          />
          {lead.phone ? (
            <Link
              href={`/CanesPressure/inbox?t=${encodeURIComponent(lead.phone)}`}
              className="cp-quick"
            >
              <MessageSquare size={20} strokeWidth={2} /> Text
            </Link>
          ) : (
            <span className="cp-quick" aria-disabled style={{ opacity: 0.4, pointerEvents: "none" }}>
              <MessageSquare size={20} strokeWidth={2} /> Text
            </span>
          )}
          {lead.address ? (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(lead.address)}`}
              target="_blank"
              rel="noreferrer"
              className="cp-quick"
            >
              <Navigation size={20} strokeWidth={2} /> Directions
            </a>
          ) : (
            <span className="cp-quick" aria-disabled style={{ opacity: 0.4, pointerEvents: "none" }}>
              <Navigation size={20} strokeWidth={2} /> Directions
            </span>
          )}
        </div>
      </div>

      {/* ── Desktop (md+): the shipped header — do not alter ───────────────── */}
      <div className="hidden md:block">
      <Link
        href="/CanesPressure/leads"
        className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-[var(--cp-muted)]"
      >
        <ArrowLeft size={15} strokeWidth={2} /> All leads
      </Link>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h1 className="cp-display text-[24px] leading-tight">
          {lead.name ?? fmtPhone(lead.phone)}
          <span className="text-[var(--cp-brand)]">.</span>
        </h1>
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
            <CallButton phone={lead.phone} leadId={lead.id} className="cp-btn cp-btn-sm" />
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
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[2fr_1fr]">
        {/* Rail first on mobile: Sebastian works this page from his phone and
            the next action has to sit above the fold. */}
        <div className="order-1 space-y-4 md:order-2">
          {/* Urgency reads as a red group header above a plain card, not a
              colored card edge. */}
          <div>
            {urgent && <p className="cp-group-label cp-group-danger mb-1.5">Call this now</p>}
            <section className="cp-card rounded-xl md:rounded-md">
              <div className="space-y-3 p-4">
                <CardTitle>Next step</CardTitle>
                <NextStep lead={lead} />
              </div>
            </section>
          </div>

          <section className="cp-card rounded-xl p-4 md:rounded-md">
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Estimates</CardTitle>
              {estimates.length > 0 && (
                <Link
                  href={`/CanesPressure/estimates/new?lead=${lead.id}`}
                  className="cp-btn cp-btn-sm"
                  aria-label="Create estimate"
                >
                  <Plus size={14} strokeWidth={2} /> New
                </Link>
              )}
            </div>
            {estimates.length === 0 ? (
              <div className="mt-3 space-y-3">
                <p className="text-[13.5px] text-[var(--cp-muted)]">No estimates yet for this lead.</p>
                <Link
                  href={`/CanesPressure/estimates/new?lead=${lead.id}`}
                  className="cp-btn cp-btn-primary w-full"
                >
                  <FileText size={16} strokeWidth={2} /> Create estimate
                </Link>
              </div>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {estimates.map((est) => (
                  <li key={est.id}>
                    <Link
                      href={`/CanesPressure/estimates/${est.id}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-[var(--cp-line)] px-3.5 py-2.5 transition-colors hover:bg-[var(--cp-hover)]"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="tabular-nums text-[13.5px] font-semibold">{est.number}</span>
                        <span className={`cp-chip ${ESTIMATE_STATUS_CLASS[est.status]}`}>
                          {ESTIMATE_STATUS_LABEL[est.status]}
                        </span>
                      </div>
                      <span className="shrink-0 tabular-nums text-[13.5px] font-semibold">
                        {fmtMoney(est.total_cents)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Everything that isn't the next step lives behind one disclosure —
              still a tap away, no longer competing for attention. */}
          <details className="cp-card group rounded-xl md:rounded-md">
            <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between px-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
              More options
              <ChevronDown
                size={16}
                strokeWidth={2}
                className="text-[var(--cp-muted)] transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <div className="space-y-4 border-t border-[var(--cp-line)] p-4">
              <div className="space-y-2.5">
                <p className="cp-label">Status</p>
                <StatusCard leadId={lead.id} status={lead.status} />
              </div>
              <div className="cp-divider space-y-2.5 pt-4">
                <p className="cp-label">
                  {lead.appointment_at ? "Reschedule the visit" : "Set a visit manually"}
                </p>
                <AppointmentCard
                  leadId={lead.id}
                  appointmentAt={lead.appointment_at}
                  offsetHours={settings.confirmation_offset_hours}
                />
              </div>
              {lead.type === "cold" && lead.status === "contacted" && (
                <div className="cp-divider space-y-2.5 pt-4">
                  <p className="cp-label">Snooze follow-up</p>
                  <SnoozeCard leadId={lead.id} snoozedUntil={lead.snoozed_until} />
                </div>
              )}
            </div>
          </details>
        </div>

        <div className="order-2 min-w-0 space-y-4 md:order-1">
          <section className="cp-card rounded-xl p-4 md:rounded-md">
            <CardTitle>Details</CardTitle>
            <div className="mt-3">
              <LeadEditor lead={lead} />
            </div>
          </section>

          <section className="cp-card rounded-xl p-4 md:rounded-md">
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

          <section className="cp-card rounded-xl p-4 md:rounded-md">
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
                <figcaption className="cp-mono">
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
