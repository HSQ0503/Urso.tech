"use client";
import { useState, useTransition } from "react";
import { repeatSourceDefaults } from "@/app/CanesPressure/repeat-actions";
import { useRouter } from "next/navigation";
import {
  PLAN_CADENCE_LABEL,
  type DocumentKind,
  type PlanCadence,
} from "@urso/types";
import {
  createRecurringPlanFromEstimate,
  createRecurringPlanFromInvoice,
  createRecurringPlanFromJob,
} from "@/app/CanesPressure/actions";

export function RepeatFromDocument({
  kind,
  id,
}: {
  kind: DocumentKind;
  id: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [defaults, setDefaults] = useState<{
    linked: boolean;
    startsOn: string;
    repeatTime: string;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <details
      className="cp-card my-3 p-4"
      onToggle={(event) => {
        if (event.currentTarget.open && !defaults)
          start(async () => {
            const result = await repeatSourceDefaults(kind, id);
            if (result.ok && "data" in result) setDefaults(result.data);
            else setNotice(result.notice ?? "The source could not be loaded.");
          });
      }}
    >
      <summary className="cursor-pointer font-semibold">
        Make this work recurring
      </summary>
      <p className="my-3 text-sm">
        The services and total come from this document. A linked scheduled work
        order remains visit one; future visits repeat from its date. Choose the
        first date below when there is no scheduled work order.
      </p>
      {notice ? <p role="status">{notice}</p> : null}
      <form
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const opts = {
            cadence: String(data.get("cadence")) as PlanCadence,
            startsOn: String(data.get("date")),
            repeatTime: String(data.get("time")),
          };
          start(async () => {
            const result = await (kind === "estimate"
              ? createRecurringPlanFromEstimate(id, opts)
              : kind === "invoice"
                ? createRecurringPlanFromInvoice(id, opts)
                : createRecurringPlanFromJob(id, opts));
            setNotice(
              result.notice ??
                (result.ok ? "Repeat schedule created." : "Not saved."),
            );
            if (result.ok && result.planId)
              router.push(`/CanesPressure/recurring?plan=${result.planId}`);
          });
        }}
      >
        <label>
          First date
          <input
            className="cp-input"
            name="date"
            type="date"
            required
            value={defaults?.startsOn ?? ""}
            readOnly={defaults?.linked}
            onChange={(event) =>
              setDefaults((current) =>
                current
                  ? { ...current, startsOn: event.target.value }
                  : current,
              )
            }
          />
          {defaults?.linked ? (
            <small>Existing visit date; retained as visit one.</small>
          ) : null}
        </label>
        <label>
          Time (Eastern)
          <input
            className="cp-input"
            name="time"
            type="time"
            value={defaults?.repeatTime ?? "08:00"}
            onChange={(event) =>
              setDefaults((current) =>
                current
                  ? { ...current, repeatTime: event.target.value }
                  : current,
              )
            }
            required
          />
        </label>
        <label>
          Cadence
          <select className="cp-input" name="cadence" defaultValue="quarterly">
            {Object.entries(PLAN_CADENCE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy || !defaults} className="cp-btn cp-btn-primary">
          Create scheduled repeat
        </button>
      </form>
    </details>
  );
}
