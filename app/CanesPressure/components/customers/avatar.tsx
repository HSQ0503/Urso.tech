// Initials avatar — the one allowed circle. Server-safe (no interactivity).

function initials(name: string | null): string {
  const parts = name?.trim().split(/\s+/) ?? [];
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

export function CustomerAvatar({ name, className }: { name: string | null; className?: string }) {
  return <span className={`cp-avatar ${className ?? ""}`}>{initials(name)}</span>;
}
