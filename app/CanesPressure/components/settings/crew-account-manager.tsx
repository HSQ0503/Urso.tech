"use client";

import { useState, useTransition } from "react";
import { Plus, ShieldCheck, UserRoundCheck, UserRoundX } from "lucide-react";
import {
  addApprovedTechnician,
  setTechnicianActive,
  type CrewOwnerActionResult,
} from "@/app/CanesPressure/crew-owner-actions";
import { fmtPhone, type Crew } from "@/lib/canes/types";
import type { TechnicianAccountAdminRow } from "@/lib/canes/crew-types";

export function CrewAccountManager({
  ready,
  rows,
  crews,
}: {
  ready: boolean;
  rows: TechnicianAccountAdminRow[];
  crews: Crew[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [result, setResult] = useState<CrewOwnerActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (!ready) {
    return (
      <section className="cp-card rounded-xl p-4 md:rounded-md md:p-5">
        <h2 className="text-[15px] font-semibold">Technician accounts</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--cp-muted)]">
          Owner sign-in and the crew-account database migration are required before accounts can be managed here.
        </p>
      </section>
    );
  }

  return (
    <section className="cp-card rounded-xl p-4 md:rounded-md md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Technician accounts</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--cp-muted)]">
            Only the owner can approve or deactivate employees. Each technician receives an individual passwordless account and sees assigned crew jobs only.
          </p>
        </div>
        <button
          type="button"
          className="cp-btn min-h-11 cursor-pointer"
          onClick={() => setShowAdd((open) => !open)}
        >
          <Plus aria-hidden size={16} />
          Add technician
        </button>
      </div>

      <div className="mt-5 grid gap-3">
        {rows.map((row) => (
          <div key={row.teamMemberId} className="rounded-lg border border-[var(--cp-line)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={row.active
                    ? { background: "var(--cp-good-bg)", color: "var(--cp-good)" }
                    : { background: "var(--cp-danger-bg)", color: "var(--cp-danger)" }}
                >
                  {row.active ? <UserRoundCheck aria-hidden size={19} /> : <UserRoundX aria-hidden size={19} />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold">{row.name}</p>
                  <p className="mt-0.5 truncate text-[12.5px] text-[var(--cp-muted)]">{row.email ?? "No email"} · {fmtPhone(row.phone)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--cp-cold-bg)] px-2 py-1 text-[10.5px] font-semibold text-[var(--cp-cold)]">{row.crewName ?? "No crew"}</span>
                    <span className="flex items-center gap-1 text-[11px] text-[var(--cp-faint)]">
                      <ShieldCheck aria-hidden size={13} />
                      {row.provisioned ? "Account activated" : "Ready for first sign-in"}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={pending}
                className={`cp-btn min-h-11 cursor-pointer ${row.active ? "cp-btn-danger" : ""}`}
                onClick={() => {
                  setResult(null);
                  startTransition(async () => setResult(await setTechnicianActive(row.teamMemberId, !row.active)));
                }}
              >
                {row.active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <form
          className="mt-5 grid gap-3 border-t border-[var(--cp-line)] pt-5 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setResult(null);
            startTransition(async () => {
              const next = await addApprovedTechnician({
                name: String(form.get("name") ?? ""),
                email: String(form.get("email") ?? ""),
                phone: String(form.get("phone") ?? ""),
                crewId: String(form.get("crewId") ?? ""),
              });
              setResult(next);
              if (next.ok) setShowAdd(false);
            });
          }}
        >
          <div>
            <label className="cp-label" htmlFor="crew-account-name">Full name</label>
            <input id="crew-account-name" className="cp-input min-h-11" name="name" required />
          </div>
          <div>
            <label className="cp-label" htmlFor="crew-account-email">Email</label>
            <input id="crew-account-email" className="cp-input min-h-11" name="email" type="email" required />
          </div>
          <div>
            <label className="cp-label" htmlFor="crew-account-phone">Phone</label>
            <input id="crew-account-phone" className="cp-input min-h-11" name="phone" type="tel" required />
          </div>
          <div>
            <label className="cp-label" htmlFor="crew-account-crew">Crew</label>
            <select id="crew-account-crew" className="cp-select min-h-11" name="crewId" required defaultValue="">
              <option value="" disabled>Choose a crew</option>
              {crews.map((crew) => <option key={crew.id} value={crew.id}>{crew.name}</option>)}
            </select>
          </div>
          <button type="submit" disabled={pending} className="cp-btn cp-btn-primary min-h-11 cursor-pointer sm:col-span-2 sm:w-fit">
            {pending ? "Approving…" : "Approve technician"}
          </button>
        </form>
      )}
      {result?.notice && (
        <p className="mt-3 text-[12.5px] font-medium" style={{ color: result.ok ? "var(--cp-good)" : "var(--cp-danger)" }}>
          {result.notice}
        </p>
      )}
    </section>
  );
}
