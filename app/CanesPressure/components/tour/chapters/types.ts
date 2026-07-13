// Content contract for the onboarding tour. Chapters are plain data — the
// engine (tour-shell.tsx) renders them; nothing here touches the app.

export type TourStep = {
  id: string;
  title: string;
  /** Paragraphs split by blank lines; lines starting "- " render as bullets;
      double-asterisk spans render bold. A tiny grammar so content stays data. */
  body: string;
  /** Replaces body on <768px screens when the phone instructions differ. */
  mobileBody?: string;
  /** Gated route to show this step on; the engine navigates when it changes. */
  route?: string;
  /** Optional highlight target (best-effort; the step works if it never matches). */
  selector?: string;
  selectorMobile?: string;
  /** One-line "try it" nudge rendered as a callout. */
  tip?: string;
  /** Lifecycle hook fired once when the step is entered (practice sandbox). */
  onEnter?: "practice-seed" | "practice-cleanup";
};

export type TourChapter = {
  id: string;
  title: string;
  blurb: string;
  steps: TourStep[];
};
