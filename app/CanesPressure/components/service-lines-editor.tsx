"use client";

import { useState } from "react";
import {
  STANDARD_SERVICES,
  fmtMoney,
  priceServices,
  type ServiceLineInput,
} from "@urso/types";

export function ServiceLinesEditor({
  lines,
  onChange,
}: {
  lines: ServiceLineInput[];
  onChange: (lines: ServiceLineInput[]) => void;
}) {
  const patch = (index: number, change: Partial<ServiceLineInput>) =>
    onChange(
      lines.map((line, i) => (i === index ? { ...line, ...change } : line)),
    );
  let total: number | null = null;
  try {
    total = priceServices(lines).totalCents;
  } catch {
    /* Incomplete inputs stay editable. */
  }
  return (
    <section className="space-y-3" aria-label="Service lines">
      <label className="cp-label">
        Add a service
        <select
          className="cp-select mt-1"
          value=""
          onChange={(event) => {
            const service = STANDARD_SERVICES.find(
              (item) => item.key === event.target.value,
            );
            if (service || event.target.value === "custom")
              onChange([
                ...lines,
                {
                  name: service?.name ?? "",
                  serviceCategory: service?.key ?? "custom",
                  quantity: 1,
                  unitPriceCents: 0,
                },
              ]);
          }}
        >
          <option value="" disabled>
            Choose a service
          </option>
          {STANDARD_SERVICES.map((service) => (
            <option key={service.key} value={service.key}>
              {service.name}
            </option>
          ))}
          <option value="custom">Add Custom Service</option>
        </select>
      </label>
      {lines.map((line, index) => (
        <div
          key={index}
          className="space-y-2 rounded-lg border border-[var(--cp-line)] p-3"
        >
          <div className="flex items-center gap-2">
            <input
              className="cp-input"
              aria-label={`Service ${index + 1} name`}
              value={line.name}
              placeholder="Describe the custom service"
              onChange={(event) => patch(index, { name: event.target.value })}
            />
            <button
              type="button"
              className="cp-btn min-h-11"
              onClick={() => onChange(lines.filter((_, i) => i !== index))}
              aria-label={`Remove service ${index + 1}`}
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="cp-label">
              Quantity
              <DecimalInput
                className="cp-input mt-1"
                type="number"
                min="0.01"
                step="0.01"
                value={line.quantity}
                onValue={(value) => patch(index, { quantity: value })}
              />
            </label>
            <label className="cp-label">
              Price per unit ($)
              <DecimalInput
                className="cp-input mt-1"
                type="number"
                min="0"
                step="0.01"
                value={line.unitPriceCents / 100}
                placeholder="Enter price"
                onValue={(value) =>
                  patch(index, { unitPriceCents: Math.round(value * 100) })
                }
              />
            </label>
          </div>
        </div>
      ))}
      <div className="flex justify-between text-sm">
        <span>Total</span>
        <strong className="tabular-nums">
          {total === null ? "Complete service details" : fmtMoney(total)}
        </strong>
      </div>
    </section>
  );
}

function DecimalInput({
  value,
  onValue,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number;
  onValue: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...props}
      value={draft ?? String(value || "")}
      onFocus={() => setDraft(String(value || ""))}
      onBlur={() => setDraft(null)}
      onChange={(event) => {
        setDraft(event.target.value);
        onValue(Number(event.target.value));
      }}
    />
  );
}
