import { ET, etLocalToIso } from "@urso/types";

export function todayEt(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (kind: string) => parts.find((item) => item.type === kind)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addCalendarDays(value: string, count: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function dateLabel(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

export function dateInput(value: string): string {
  return `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}`;
}

export function parseDateInput(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const date = `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  return isCalendarDate(date) ? date : null;
}

export function expiryForDate(value: string): string {
  return etLocalToIso(`${value}T23:59:59`);
}
