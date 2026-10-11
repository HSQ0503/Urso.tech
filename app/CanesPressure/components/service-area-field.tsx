"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SERVICE_AREAS, serviceAreaInfo, type ServiceArea } from "@urso/types";
import { setDocumentServiceArea } from "@/app/CanesPressure/area-actions";

export function ServiceAreaField({ value, onChange, disabled = false, id = "service-area" }: {
  value: ServiceArea | null;
  onChange: (area: ServiceArea | null) => void;
  disabled?: boolean;
  id?: string;
}) {
  const area = serviceAreaInfo(value);
  return (
    <div>
      <label htmlFor={id} className="cp-label">Service area</label>
      <select id={id} className="cp-select w-full" value={value ?? ""} disabled={disabled}
        onChange={(event) => onChange(event.target.value ? event.target.value as ServiceArea : null)}>
        <option value="">Unassigned</option>
        {SERVICE_AREAS.map((item) => <option key={item.key} value={item.key}>Area {item.number} - {item.label}</option>)}
      </select>
      <p className="mt-1 text-xs text-[var(--cp-muted)]">
        {area ? <><span aria-hidden style={{ color: area.color }}>● </span>{area.days}. Other days can still be booked.</> : "Choose an area to group nearby work. Sunday remains available."}
      </p>
    </div>
  );
}

export function ServiceAreaEditor({ kind, id, value }: {
  kind: "estimate" | "job" | "invoice" | "plan";
  id: string;
  value: ServiceArea | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState(value);
  return (
    <div className="cp-card p-4">
      <ServiceAreaField value={selected} id={`area-${kind}-${id}`} disabled={pending} onChange={(area) => {
        setNotice(null);
        startTransition(async () => {
          const result = await setDocumentServiceArea(kind, id, area);
          if (!result.ok) setNotice(result.notice ?? "Area could not be saved.");
          else { setSelected(area); router.refresh(); }
        });
      }} />
      {notice && <p role="alert" className="mt-2 text-sm text-[var(--cp-danger)]">{notice}</p>}
    </div>
  );
}
