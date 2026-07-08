"use client";

import Link from "next/link";
import { FileText, MapPin, UserRound } from "lucide-react";
import { fmtEt, fmtPhone, type Lead } from "@/lib/canes/types";
import { CallButton } from "../call-button";
import { SheetShell } from "./sheet-shell";

// Estimate-visit detail sheet — the visit chip's click-through. A visit is a
// lead with an appointment, so everything here reads from the Lead row and
// links back into the lead pipeline (open lead / start estimate).

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="cp-mono shrink-0">{label}</span>
      <span className="min-w-0 text-right text-[13px] font-medium">{children}</span>
    </div>
  );
}

export function VisitSheet({ visit, onClose }: { visit: Lead; onClose: () => void }) {
  const confirmed = visit.status === "confirmed";
  const mapsHref = visit.address
    ? `https://maps.google.com/?q=${encodeURIComponent(visit.address)}`
    : null;

  return (
    <SheetShell title="Estimate visit" onClose={onClose}>
      {/* Header: who + what + when */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[16px] font-semibold leading-tight">
            {visit.name ?? "Estimate visit"}
          </p>
          {visit.service && (
            <p className="mt-0.5 text-[12.5px] text-[var(--cp-muted)]">{visit.service}</p>
          )}
        </div>
        <span className={`cp-chip shrink-0 ${confirmed ? "cp-status-confirmed" : "cp-status-appt"}`}>
          {confirmed ? "Confirmed" : "Pending"}
        </span>
      </div>
      <p className="mt-2 text-[13.5px] font-semibold tabular-nums">
        {fmtEt(visit.appointment_at)}
      </p>

      {/* Quick actions */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <CallButton phone={visit.phone} className="cp-btn cp-btn-sm" showFeedback={false} />
        {mapsHref ? (
          <a href={mapsHref} target="_blank" rel="noreferrer" className="cp-btn cp-btn-sm">
            <MapPin size={14} strokeWidth={2} /> Directions
          </a>
        ) : (
          <span className="cp-btn cp-btn-sm pointer-events-none opacity-50">No address</span>
        )}
      </div>

      {/* Contact */}
      <div className="cp-divider mt-4 pt-3">
        <p className="cp-group-label">Contact</p>
        <Row label="Phone">
          {visit.phone ? (
            <a href={`tel:${visit.phone}`} className="tabular-nums hover:underline">
              {fmtPhone(visit.phone)}
            </a>
          ) : (
            "—"
          )}
        </Row>
        {visit.address && (
          <div className="py-1.5">
            <p className="text-[13px] font-medium leading-snug">{visit.address}</p>
            {mapsHref && (
              <a
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--cp-brand-deep)] hover:underline"
              >
                <MapPin size={13} strokeWidth={2} /> Open in Maps
              </a>
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      {visit.notes && (
        <div className="cp-divider mt-3 pt-3">
          <p className="cp-group-label">Notes</p>
          <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-snug text-[var(--cp-muted)]">
            {visit.notes}
          </p>
        </div>
      )}

      {/* Links into the pipeline */}
      <div className="cp-divider mt-3 pt-3">
        <p className="cp-group-label">Links</p>
        <div className="mt-2 flex flex-col gap-2">
          <Link href={`/CanesPressure/leads/${visit.id}`} className="cp-btn cp-btn-sm" style={{ justifyContent: "flex-start" }}>
            <UserRound size={14} strokeWidth={2} /> Open lead
          </Link>
          <Link
            href={`/CanesPressure/estimates/new?lead=${visit.id}`}
            className="cp-btn cp-btn-sm" style={{ justifyContent: "flex-start" }}
          >
            <FileText size={14} strokeWidth={2} /> Start estimate
          </Link>
        </div>
      </div>
    </SheetShell>
  );
}
