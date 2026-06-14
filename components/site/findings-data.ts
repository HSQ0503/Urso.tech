export type Finding = {
  tag: string;
  title: string;
  hides: string;
  move: string;
  /** Also shown in the condensed home-page set. */
  home?: boolean;
};

export type FindingGroup = {
  label: string;
  findings: Finding[];
};

export const FINDING_GROUPS: FindingGroup[] = [
  {
    label: "Missed revenue",
    findings: [
      {
        tag: "Capture",
        title: "Calls that ring after close and never come back.",
        hides:
          "In a phone system nobody audits — the caller books elsewhere, and there's no record anyone called.",
        move: "Track every missed call, text back within minutes, count the recovered bookings in dollars.",
        home: true,
      },
      {
        tag: "Convert",
        title: "Booking friction nobody inside notices.",
        hides:
          "In plain sight — like a top location being the only one without a “book online” button on its own profile.",
        move: "Walk the customer's path from search to booked, from the outside in. Fix what blocks it within the week.",
      },
    ],
  },
  {
    label: "Customer behavior",
    findings: [
      {
        tag: "Retention",
        title: "Customers who should be back every six weeks — and quietly aren't.",
        hides:
          "In averages. Overall revenue looks fine while your best customers slip out the back.",
        move: "A win-back list ranked by customer value, worked weekly, measured in rebooked dollars.",
        home: true,
      },
      {
        tag: "Follow-up",
        title: "First-time customers who never get a reason to return.",
        hides:
          "Between systems — the POS knows it was a first visit; nobody acts on it.",
        move: "A first-visit follow-up that runs itself, and a number tracking who came back.",
      },
    ],
  },
  {
    label: "Team consistency",
    findings: [
      {
        tag: "Consistency",
        title: "One team member's clients come back at twice the rate of another's.",
        hides:
          "Behind “everyone has their own style.” Rebook rate by person tells the real story.",
        move: "Find what the best one does. Make it the standard. Watch the spread close.",
        home: true,
      },
      {
        tag: "Playbook",
        title: "Each location running its own version of the business.",
        hides:
          "In the gap between what the manual says and what each manager actually does.",
        move: "Compare locations on the same definitions, then standardize what the winner proves.",
      },
    ],
  },
  {
    label: "Product & service gaps",
    findings: [
      {
        tag: "Product",
        title: "A product selling hard at one location and sitting on the shelf at another.",
        hides: "In inventory reports nobody reads side by side.",
        move: "Rank the gap in dollars. Push what one store proves everywhere it isn't happening.",
        home: true,
      },
      {
        tag: "Mix",
        title: "High-margin services undersold because nobody's asked the data who wants them.",
        hides: "In the order history — buying patterns show who'd say yes.",
        move: "Put the right offer in front of the right customer at booking, and measure attach rate.",
      },
    ],
  },
  {
    label: "Scheduling & utilization",
    findings: [
      {
        tag: "Schedule",
        title: "Open slots at 2pm on Tuesdays — every Tuesday.",
        hides:
          "In a calendar that's “always been like that.” Empty capacity expires the moment it passes.",
        move: "Fill the valley with targeted offers instead of discounting the peak.",
        home: true,
      },
      {
        tag: "Labor",
        title: "Staffing that ignores the demand curve.",
        hides:
          "In schedules built from habit — overstaffed Mondays, slammed Saturdays.",
        move: "Match labor to the curve the data already shows. Margin moves within a month.",
      },
    ],
  },
  {
    label: "Data disconnects",
    findings: [
      {
        tag: "Spend",
        title: "Marketing judged on clicks while the POS knows what actually booked.",
        hides: "Between the ad account and the register — they've never met.",
        move: "Tie spend to booked revenue. Cut what doesn't convert. Double what does.",
      },
      {
        tag: "Inventory",
        title: "Ordering driven by habit instead of demand.",
        hides:
          "In the storeroom — cash sleeping on shelves next to stockouts of what sells.",
        move: "Order from the demand data. Free the cash. Stop the stockouts.",
      },
    ],
  },
  {
    label: "Decision bottlenecks",
    findings: [
      {
        tag: "Decision",
        title: "Reports that get exported, attached, and never acted on.",
        hides: "In the weekly routine — information moves, nothing else does.",
        move: "Every number ends in a decision: an action, an owner, a date.",
        home: true,
      },
      {
        tag: "Instinct",
        title: "Calls the owner keeps making from the gut when the data already knows.",
        hides:
          "In the gap between what the systems record and what reaches the person deciding.",
        move: "Put the answer where the decision happens — sized, current, and impossible to miss.",
      },
    ],
  },
];

export const HOME_FINDINGS: Finding[] = FINDING_GROUPS.flatMap((g) =>
  g.findings.filter((f) => f.home),
);
