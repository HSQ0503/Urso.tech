"use client";

type Props = { onComplete: () => void };

export function AuditCinematic({ onComplete }: Props) {
  // Auto-complete immediately for now — Task 11 builds the real shell.
  if (typeof window !== "undefined") {
    setTimeout(onComplete, 0);
  }
  return null;
}
