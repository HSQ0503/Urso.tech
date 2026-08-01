const EASTERN_MONTH = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
});

export function currentEasternMonth(date = new Date()): string {
  const parts = EASTERN_MONTH.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Eastern reporting month is unavailable on this device.");
  return `${year}-${month}`;
}

export function shiftMonth(current: string, delta: number): string {
  const [year, month] = current.split("-").map(Number);
  const absoluteMonth = year * 12 + month - 1 + delta;
  const shiftedYear = Math.floor(absoluteMonth / 12);
  const shiftedMonth = absoluteMonth - shiftedYear * 12 + 1;
  return `${shiftedYear}-${String(shiftedMonth).padStart(2, "0")}`;
}
