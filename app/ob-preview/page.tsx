// TEMPORARY verification harness for the Obsidian shell. Outside /brain so the
// proxy auth matcher doesn't gate it. Delete after use.

import { Suspense } from "react";
import { BrainShell } from "@/components/brain/shell";
import { VaultMarkdown } from "@/components/brain/markdown";

const FILES = [
  { path: "00 - Start Here.md", title: "00 - Start Here" },
  { path: "01 - Urso/How I Work.md", title: "How I Work" },
  { path: "01 - Urso/The Audit Playbook.md", title: "The Audit Playbook" },
  { path: "01 - Urso/The Model.md", title: "The Model" },
  { path: "01 - Urso/The Operating System.md", title: "The Operating System" },
  { path: "01 - Urso/What Urso Is.md", title: "What Urso Is" },
  { path: "01 - Urso/Who We Serve.md", title: "Who We Serve" },
  { path: "01 - Urso/Documents/Urso PreMeeting.pdf", title: "Urso PreMeeting" },
  { path: "01 - Urso/Documents/Services Agreement.html", title: "Services Agreement" },
  { path: "02 - Woof Gang/Woof Gang Overview.md", title: "Woof Gang Overview" },
  { path: "02 - Woof Gang/The Pilot.md", title: "The Pilot" },
  { path: "02 - Woof Gang/The Stores.md", title: "The Stores" },
  { path: "02 - Woof Gang/Suspected Leaks.md", title: "Suspected Leaks" },
  { path: "02 - Woof Gang/Systems Designed.md", title: "Systems Designed" },
  { path: "02 - Woof Gang/Integrations/Integration — FranPOS.md", title: "Integration — FranPOS" },
  { path: "02 - Woof Gang/Integrations/Integration — QuickBooks.md", title: "Integration — QuickBooks" },
  { path: "02 - Woof Gang/Integrations/Integration — Twilio.md", title: "Integration — Twilio" },
  { path: "03 - Woof Gang — Product/Dashboard — Build Handoff.md", title: "Dashboard — Build Handoff" },
  { path: "03 - Woof Gang — Product/Manager Dashboard — Spec.md", title: "Manager Dashboard — Spec" },
  { path: "04 - 1500 Blueprint Drills/1500 — Start Here.md", title: "1500 — Start Here" },
  { path: "04 - 1500 Blueprint Drills/1500 — Product & Build.md", title: "1500 — Product & Build" },
  { path: "05 - Health Monitor One/Health Monitor One Overview.md", title: "Health Monitor One Overview" },
  { path: "06 - Canes Pressure Washing/Canes Pressure Washing Overview.md", title: "Canes Pressure Washing Overview" },
  { path: "06 - Canes Pressure Washing/Phase 1 Runbook.md", title: "Phase 1 Runbook" },
  { path: "06 - Canes Pressure Washing/Phase 1 — Test Plan.md", title: "Phase 1 — Test Plan" },
  { path: "07 - Urso Brain/Architecture — How the Brain Works.md", title: "Architecture — How the Brain Works" },
  { path: "07 - Urso Brain/Code Map — Files & Responsibilities.md", title: "Code Map — Files & Responsibilities" },
];

const DOC = `The product is a dashboard whose spine is the **first-click-to-final-sale** customer journey — six panels, each backed by a real data source, filterable per store, with cross-store comparison treated as a feature:

- **Findability** — search rank, listing health (Google Business Profile + rank tracking)
- **Capture** — calls per day, missed calls, after-hours misses (instrumented — data that doesn't exist yet)
- **Convert** — calls-to-bookings, web-to-bookings, online vs. phone split (POS + site analytics)
- **Retain** — repeat-visit cadence, win-back candidates, no-show rate (POS customer history)
- **Reputation** — review volume, rating trend, suspected fakes (Google Business Profile)
- **Money** — revenue and margin by store and service line (POS + QuickBooks)

Data sources: FranPOS (POS), QuickBooks Online, Google Business Profile APIs, Google Analytics 4, Search Console, a local rank tracker, and call tracking.

**Iron rule:** every metric is defined once and means the identical thing across all stores. Bad/inconsistent data is the worst failure — it blows credibility. Baseline first, fix second, always.

## How a panel gets built

1. Define the metric once, in writing
2. Point it at exactly one source of truth
3. Backfill history before showing a trend

> If a number can't be traced to a source, it doesn't ship.

See also: [[The Model]], [[Systems Designed]], and [[A Doc That Does Not Exist]].

| Panel | Source | Status |
| --- | --- | --- |
| Findability | GBP | live |
| Money | QuickBooks | live |
| Capture | Twilio | pending |
`;

export default function ObPreviewPage() {
  return (
    <div className="theme-scope">
      <Suspense>
      <BrainShell files={FILES}>
        <div className="ob-content">
          <div className="ob-note">
            <h1 className="ob-title">The Operating System</h1>
            <p className="mb-5 text-[15px] leading-[1.55] text-[var(--ob-muted)]">
              The six-panel spine of the product, and the rule that keeps it credible.
            </p>
            <VaultMarkdown content={DOC} targets={FILES} />
            <div className="ob-pane">
              <div className="ob-pane-head">3 linked mentions</div>
              <a className="ob-pane-link" href="#">The Model</a>
              <a className="ob-pane-link" href="#">Woof Gang Overview</a>
              <a className="ob-pane-link" href="#">Dashboard — Build Handoff</a>
            </div>
          </div>
        </div>
        <div className="ob-status">
          <span>24 backlinks</span>
          <span>160 words</span>
          <span>1,175 characters</span>
        </div>
      </BrainShell>
      </Suspense>
    </div>
  );
}
