"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  fmtEt,
  fmtMoney,
  PLAN_CADENCE_LABEL,
  type Crew,
  type PlanCadence,
  type RecurringPlan,
  type RecurringPlanDetail,
} from "@urso/types";
import {
  createRecurringPlan,
  cancelRecurringPlan,
  pauseRecurringPlan,
  resumeRecurringPlan,
  sendRecurringPlanContract,
} from "@/app/CanesPressure/actions";
import { configureRepeatSchedule } from "@/app/CanesPressure/repeat-actions";

export function RecurringWorkspace({
  plans,
  selected,
  crews,
}: {
  plans: RecurringPlan[];
  selected: RecurringPlanDetail | null;
  crews: Crew[];
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; notice?: string }>) =>
    start(async () => {
      const result = await fn();
      setNotice(result.notice ?? (result.ok ? "Saved." : "Not saved."));
      router.refresh();
    });
  const next = selected?.visits.find((visit) =>
    ["unscheduled", "scheduled", "confirmed"].includes(visit.status) && (!visit.scheduled_at || Date.parse(visit.scheduled_at)>Date.parse(selected?.read_at??"1970-01-01")),
  );
  return (
    <div className="space-y-5">
      <header className="flex justify-between gap-4">
        <h1 className="cp-display text-3xl">Recurring work</h1>
        <button
          className="cp-btn cp-btn-primary"
          onClick={() => setCreating(!creating)}
        >
          New repeat schedule
        </button>
      </header>
      {notice ? (
        <p role="status" className="cp-card p-3">
          {notice}
        </p>
      ) : null}
      {creating ? (
        <form
          className="cp-card grid gap-4 p-5 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            const key = requestKey ?? crypto.randomUUID();
            setRequestKey(key);
            run(async () => {
              const result = await createRecurringPlan({
                customerName: String(f.get("customer")),
                customerPhone: String(f.get("phone")),
                customerEmail: String(f.get("email")),
                jobAddress: String(f.get("address")),
                jobName: String(f.get("service")),
                cadence: String(f.get("cadence")) as PlanCadence,
                startsOn: String(f.get("date")),
                repeatTime: String(f.get("time")),
                requestKey: key,
                items: [
                  {
                    name: String(f.get("service")),
                    quantity: 1,
                    unitPriceCents: Math.round(Number(f.get("price")) * 100),
                  },
                ],
              });
              if (result.ok && result.planId) {
                setCreating(false);
                setRequestKey(null);
                router.push(`/CanesPressure/recurring?plan=${result.planId}`);
              }
              return result;
            });
          }}
        >
          {[
            ["customer", "Customer name", "text"],
            ["phone", "Phone", "tel"],
            ["email", "Email", "email"],
            ["address", "Job address", "text"],
            ["service", "Service", "text"],
            ["price", "Price per visit ($)", "number"],
            ["date", "First visit date", "date"],
            ["time", "Repeat time (Eastern)", "time"],
          ].map(([name, label, type]) => (
            <label key={name}>
              {label}
              <input
                className="cp-input"
                name={name}
                type={type}
                step={name === "price" ? "0.01" : undefined}
                required={[
                  "customer",
                  "service",
                  "price",
                  "date",
                  "time",
                ].includes(name)}
              />
            </label>
          ))}
          <label>
            Cadence
            <select name="cadence" className="cp-input">
              {Object.entries(PLAN_CADENCE_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm">
            Creates the next scheduled visit. A separate service agreement is
            optional.
          </p>
          <button disabled={busy} className="cp-btn cp-btn-primary">
            Create repeat schedule
          </button>
        </form>
      ) : null}
      <div className="cp-card divide-y">
        {plans.map((plan) => (
          <Link
            key={plan.id}
            className="flex flex-wrap justify-between gap-3 p-4"
            href={`/CanesPressure/recurring?plan=${plan.id}`}
          >
            <span>
              <strong>
                {plan.customer_name} · {plan.job_name}
              </strong>
              <small className="block">
                {PLAN_CADENCE_LABEL[plan.cadence]} ·{" "}
                {plan.repeat_time?.slice(0, 5) ?? "Set repeat time"} Eastern ·{" "}
                {plan.status}
              </small>
            </span>
            <span>{fmtMoney(plan.price_per_visit_cents)}/visit</span>
          </Link>
        ))}
      </div>
      {selected ? (
        <section key={selected.id} className="cp-card space-y-4 p-5">
          <h2 className="text-xl font-semibold">
            {selected.number} · {selected.customer_name}
          </h2>
          <p>
            {selected.scheduling_enabled
              ? "Automatic booking enabled"
              : "Confirm the date and time below to enable automatic booking."}
          </p>
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              run(() =>
                configureRepeatSchedule(selected.id, {
                  startsOn: String(f.get("date")),
                  repeatTime: String(f.get("time")),
                  cadence: String(f.get("cadence")) as PlanCadence,
                  durationMinutes: Number(f.get("duration")),
                  crewId: String(f.get("crew")) || null,
                }),
              );
            }}
          >
            <label>
              Next visit date
              <input
                className="cp-input"
                name="date"
                type="date"
                defaultValue={
                  next?.scheduled_at
                    ? new Intl.DateTimeFormat("en-CA", {
                        timeZone: "America/New_York",
                      }).format(new Date(next.scheduled_at))
                    : (selected.next_due_on ?? selected.starts_on)
                }
                required
              />
            </label>
            <label>
              Time (Eastern)
              <input
                className="cp-input"
                name="time"
                type="time"
                defaultValue={selected.repeat_time?.slice(0, 5) ?? "08:00"}
                required
              />
            </label>
            <label>
              Cadence
              <select
                name="cadence"
                className="cp-input"
                defaultValue={selected.cadence}
              >
                {Object.entries(PLAN_CADENCE_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Duration (minutes)
              <input
                className="cp-input"
                name="duration"
                type="number"
                min="15"
                max="1440"
                defaultValue={selected.duration_minutes ?? 120}
              />
            </label>
            <label>
              Crew
              <select
                name="crew"
                className="cp-input"
                defaultValue={selected.crew_id ?? ""}
              >
                <option value="">Unassigned</option>
                {crews.map((crew) => (
                  <option key={crew.id} value={crew.id}>
                    {crew.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="cp-btn cp-btn-primary"
              disabled={busy || selected.status === "canceled"}
            >
              Update upcoming and future visits
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            {selected.status === "active" ? (
              <button
                className="cp-btn"
                disabled={busy}
                onClick={() => run(() => pauseRecurringPlan(selected.id))}
              >
                Pause future generation
              </button>
            ) : selected.status === "paused" ? (
              <button
                className="cp-btn"
                disabled={busy}
                onClick={() => run(() => resumeRecurringPlan(selected.id))}
              >
                Resume
              </button>
            ) : null}
            {selected.status !== "canceled" ? (
              <button
                className="cp-btn"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "Stop this series? Future generation stops. Existing visits remain unless you cancel them separately.",
                    )
                  )
                    run(() =>
                      cancelRecurringPlan(selected.id, {
                        cancelOpenVisit: false,
                        billFee: false,
                      }),
                    );
                }}
              >
                Stop series
              </button>
            ) : null}
            {!selected.signed_at && selected.status !== "canceled" ? (
              <button
                className="cp-btn"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "Send the optional service agreement to this customer?",
                    )
                  )
                    run(() => sendRecurringPlanContract(selected.id));
                }}
              >
                Send optional agreement
              </button>
            ) : null}
          </div>
          {selected.visits.map((visit) => (
            <Link
              key={visit.id}
              className="block border-t py-3"
              href={`/CanesPressure/jobs?job=${visit.id}`}
            >
              {visit.scheduled_at ? fmtEt(visit.scheduled_at) : "Unscheduled"} ·{" "}
              {visit.status} · {fmtMoney(visit.total_cents)}
            </Link>
          ))}
        </section>
      ) : null}
    </div>
  );
}
