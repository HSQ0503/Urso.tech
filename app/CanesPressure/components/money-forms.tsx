"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  fmtMoney,
  type MoneyMutation,
  type MoneyReport,
  type MoneyTab,
} from "@urso/types";
import { mutateMoney } from "../money-actions";

function MoneyForm({
  title,
  children,
  input,
}: {
  title: string;
  children: React.ReactNode;
  input: (data: FormData, key: string) => MoneyMutation;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState("");
  const request = useRef({ signature: "", key: "" });
  return (
    <details className="cp-card p-4">
      <summary className="min-h-7 cursor-pointer font-semibold">
        {title}
      </summary>
      <form
        className="mt-4 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget,
            data = new FormData(form);
          const signature = JSON.stringify([...data.entries()]);
          if (signature !== request.current.signature || !request.current.key)
            request.current = { signature, key: crypto.randomUUID() };
          start(async () => {
            const result = await mutateMoney(input(data, request.current.key));
            setNotice(
              result.notice ?? (result.ok ? "Saved." : "Could not save."),
            );
            if (result.ok) {
              form.reset();
              request.current = { signature: "", key: "" };
              router.refresh();
            }
          });
        }}
      >
        {children}
        <button className="cp-btn cp-btn-primary" disabled={pending}>
          {pending ? "Saving…" : title}
        </button>
        {notice ? (
          <p role="status" className="text-sm">
            {notice}
          </p>
        ) : null}
      </form>
    </details>
  );
}
const text = (data: FormData, key: string) => String(data.get(key) ?? "");
const money = (data: FormData, key: string) =>
  Math.round(Number(data.get(key)) * 100);
function Field({
  name,
  label,
  type = "text",
  required = true,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="cp-label">
      {label}
      <input
        name={name}
        type={type}
        step={type === "number" ? "0.01" : undefined}
        required={required}
        className="cp-input mt-1"
      />
    </label>
  );
}
function Choices({
  name,
  label,
  options,
  empty = false,
}: {
  name: string;
  label: string;
  options: { id: string; name: string }[];
  empty?: boolean;
}) {
  return (
    <label className="cp-label">
      {label}
      <select className="cp-select mt-1" name={name} required={!empty}>
        <option value="">{empty ? "Unassigned" : "Choose…"}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MoneyForms({
  report,
  tab,
}: {
  report: MoneyReport;
  tab: MoneyTab;
}) {
  const worker = (
    <Choices name="employee" label="Worker" options={report.workers} />
  );
  const job = <Choices name="job" label="Work order" options={report.jobs} />;
  if (tab === "marketing")
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        <MoneyForm
          title="Record marketing spend"
          input={(data, key) => ({
            action: "spend",
            channelId: text(data, "channel"),
            date: text(data, "date"),
            amountCents: money(data, "amount"),
            note: text(data, "note"),
            requestKey: key,
          })}
        >
          <Choices
            name="channel"
            label="Channel"
            options={report.channels.filter((channel) => channel.active)}
          />
          <Field name="date" label="Paid on" type="date" />
          <Field name="amount" label="Amount ($)" type="number" />
          <Field name="note" label="Description / campaign period" />
          <p className="text-xs text-[var(--cp-muted)]">
            Record spending already paid. Don’t add a period total if its
            individual expenses are already recorded.
          </p>
        </MoneyForm>
        <MoneyForm
          title="Set job acquisition channel"
          input={(data) => ({
            action: "attribution",
            jobId: text(data, "job"),
            channelId: text(data, "channel") || null,
          })}
        >
          {job}
          <Choices
            name="channel"
            label="Primary channel"
            options={report.channels.filter((channel) => channel.active)}
            empty
          />
          <p className="text-xs text-[var(--cp-muted)]">
            Set before collecting a payment. Recurring work keeps its original
            acquisition channel.
          </p>
        </MoneyForm>
        <MoneyForm
          title="Add marketing channel"
          input={(data) => ({ action: "channel", name: text(data, "name") })}
        >
          <Field name="name" label="Channel name" />
        </MoneyForm>
      </div>
    );
  if (tab === "workers")
    return (
      <div className="space-y-3">
        <MoneyForm
          title="Set worker rate"
          input={(data) => ({
            action: "rate",
            employeeId: text(data, "employee"),
            effectiveOn: text(data, "date"),
            hourlyCents: money(data, "hourly"),
            commissionBps: money(data, "commission"),
          })}
        >
          {worker}
          <Field name="date" label="Effective on" type="date" />
          <Field name="hourly" label="Hourly rate ($)" type="number" />
          <Field
            name="commission"
            label="Upsell commission (%; 0 disables)"
            type="number"
          />
          <p className="text-xs text-[var(--cp-muted)]">
            Approved earnings keep their saved rate. Commission applies only to
            approved additional collected service revenue, after discounts and
            refunds.
          </p>
        </MoneyForm>
        <MoneyForm
          title="Approve actual hours"
          input={(data, key) => ({
            action: "approveTime",
            employeeId: text(data, "employee"),
            jobId: text(data, "job"),
            date: text(data, "date"),
            minutes: Math.round(Number(data.get("hours")) * 60),
            reason: text(data, "reason"),
            requestKey: key,
          })}
        >
          {worker}
          {job}
          <Field name="date" label="Work date" type="date" />
          <Field name="hours" label="Actual hours worked" type="number" />
          <Field name="reason" label="Approval / correction reason" />
        </MoneyForm>
        {report.time
          .filter((time) => !time.approved && time.checkedOutAt)
          .map((time) => (
            <MoneyForm
              key={time.id}
              title={`Approve ${time.employeeName} · ${((time.minutes ?? 0) / 60).toFixed(2)} hours`}
              input={(data, key) => ({
                action: "approveTime",
                employeeId: time.employeeId,
                jobId: time.jobId,
                entryId: time.id,
                date: new Intl.DateTimeFormat("en-CA", {
                  timeZone: "America/New_York",
                }).format(new Date(time.checkedInAt)),
                minutes: Math.round(Number(data.get("hours")) * 60),
                reason: text(data, "reason"),
                requestKey: key,
              })}
            >
              <p className="text-sm">
                {time.checkedInAt} to {time.checkedOutAt}. Confirm or correct
                the actual hours.
              </p>
              <Field name="hours" label="Approved hours" type="number" />
              <Field name="reason" label="Approval reason" />
            </MoneyForm>
          ))}
        <MoneyForm
          title="Approve an upsell"
          input={(data) => {
            const line = report.upsellLines.find(
              (line) =>
                `${line.invoiceId}:${line.serviceLineId}` ===
                text(data, "line"),
            );
            return {
              action: "upsell",
              employeeId: text(data, "employee"),
              invoiceId: line?.invoiceId ?? "",
              serviceLineId: line?.serviceLineId ?? "",
              additionalCents: money(data, "amount"),
              reason: text(data, "reason"),
            };
          }}
        >
          {worker}
          <Choices
            name="line"
            label="Additional service"
            options={report.upsellLines.map((line) => ({
              id: `${line.invoiceId}:${line.serviceLineId}`,
              name: `${line.invoiceNumber} · ${line.name} · ${fmtMoney(line.cents)}`,
            }))}
          />
          <Field
            name="amount"
            label="Additional approved amount, before tax ($)"
            type="number"
          />
          <Field name="reason" label="What extra work did this worker sell?" />
        </MoneyForm>
        <MoneyForm
          title="Record earnings adjustment"
          input={(data, key) => ({
            action: "adjustment",
            employeeId: text(data, "employee"),
            jobId: text(data, "job") || undefined,
            date: text(data, "date"),
            amountCents: money(data, "amount"),
            reason: text(data, "reason"),
            requestKey: key,
          })}
        >
          {worker}
          <Choices
            name="job"
            label="Work order (optional)"
            options={report.jobs}
            empty
          />
          <Field name="date" label="Effective date" type="date" />
          <Field
            name="amount"
            label="Adjustment ($; negative reduces earnings)"
            type="number"
          />
          <Field name="reason" label="Reason" />
        </MoneyForm>
      </div>
    );
  if (tab === "payments")
    return (
      <MoneyForm
        title="Classify manual payment"
        input={(data) => ({
          action: "paymentMethod",
          paymentId: text(data, "payment"),
          method: text(data, "method"),
        })}
      >
        <Choices
          name="payment"
          label="Manual collection"
          options={report.payments
            .filter(
              (payment) => payment.provider === "Manual" && payment.cents > 0,
            )
            .map((payment) => ({
              id: payment.paymentId,
              name: `${payment.at.slice(0, 10)} · ${fmtMoney(payment.cents)} · ${payment.method}`,
            }))}
        />
        <Choices
          name="method"
          label="Payment method"
          options={[
            "cash",
            "card",
            "check",
            "bank",
            "zelle",
            "venmo",
            "other",
          ].map((method) => ({ id: method, name: method }))}
        />
      </MoneyForm>
    );
  if (tab === "services")
    return (
      <MoneyForm
        title="Set completed service date"
        input={(data) => ({
          action: "serviceDate",
          jobId: text(data, "job"),
          date: text(data, "date"),
        })}
      >
        {job}
        <Field name="date" label="Actual completion date" type="date" />
      </MoneyForm>
    );
  if (tab === "expenses")
    return (
      <MoneyForm
        title="Classify job cost"
        input={(data) => ({
          action: "cost",
          costId: text(data, "cost"),
          serviceLineId: text(data, "line").split(":")[1] || null,
          paidOn: text(data, "date") || null,
        })}
      >
        <Choices
          name="cost"
          label="Job cost"
          options={report.jobCosts.map((cost) => ({
            id: cost.id,
            name: `${cost.label} · ${fmtMoney(cost.amountCents)}${cost.paidOn ? ` · paid ${cost.paidOn}` : " · payment date unknown"}`,
          }))}
        />
        <Choices
          name="line"
          label="Direct service (otherwise allocated)"
          empty
          options={report.jobServiceLines.map((line) => ({
            id: `${line.jobId}:${line.id}`,
            name: line.name,
          }))}
        />
        <Field
          name="date"
          label="Actually paid on (optional)"
          type="date"
          required={false}
        />
      </MoneyForm>
    );
  return null;
}
