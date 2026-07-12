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

// Zero-to-hero order: the arc of the money path — a lead arrives, becomes an
// estimate, a job, an invoice, a payment — then the numbers and the controls.
export const CHAPTERS: TourChapter[] = [
  WELCOME,
  INBOX,
  LEADS,
  CUSTOMERS,
  ESTIMATES,
  SCHEDULE,
  INVOICES,
  MONEY,
  WRAP,
];

export type { TourChapter, TourStep } from "./types";
