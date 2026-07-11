"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { addTeamMember, removeTeamMember, updateTeamMember } from "@/app/CanesPressure/actions";
import {
  fmtMoney,
  TEAM_ROLE_LABEL,
  type CompType,
  type Crew,
  type TeamMember,
  type TeamRole,
} from "@/lib/canes/types";

// Manage who is on the team and how each person is paid. Adding and editing share
// one form; the comp-type select swaps between a percentage field (profit split /
// share) and a $/hr + crew field (hourly). Everything writes through the team
// server actions and router.refresh so the waterfall and payouts recompute.

const COMP_TYPE_LABEL: Record<CompType, string> = {
  profit_split: "Profit split (owner / partner)",
  profit_share: "Profit share (ops manager)",
  hourly: "Hourly",
  none: "Not paid here",
};

const initials = (name: string) => (name.trim().split(/\s+/)[0] || "?").slice(0, 2).toUpperCase();
const usesPercent = (t: CompType) => t === "profit_split" || t === "profit_share";

// "$20", "20.00" → integer cents. NaN → 0.
function toCents(raw: string): number {
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function compSummary(m: TeamMember, crews: Crew[]): string {
  const pct = Number((m.comp_bps / 100).toFixed(2));
  if (m.comp_type === "profit_split") return `${pct}% profit split`;
  if (m.comp_type === "profit_share") return `${pct}% of gross profit`;
  if (m.comp_type === "hourly") {
    const crew = crews.find((c) => c.id === m.crew_id);
    return `${fmtMoney(m.hourly_cents)}/hr${crew ? ` · ${crew.name}` : ""}`;
  }
  return "Not paid here";
}

export function TeamManager({ team, crews }: { team: TeamMember[]; crews: Crew[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function remove(id: string) {
    startTransition(async () => {
      const res = await removeTeamMember(id);
      setConfirmId(null);
      if (res.ok) router.refresh();
    });
  }

  return (
    <section className="cp-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="cp-label">Team</p>
          <h2 className="mt-0.5 text-[15px] font-semibold leading-tight">Who gets paid, and how</h2>
        </div>
        {!adding && (
          <button
            type="button"
            className="cp-btn cp-btn-sm"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
          >
            <Plus size={14} strokeWidth={2} /> Add team member
          </button>
        )}
      </div>

      {team.length === 0 && !adding && (
        <p className="mt-4 rounded-lg bg-[var(--cp-bg)] px-3 py-6 text-center text-[13px] text-[var(--cp-muted)]">
          No team yet. Add yourself, your partner, the ops manager, and each worker.
        </p>
      )}

      {team.length > 0 && (
        <ul className="mt-4 divide-y divide-[var(--cp-line)]">
          {team.map((m) =>
            editingId === m.id ? (
              <li key={m.id} className="py-3">
                <MemberForm
                  member={m}
                  crews={crews}
                  onDone={() => setEditingId(null)}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <span className="cp-avatar">{initials(m.name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-1.5">
                    <span className="truncate text-[13.5px] font-medium">{m.name}</span>
                    <span className="shrink-0 text-[11.5px] text-[var(--cp-faint)]">{TEAM_ROLE_LABEL[m.role]}</span>
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-[var(--cp-muted)]">{compSummary(m, crews)}</p>
                </div>
                {confirmId === m.id ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      className="cp-btn cp-btn-danger cp-btn-sm"
                      disabled={pending}
                      onClick={() => remove(m.id)}
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      className="cp-btn cp-btn-sm"
                      disabled={pending}
                      onClick={() => setConfirmId(null)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="cp-btn cp-btn-ghost cp-btn-sm"
                      aria-label={`Edit ${m.name}`}
                      onClick={() => {
                        setEditingId(m.id);
                        setAdding(false);
                        setConfirmId(null);
                      }}
                    >
                      <Pencil size={13} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="cp-btn cp-btn-ghost cp-btn-danger cp-btn-sm"
                      aria-label={`Remove ${m.name}`}
                      onClick={() => setConfirmId(m.id)}
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  </span>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {adding && (
        <div className="cp-divider mt-4 pt-4">
          <p className="cp-label mb-2">New team member</p>
          <MemberForm crews={crews} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </div>
      )}
    </section>
  );
}

function MemberForm({
  member,
  crews,
  onDone,
  onCancel,
}: {
  member?: TeamMember;
  crews: Crew[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [name, setName] = useState(member?.name ?? "");
  const [role, setRole] = useState<TeamRole>(member?.role ?? "worker");
  const [compType, setCompType] = useState<CompType>(member?.comp_type ?? "hourly");
  const [pct, setPct] = useState(member ? String(Number((member.comp_bps / 100).toFixed(2))) : "");
  const [rate, setRate] = useState(member ? String((member.hourly_cents / 100).toFixed(2)) : "");
  const [crewId, setCrewId] = useState(member?.crew_id ?? "");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setNotice("A name is required.");
      return;
    }
    if (usesPercent(compType) && !(Number(pct) >= 0)) {
      setNotice("Enter the share as a percentage.");
      return;
    }
    if (compType === "hourly" && toCents(rate) <= 0) {
      setNotice("Enter the hourly rate.");
      return;
    }
    const input = {
      name: trimmed,
      role,
      compType,
      compBps: usesPercent(compType) ? Math.round(Number(pct) * 100) : 0,
      hourlyCents: compType === "hourly" ? toCents(rate) : 0,
      crewId: compType === "hourly" ? crewId || null : null,
    };
    setNotice("");
    startTransition(async () => {
      const res = member ? await updateTeamMember(member.id, input) : await addTeamMember(input);
      if (res.ok) {
        router.refresh();
        onDone();
      } else {
        setNotice(res.notice ?? "Couldn't save the team member.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="cp-label" htmlFor="tm-name">Name</label>
          <input
            id="tm-name"
            className="cp-input"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="cp-label" htmlFor="tm-role">Role</label>
          <select id="tm-role" className="cp-select" value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
            {(Object.entries(TEAM_ROLE_LABEL) as [TeamRole, string][]).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="cp-label" htmlFor="tm-comp">How they&rsquo;re paid</label>
          <select
            id="tm-comp"
            className="cp-select"
            value={compType}
            onChange={(e) => setCompType(e.target.value as CompType)}
          >
            {(Object.entries(COMP_TYPE_LABEL) as [CompType, string][]).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {usesPercent(compType) && (
          <div>
            <label className="cp-label" htmlFor="tm-pct">Share</label>
            <div className="relative">
              <input
                id="tm-pct"
                className="cp-input tabular-nums"
                style={{ paddingRight: 26 }}
                inputMode="decimal"
                placeholder="0"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--cp-muted)]">
                %
              </span>
            </div>
          </div>
        )}

        {compType === "hourly" && (
          <>
            <div>
              <label className="cp-label" htmlFor="tm-rate">Hourly rate</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--cp-muted)]">
                  $
                </span>
                <input
                  id="tm-rate"
                  className="cp-input tabular-nums"
                  style={{ paddingLeft: 24 }}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="cp-label" htmlFor="tm-crew">Crew</label>
              <select id="tm-crew" className="cp-select" value={crewId} onChange={(e) => setCrewId(e.target.value)}>
                <option value="">No crew</option>
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="cp-btn cp-btn-primary cp-btn-sm" disabled={pending} onClick={submit}>
          {pending ? "Saving..." : member ? "Save changes" : "Add member"}
        </button>
        <button type="button" className="cp-btn cp-btn-sm" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
        {notice && <span className="text-[12.5px] text-[var(--cp-warn)]">{notice}</span>}
      </div>
    </div>
  );
}
