import type { ReactElement } from "react";

type IconName =
  | "star"
  | "calendar"
  | "phone"
  | "pin"
  | "repeat"
  | "bot"
  | "layers"
  | "chart"
  | "dollar"
  | "check";

const paths: Record<IconName, ReactElement> = {
  star: (
    <path
      d="M8 1.5l2 4.5 5 .6-3.7 3.4 1 4.9L8 12.4l-4.3 2.5 1-4.9L1 6.6 6 6z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  calendar: (
    <g stroke="currentColor" strokeWidth="1.2" fill="none">
      <rect x="1.5" y="3" width="13" height="11" rx="1.5" />
      <path d="M5 1.5v3M11 1.5v3M1.5 7h13" />
    </g>
  ),
  phone: (
    <path
      d="M3 2.5h2.5l1.5 4-2 1.2c.6 1.7 1.9 3 3.6 3.6L9.8 9.3l4 1.5V13a1.5 1.5 0 01-1.5 1.5C7 14.5 1.5 9 1.5 4 1.5 3.2 2.2 2.5 3 2.5z"
      stroke="currentColor"
      strokeWidth="1.2"
      fill="none"
      strokeLinejoin="round"
    />
  ),
  pin: (
    <g stroke="currentColor" strokeWidth="1.2" fill="none">
      <path d="M8 1.5c-2.8 0-5 2.2-5 5 0 3.7 5 8 5 8s5-4.3 5-8c0-2.8-2.2-5-5-5z" />
      <circle cx="8" cy="6.5" r="2" />
    </g>
  ),
  repeat: (
    <g stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round">
      <path d="M2.5 8a5.5 5.5 0 019.5-3.8M13.5 8a5.5 5.5 0 01-9.5 3.8" />
      <path d="M12 1.5v3h-3M4 14.5v-3h3" />
    </g>
  ),
  bot: (
    <g stroke="currentColor" strokeWidth="1.2" fill="none">
      <rect x="2.5" y="5" width="11" height="9" rx="2" />
      <circle cx="6" cy="9" r=".8" fill="currentColor" />
      <circle cx="10" cy="9" r=".8" fill="currentColor" />
      <path d="M8 2.5V5M6.5 12h3" />
    </g>
  ),
  layers: (
    <g stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round">
      <path d="M8 2L14.5 5L8 8L1.5 5z" />
      <path d="M1.5 8L8 11L14.5 8" />
      <path d="M1.5 11L8 14L14.5 11" />
    </g>
  ),
  chart: (
    <g stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 14V2M2 14h12" />
      <path d="M4.5 11l2.5-2.5 2 2 4-5" />
      <path d="M11.5 5.5h1.5V7" />
    </g>
  ),
  dollar: (
    <g stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round">
      <path d="M11 4.6c-1-.9-3.5-1.1-4.8 0-1.3 1.1 0 2.5 1.7 2.9 1.8.4 3.6 1 3.6 2.5 0 1.5-2 2.1-3.8 1.9-1.2-.1-2.2-.7-2.7-1.6" />
      <path d="M8 1.5v13" />
    </g>
  ),
  check: (
    <g stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 5L3 6.5 5.5 4" />
      <path d="M7.5 5h7" />
      <path d="M1.5 11L3 12.5 5.5 10" />
      <path d="M7.5 11h7" />
    </g>
  ),
};

export function Icon({
  name,
  size = 16,
}: {
  name: IconName;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
