export const SERVICE_AREAS = [
  { key: "north", number: 1, label: "North Palm Beach County", short: "North", days: "Monday and Tuesday", weekdays: [1, 2], color: "#dc2626", tint: "#dc262614" },
  { key: "central", number: 2, label: "Central Palm Beach County", short: "Central", days: "Wednesday and Thursday", weekdays: [3, 4], color: "#2563eb", tint: "#2563eb14" },
  { key: "south", number: 3, label: "South Palm Beach County", short: "South", days: "Friday and Saturday", weekdays: [5, 6], color: "#16a34a", tint: "#16a34a14" },
] as const;

export type ServiceArea = (typeof SERVICE_AREAS)[number]["key"];

export function isServiceArea(value: unknown): value is ServiceArea {
  return SERVICE_AREAS.some((area) => area.key === value);
}

export function serviceAreaInfo(value: ServiceArea | null | undefined) {
  return SERVICE_AREAS.find((area) => area.key === value) ?? null;
}

export function serviceAreaForDate(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateKey) return null;
  const weekday = date.getUTCDay();
  return SERVICE_AREAS.find((area) => (area.weekdays as readonly number[]).includes(weekday)) ?? null;
}

export function serviceAreaScheduleNotice(area: ServiceArea | null | undefined, scheduledAt: string): string | null {
  const info = serviceAreaInfo(area);
  const date = new Date(scheduledAt);
  if (!info || !Number.isFinite(date.getTime())) return null;
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  if (serviceAreaForDate(dateKey)?.key === area) return null;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(date);
  return `Scheduled for ${weekday}. Area ${info.number} (${info.short}) normally uses ${info.days}.`;
}
