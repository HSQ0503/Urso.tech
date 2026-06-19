"use client";

// The store scoreboard — a "who's #1" leaderboard ranked by the composite store
// score. The owner can edit the prize. On the manager view it shows relative
// standing only (rank + score), never another store's raw internals.

import { useState } from "react";
import { InfoTip } from "./info-tip";
import { SCORE_WEIGHTS, type StoreScore } from "./data";

function Trophy({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
      <path d="M9 14.5V17h6v-2.5M8 21h8M10 17h4" />
    </svg>
  );
}

const criteria = (
  <div>
    <div className="font-medium text-ink">How the score works</div>
    <p className="mt-1.5">A 0–100 score from the things a store controls, measured from real POS data. Revenue and store size are excluded so newer stores compete fairly. Calls answered and review rating join the score when call tracking and Google go live.</p>
    <ul className="mt-2.5 space-y-1">
      {SCORE_WEIGHTS.map((w) => (
        <li key={w.key} className="flex items-center justify-between gap-4">
          <span>{w.label}</span>
          <span className="font-mono text-ink">{w.weight}%</span>
        </li>
      ))}
    </ul>
  </div>
);

export function StoreScoreboard({
  rows,
  highlightId = null,
  variant = "owner",
  defaultPrize = "Monthly bonus + bragging rights",
}: {
  rows: StoreScore[];
  highlightId?: string | null;
  variant?: "owner" | "manager";
  defaultPrize?: string;
}) {
  const canEdit = variant === "owner";
  const [prize, setPrize] = useState(defaultPrize);
  const [editing, setEditing] = useState(false);
  const min = rows[rows.length - 1]?.score ?? 0;
  const max = rows[0]?.score ?? 100;

  return (
    <div className="overflow-hidden rounded-none border border-edge bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">Scoreboard · ranked by overall score</span>
          <InfoTip text={criteria} />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dimmer">Prize</span>
          {editing && canEdit ? (
            <input
              autoFocus
              value={prize}
              onChange={(e) => setPrize(e.target.value)}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") setEditing(false);
              }}
              className="w-[200px] rounded-full border border-orange/50 bg-bg px-3 py-1 text-[12px] text-ink outline-none"
            />
          ) : (
            <button
              onClick={() => canEdit && setEditing(true)}
              disabled={!canEdit}
              className={`inline-flex items-center gap-1.5 rounded-full border border-[rgba(254,81,0,0.35)] bg-orange-soft px-3 py-1 text-[12px] text-orange ${canEdit ? "cursor-pointer hover:bg-[rgba(254,81,0,0.18)]" : "cursor-default"}`}
            >
              <Trophy className="size-3.5" />
              {prize}
              {canEdit && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></svg>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-edge">
        {rows.map((r) => {
          const isLeader = r.rank === 1;
          const mine = r.id === highlightId;
          const width = Math.round(28 + ((r.score - min) / (max - min || 1)) * 72);
          return (
            <div
              key={r.id}
              className={`relative flex items-center gap-4 px-5 ${isLeader ? "py-4" : "py-3"} ${mine ? "bg-orange-wash" : ""}`}
            >
              {mine && <span className="absolute left-0 top-1/2 h-7 w-[2.5px] -translate-y-1/2 rounded-full bg-orange" />}

              <div className={`grid shrink-0 place-items-center rounded-full font-mono ${isLeader ? "size-9 bg-orange text-[15px] text-white" : "size-8 border border-edge-strong text-[13px] text-ink-dim"}`}>
                {r.rank}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`truncate ${isLeader ? "text-[15px] text-ink" : "text-[14px] text-ink-dim"}`}>{r.name}</span>
                  {isLeader && (
                    <span className="inline-flex items-center gap-1 text-orange">
                      <Trophy className="size-3.5" />
                      <span className="font-mono text-[9px] uppercase tracking-[0.14em]">Leader</span>
                    </span>
                  )}
                  {mine && <span className="rounded-full border border-edge-strong px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.12em] text-ink">You</span>}
                </div>
                <div className="mt-1.5 h-1.5 w-full max-w-[260px] overflow-hidden rounded-full bg-track">
                  <div className="h-full rounded-full" style={{ width: `${width}%`, background: isLeader || mine ? "#fe5100" : "var(--color-series)" }} />
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className={`font-medium leading-none tracking-[-0.02em] ${isLeader ? "text-[30px] text-orange" : "text-[22px] text-ink"}`}>{r.score}</div>
                <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dimmer">score</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
