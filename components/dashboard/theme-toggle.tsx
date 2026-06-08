"use client";

// Light / dark switch. The active theme lives on <html data-theme> (set before
// paint by the inline script in the root layout) and is persisted to
// localStorage. We read it via useSyncExternalStore so the client value is
// correct on first render with no hydration mismatch or effect-driven setState.

import { useSyncExternalStore, type ReactNode } from "react";

type Theme = "dark" | "light";

let listeners: Array<() => void> = [];
function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}
function getServerSnapshot(): Theme {
  return "dark";
}
function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem("urso-theme", t);
  } catch {}
  listeners.forEach((l) => l());
}

function Sun() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function Moon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

const opts: { value: Theme; label: string; icon: ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun /> },
  { value: "dark", label: "Dark", icon: <Moon /> },
];

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-edge bg-raise p-0.5">
      {opts.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            onClick={() => applyTheme(o.value)}
            aria-pressed={active}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] transition-colors ${
              active ? "bg-raise-strong text-ink" : "text-ink-dim hover:text-ink"
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
