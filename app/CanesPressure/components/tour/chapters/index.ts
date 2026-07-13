import type { TourChapter } from "./types";
import { WELCOME } from "./01-welcome";
import { INBOX } from "./02-inbox";
import { LEADS } from "./03-leads";
import { CUSTOMERS } from "./04-customers";
import { ESTIMATES } from "./05-estimates";
import { SCHEDULE } from "./06-schedule";
import { INVOICES } from "./07-invoices";
import { MONEY } from "./08-money";
import { WRAP } from "./09-wrap";

// Zero-to-hero order: two explainer chapters, then the guided PRACTICE run —
// a seeded fake lead he works through the real pipeline (lead → estimate →
// job → invoice → payment) — then Customers while Jamie's record is still
// live, the cleanup chapter, and the wrap. Practice seeding/cleanup ride the
// steps' onEnter hooks.
export const CHAPTERS: TourChapter[] = [
  WELCOME,
  INBOX,
  LEADS,
  ESTIMATES,
  SCHEDULE,
  INVOICES,
  CUSTOMERS,
  MONEY,
  WRAP,
];

export type { TourChapter, TourStep } from "./types";
