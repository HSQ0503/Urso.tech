// Initials avatar for lead rows — the one allowed circle. Server-safe.
// Falls back to a phone-shaped mark when a lead has no name yet.

function initials(name: string | null): string {
  const parts = name?.trim().split(/\s+/) ?? [];
  if (parts.length === 0 || !parts[0]) return "?";
  const first = parts[0][0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

export function LeadAvatar({ name, className }: { name: string | null; className?: string }) {
  return <span className={`cp-avatar ${className ?? ""}`}>{initials(name)}</span>;
}
