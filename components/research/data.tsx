import type { ReactNode } from "react";

export type Tone = "blue" | "bright" | "bone" | "navy";

export type Report = {
  slug: string;
  eyebrow: string;
  title: string;
  deck: string;
  meta: string;
  date: string;
  tone: Tone;
  cover: ReactNode;
};

const Cover1 = (
  <svg viewBox="0 0 200 200" fill="none" aria-hidden="true" className="block h-full w-full">
    <circle cx="100" cy="100" r="86" stroke="rgba(255,255,255,0.16)" />
    <circle cx="100" cy="100" r="60" stroke="rgba(255,255,255,0.24)" />
    <circle cx="100" cy="100" r="34" stroke="rgba(255,255,255,0.5)" />
    <path d="M100 14v172M14 100h172" stroke="rgba(255,255,255,0.14)" />
    <circle cx="158" cy="64" r="6" fill="#fff" />
    <circle cx="158" cy="64" r="11" stroke="#fff" strokeOpacity="0.5" />
  </svg>
);

const Cover2 = (
  <svg viewBox="0 0 200 200" fill="none" aria-hidden="true" className="block h-full w-full">
    <rect x="28" y="38" width="68" height="84" rx="3" stroke="var(--urso-navy)" strokeWidth="1.2" />
    <rect x="104" y="78" width="68" height="84" rx="3" stroke="var(--urso-navy)" strokeWidth="1.2" fill="var(--urso-blue)" fillOpacity="0.08" />
    <path d="M96 70 C 120 60, 130 100, 108 110" stroke="var(--urso-blue)" strokeWidth="1.5" strokeDasharray="3 4" />
    <circle cx="62" cy="80" r="3" fill="var(--urso-navy)" />
    <path d="M44 100h36M44 112h28" stroke="var(--urso-navy)" strokeOpacity="0.45" />
    <path d="M120 120h36M120 132h28" stroke="var(--urso-navy)" strokeOpacity="0.45" />
  </svg>
);

const Cover3 = (
  <svg viewBox="0 0 200 200" fill="none" aria-hidden="true" className="block h-full w-full">
    <g stroke="rgba(255,255,255,0.55)" strokeWidth="1.3" fill="none">
      <path d="M16 132 Q56 56 100 110 T184 78" />
      <path d="M16 150 Q56 82 100 132 T184 102" opacity="0.55" />
      <path d="M16 168 Q56 108 100 154 T184 126" opacity="0.3" />
    </g>
    <circle cx="100" cy="110" r="5" fill="#fff" />
    <circle cx="100" cy="110" r="11" stroke="#fff" strokeOpacity="0.5" />
    <path d="M0 184h200" stroke="rgba(255,255,255,0.18)" />
  </svg>
);

const Cover4 = (
  <svg viewBox="0 0 200 200" fill="none" aria-hidden="true" className="block h-full w-full">
    <g stroke="rgba(255,255,255,0.22)">
      <path d="M0 56h200M0 100h200M0 144h200" />
      <path d="M50 16v172M100 16v172M150 16v172" />
    </g>
    <path d="M20 152 L60 132 L100 108 L140 82 L180 48" stroke="#fff" strokeWidth="2" fill="none" />
    <circle cx="180" cy="48" r="5" fill="#fff" />
    <circle cx="180" cy="48" r="11" stroke="#fff" strokeOpacity="0.5" />
    <path d="M20 152 L60 132 L100 108 L140 82 L180 48 L180 184 L20 184 Z" fill="rgba(255,255,255,0.08)" />
  </svg>
);

export const reports: Report[] = [
  {
    slug: "after-hours-leak",
    eyebrow: "Research report",
    title: "The hour your business loses the most money, and nobody is watching it.",
    deck: "After-hours calls are the silent leak in service businesses. We mapped what happens between the last staffed minute and the first one the next morning, and what changes when that hour gets a system.",
    meta: "6 min read",
    date: "May 20, 2026",
    tone: "blue",
    cover: Cover1,
  },
  {
    slug: "review-response-gap",
    eyebrow: "Perspective",
    title: "Why “someone should reply to that review” quietly becomes nobody’s job.",
    deck: "Most service businesses do not have a review problem. They have a review-ownership problem. A short read on why the responsibility evaporates, and the smallest system that puts it back.",
    meta: "5 min read",
    date: "May 20, 2026",
    tone: "bone",
    cover: Cover2,
  },
  {
    slug: "three-seconds",
    eyebrow: "Field note",
    title: "Three seconds: the unglamorous reason your location pages lose customers.",
    deck: "Most franchise location pages fail before they finish loading. We pulled the data on what slow pages actually cost in conversion, in mobile visits, and in “near me” searches.",
    meta: "7 min read",
    date: "May 20, 2026",
    tone: "navy",
    cover: Cover3,
  },
  {
    slug: "first-90-days",
    eyebrow: "Research report",
    title: "The honest math on automating a service business, and what the first 90 days actually return.",
    deck: "Most automation pitches lead with annualized ROI. We are more interested in the first ninety days: what gets installed, what does not, what breaks, and what payback looks like.",
    meta: "8 min read",
    date: "May 20, 2026",
    tone: "bright",
    cover: Cover4,
  },
];

export const reportBySlug = (slug: string) =>
  reports.find((r) => r.slug === slug);
