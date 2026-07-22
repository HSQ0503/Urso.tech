"use client";

import { useState, useTransition } from "react";
import { Plus, ShieldCheck, UsersRound, UserRoundCheck, UserRoundX } from "lucide-react";
import {
  addCrew,
  addApprovedTechnician,
  setTechnicianActive,
  type CrewOwnerActionResult,
} from "@/app/CanesPressure/crew-owner-actions";
import { fmtPhone, type Crew } from "@/lib/canes/types";
import type { TechnicianAccountAdminRow } from "@/lib/canes/crew-types";
import { PhoneInput } from "../phone-input";

export function CrewAccountManager({
  ready,
  rows,
  crews,
}: {
  ready: boolean;
  rows: TechnicianAccountAdminRow[];
  crews: Crew[];
}) {
  const [showAddTechnician, setShowAddTechnician] = useState(false);
  const [showAddCrew, setShowAddCrew] = useState(false);
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
          <h2 className="text-[15px] font-semibold">Crews & technician accounts</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--cp-muted)]">
            Create the crews that appear on the schedule, then approve each employee and assign them to one crew.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="cp-btn min-h-11 cursor-pointer"
            onClick={() => {
              setResult(null);
              setShowAddTechnician(false);
              setShowAddCrew((open) => !open);
            }}
          >
            <UsersRound aria-hidden size={16} />
            Add crew
          </button>
          <button
            type="button"
            className="cp-btn min-h-11 cursor-pointer"
            onClick={() => {
              setResult(null);
              setShowAddCrew(false);
              setShowAddTechnician((open) => !open);
            }}
          >
            <Plus aria-hidden size={16} />
            Add technician
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" aria-label="Active crews">
        {crews.map((crew) => (
          <span
            key={crew.id}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--cp-line)] px-2.5 py-1.5 text-[12px] font-semibold"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: crew.color }}
              aria-hidden
            />
            {crew.name}
          </span>
        ))}
      </div>

      {showAddCrew && (
        <form
          className="mt-5 grid gap-3 border-t border-[var(--cp-line)] pt-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setResult(null);
            startTransition(async () => {
              const next = await addCrew({
                name: String(form.get("name") ?? ""),
                color: String(form.get("color") ?? "#0b6aa2"),
              });
              setResult(next);
              if (next.ok) setShowAddCrew(false);
            });
          }}
        >
          <div>
            <label className="cp-label" htmlFor="new-crew-name">Crew name</label>
            <input
              id="new-crew-name"
              className="cp-input min-h-11"
              name="name"
              placeholder="Crew 2"
              required
            />
          </div>
          <div>
            <label className="cp-label" htmlFor="new-crew-color">Calendar color</label>
            <input
              id="new-crew-color"
              className="h-11 w-full min-w-20 cursor-pointer rounded-md border border-[var(--cp-line)] bg-[var(--cp-surface)] p-1 sm:w-20"
              name="color"
              type="color"
              defaultValue="#0b6aa2"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="cp-btn cp-btn-primary min-h-11 cursor-pointer"
          >
            {pending ? "Adding…" : "Add crew"}
          </button>
        </form>
      )}

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

      {showAddTechnician && (
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
              if (next.ok) setShowAddTechnician(false);
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
            <PhoneInput id="crew-account-phone" className="cp-input min-h-11" name="phone" required />
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
