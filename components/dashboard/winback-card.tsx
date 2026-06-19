"use client";

// Inactive-customer win-back card with functional buttons: Contact marks a
// customer messaged; the campaign button confirms and launches (mock).

import { useState } from "react";
import { Card, Micro } from "./ui";
import { Modal } from "./modal";
import { useT } from "@/components/dashboard/locale-provider";

type Inactive = { name: string; store: string; last: string; visits: number };

export function WinbackCard({ list, winbackCount }: { list: Inactive[]; winbackCount: number }) {
  const t = useT();
  const [contacted, setContacted] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState(false);
  const [launched, setLaunched] = useState(false);

  return (
    <Card pad={false} className="mt-3 flex flex-col">
      <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-5">
        <div>
          <Micro>{t("Retention")}</Micro>
          <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">{t("Inactive customers")}</h2>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-bold tracking-[-0.01em]">{winbackCount}</div>
          <Micro>{t("eligible for win-back")}</Micro>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="border-t border-edge px-5 py-8 text-center text-[13px] text-ink-dim">{t("No lapsed customers flagged for this location in the selected period.")}</div>
      ) : (
        list.map((c) => {
          const done = contacted[c.name];
          return (
            <div key={c.name} className="flex items-center gap-3 border-t border-edge px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] text-ink">{c.name}</div>
                <Micro className="mt-0.5 !text-ink-dimmer">{c.store} · {t("last visit")} {c.last}</Micro>
              </div>
              <span className="font-mono text-[12px] text-ink-dim">{c.visits} {t("visits")}</span>
              <button
                onClick={() => setContacted((p) => ({ ...p, [c.name]: true }))}
                disabled={done}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors ${
                  done ? "cursor-default border-[rgba(70,209,138,0.3)] text-[var(--color-good)]" : "cursor-pointer border-edge-strong text-ink hover:bg-raise"
                }`}
              >
                {done ? `${t("Messaged")} ✓` : t("Contact")}
              </button>
            </div>
          );
        })
      )}

      <div className="mt-auto border-t border-edge p-4">
        <button
          onClick={() => setConfirm(true)}
          className="w-full cursor-pointer rounded-lg border border-edge-strong py-2.5 text-[13.5px] font-medium text-ink transition-colors hover:bg-raise"
        >
          {launched ? `${t("Win-back campaign running")} ✓` : `${t("Start win-back campaign")} · ${winbackCount} ${t("customers")}`}
        </button>
      </div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        eyebrow={t("Win-back campaign")}
        title={launched ? t("Campaign is running") : `${t("Message")} ${winbackCount} ${t("lapsed customers?")}`}
        footer={
          launched ? (
            <button onClick={() => setConfirm(false)} className="w-full cursor-pointer rounded-lg border border-edge-strong px-4 py-2.5 text-[13px] text-ink transition-colors hover:bg-raise">
              {t("Close")}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLaunched(true)}
                className="flex-1 cursor-pointer rounded-lg bg-orange px-4 py-2.5 text-[13px] font-medium text-white transition hover:brightness-110"
              >
                {t("Launch campaign")}
              </button>
              <button onClick={() => setConfirm(false)} className="cursor-pointer rounded-lg border border-edge-strong px-4 py-2.5 text-[13px] text-ink transition-colors hover:bg-raise">
                {t("Cancel")}
              </button>
            </div>
          )
        }
      >
        {launched ? (
          <p className="text-[13.5px] leading-[1.6] text-ink-dim">
            {t("The Retention agent is sending a personalised rebooking link to")} {winbackCount} {t("lapsed customers over a short, spaced sequence. Replies and rebookings will show up on the AI actions page.")}
          </p>
        ) : (
          <p className="text-[13.5px] leading-[1.6] text-ink-dim">
            {t("This sends a personalised rebooking link to every customer inactive between 60 days and a year. Customers gone longer are marked dormant and left out — a rebooking nudge two years later reads as spam. Messages are spaced over a few days, and nothing sends until you launch.")}
          </p>
        )}
      </Modal>
    </Card>
  );
}
