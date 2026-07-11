"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTeamMember } from "@/app/CanesPressure/actions";
import { TEAM_ROLE_LABEL, type TeamMember } from "@/lib/canes/types";

// "Set the split" — the owner/partner profit share, the number Sebastian tweaks
// most. Inputs are whole percentages; we persist comp_bps = pct * 100. They
// don't have to total 100 (computePayouts normalizes to the sum), but we show
// the running total so an accidental 60/50 is obvious before it saves.

type Feedback = { ok: boolean; text: string } | null;

const seedPcts = (ms: TeamMember[]): Record<string, string> =>
  Object.fromEntries(ms.map((m) => [m.id, String(Number((m.comp_bps / 100).toFixed(2)))]));

export function SplitEditor({ members }: { members: TeamMember[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  // Re-seed the inputs whenever the saved split changes (e.g. after a TeamManager
  // edit + router.refresh) so this editor never writes stale percentages back
  // over a change made elsewhere, and a newly added split member gets an input
  // instead of NaN-blocking the save.
  const sig = members.map((m) => `${m.id}:${m.comp_bps}`).join("|");
  const [seededSig, setSeededSig] = useState(sig);
  const [pcts, setPcts] = useState<Record<string, string>>(() => seedPcts(members));
  if (sig !== seededSig) {
    setSeededSig(sig);
    setPcts(seedPcts(members));
  }

  const nums = members.map((m) => Number(pcts[m.id]));
  const total = nums.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
  const totalOff = Math.round(total) !== 100;
  const anyInvalid = nums.some((n) => !Number.isFinite(n) || n < 0);

  function save() {
    if (anyInvalid) {
      setFeedback({ ok: false, text: "Enter each share as a percentage." });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      for (const m of members) {
        const res = await updateTeamMember(m.id, { compBps: Math.round(Number(pcts[m.id]) * 100) });
        if (!res.ok) {
          setFeedback({ ok: false, text: res.notice ?? "Couldn't save the split." });
          return;
        }
      }
      setFeedback({ ok: true, text: "Split saved." });
      router.refresh();
    });
  }

  return (
    <section className="cp-card p-4 sm:p-5">
      <p className="cp-label">Set the split</p>
      <h2 className="mt-0.5 text-[15px] font-semibold leading-tight">Owner and partner shares</h2>
      <p className="mt-1 text-[12.5px] text-[var(--cp-muted)]">
        How the distributable profit divides after everyone else is paid.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {members.map((m) => (
          <div key={m.id}>
            <label className="cp-label" htmlFor={`split-${m.id}`}>
              {m.name} <span className="font-normal text-[var(--cp-faint)]">· {TEAM_ROLE_LABEL[m.role]}</span>
            </label>
            <div className="relative">
              <input
                id={`split-${m.id}`}
                className="cp-input tabular-nums"
                style={{ paddingRight: 26 }}
                inputMode="decimal"
                value={pcts[m.id] ?? ""}
                onChange={(e) => setPcts((p) => ({ ...p, [m.id]: e.target.value }))}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--cp-muted)]">
                %
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="cp-btn cp-btn-primary cp-btn-sm" disabled={pending} onClick={save}>
          {pending ? "Saving..." : "Save split"}
        </button>
        <span className="text-[12.5px] tabular-nums" style={totalOff ? { color: "var(--cp-warn)" } : undefined}>
          Total {Number(total.toFixed(2))}%
        </span>
        {totalOff && !feedback && (
          <span className="text-[12px] text-[var(--cp-faint)]">Shares are normalized to 100% when paid out.</span>
        )}
        {feedback && (
          <span className={`text-[12.5px] ${feedback.ok ? "text-[var(--cp-good)]" : "text-[var(--cp-warn)]"}`}>
            {feedback.text}
          </span>
        )}
      </div>
    </section>
  );
}
