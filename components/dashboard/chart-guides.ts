// Per-chart "how to read this" content for the dashboard's info/legend popovers.
// Pure data (no JSX) so this module stays server-safe and importable anywhere.
// Rendered by <ChartInfo id="..." />. Voice is plain and second-person; describe
// what's observed, never promise recovered dollars (see vault: "How I Work").

export type GuideLegendItem = {
  color: string; // matches the series colour in the chart (hex or CSS var)
  label: string;
  note?: string;
  shape?: "square" | "line" | "dot";
};

export type ChartGuide = {
  summary: string; // what the graph shows
  read: string; // how to read it — axes and direction
  legend?: GuideLegendItem[];
  source?: string; // which feed fills it / honesty tag
};

const ORANGE = "#fe5100";
const SERIES = "var(--color-series)";
const SERIES_SOFT = "var(--color-series-soft)";
const TRACK = "var(--color-track)";

const FRANPOS = "FranPOS · measurable now";
const TWILIO = "Twilio · sample data until call tracking is live";
const GA4 = "Google Analytics · sample data until web tracking is live";
const GBP = "Google Business Profile · sample data until reviews are live";

export const CHART_GUIDES = {
  revenueTrend: {
    summary: "Total revenue over time, summed across whatever the store and month filters are set to.",
    read: "Left to right is time; the height of the line is dollars. Read the slope — a rising line means revenue is growing. Hover any point for that period's exact figure.",
    legend: [{ color: ORANGE, label: "Revenue", shape: "line" }],
    source: FRANPOS,
  },
  callsAnsweredMissed: {
    summary: "Inbound calls each period, split into the ones answered and the ones missed.",
    read: "Each bar is one period's total calls. The muted lower part is answered; the orange upper part is missed. More orange means more booking demand reaching no one.",
    legend: [
      { color: SERIES, label: "Answered" },
      { color: ORANGE, label: "Missed", note: "usually a booking that goes to a competitor" },
    ],
    source: TWILIO,
  },
  webTraffic: {
    summary: "Website visits set against how many of those visits turned into an online booking.",
    read: "The bars are visits (left axis); the line is bookings that resulted (right axis). The gap between the two is demand leaving the site without an appointment.",
    legend: [
      { color: SERIES, label: "Visits", shape: "square" },
      { color: ORANGE, label: "Became bookings", shape: "line" },
    ],
    source: GA4,
  },
  callsAnsweredGauge: {
    summary: "The share of inbound calls that reached someone, shown as a single rate.",
    read: "The dial fills from 0% to 100% and the centre shows the rate. Higher is better — it's the percent of callers you answered.",
    legend: [{ color: ORANGE, label: "Answered", note: "the filled portion of the dial" }],
    source: TWILIO,
  },
  callsByHour: {
    summary: "When calls arrive across the day, and when they go unanswered — hour by hour.",
    read: "The X axis is the hour, morning to night. Each bar splits answered from missed. The shaded band is after closing, when no one is at the desk — the clearest case for instant text-back.",
    legend: [
      { color: SERIES, label: "Answered" },
      { color: ORANGE, label: "Missed" },
      { color: "rgba(254,81,0,0.2)", label: "After hours", note: "store is closed" },
    ],
    source: TWILIO,
  },
  bookingFunnel: {
    summary: "The online booking journey from first visit to a booked appointment, stage by stage.",
    read: "Each bar is a stage; its width is how many people reach it. The percent below a bar is how many continued from the stage above. The widest drop — marked 'leak' in orange — is where the most bookings are lost.",
    legend: [
      { color: SERIES_SOFT, label: "Stage volume" },
      { color: "rgba(254,81,0,0.55)", label: "Leak stage", note: "the largest drop-off" },
    ],
    source: GA4,
  },
  crossSellMix: {
    summary: "How tickets divide across grooming, retail, or both on the same visit.",
    read: "The segments are shares of all tickets in the period and add to 100%. 'Both' means a grooming service and a retail item rang on the same ticket — the aim is moving 'grooming only' into 'both'.",
    legend: [
      { color: ORANGE, label: "Both" },
      { color: SERIES, label: "Grooming only" },
      { color: SERIES_SOFT, label: "Retail only" },
    ],
    source: FRANPOS,
  },
  revenueByLocation: {
    summary: "Revenue handled by each of the four stores, ranked highest to lowest.",
    read: "Each bar is one store; longer is more revenue. The highlighted bar is the store your filter is on. Revenue is defined the same way across all four, so the comparison is fair.",
    legend: [
      { color: TRACK, label: "Store" },
      { color: ORANGE, label: "Selected store", note: "set by the store filter" },
    ],
    source: FRANPOS,
  },
  newVsRepeat: {
    summary: "How much revenue comes from repeat customers versus first-time ones.",
    read: "The bar is 100% of revenue, split by customer type. 'New' means the customer's first visit in our recorded history (from January 2024); 'Walk-in' is revenue rung on the store's house account with no customer profile attached. A larger repeat share means a stickier base — grooming is recurring, so repeat revenue is the durable kind.",
    legend: [
      { color: ORANGE, label: "Repeat customers" },
      { color: SERIES, label: "New customers" },
      { color: SERIES_SOFT, label: "Walk-in (no profile)" },
    ],
    source: FRANPOS,
  },
  revenueByGroomer: {
    summary: "Service revenue performed by each groomer, ranked highest to lowest — grooming lines only, attributed to the FranPOS salesperson on each line.",
    read: "Each bar is one groomer; longer is more service revenue from their chair. Retail sales and front-desk, vendor, and system accounts are excluded. Read it as workload and contribution, not a verdict — pair it with rebooking and attach.",
    legend: [{ color: TRACK, label: "Groomer" }],
    source: FRANPOS,
  },
  storeRankRebook: {
    summary: "Return rate by store — of grooming visits rung with a customer profile, the share made by customers returning within 90 days of their previous visit.",
    read: "Each bar is one store; longer means more visits come from regulars on cadence. Rebooking at checkout is the cheapest way to push this up, and leaders here defend recurring revenue best.",
    legend: [
      { color: TRACK, label: "Store" },
      { color: ORANGE, label: "Selected store" },
    ],
    source: FRANPOS,
  },
  storeRankMissed: {
    summary: "Missed-call rate by store — the share of inbound calls that went unanswered.",
    read: "Each bar is one store, but here longer is worse — more booking demand lost. The newer stores tend to trail on this.",
    legend: [
      { color: TRACK, label: "Store" },
      { color: ORANGE, label: "Selected store" },
    ],
    source: TWILIO,
  },
  storeRankAttach: {
    summary: "Retail attach by store — the share of grooming visits that also bought a retail item.",
    read: "Each bar is one store; longer means more grooming customers leave with product in hand. It's the simplest add-on revenue, so leaders here monetise visits they already have.",
    legend: [
      { color: TRACK, label: "Store" },
      { color: ORANGE, label: "Selected store" },
    ],
    source: FRANPOS,
  },
  compareTable: {
    summary: "Side-by-side performance for any two periods you choose.",
    read: "Each pair of bars is one store, groomer, or item. The orange bar is the focus period; the grey bar is the period it's compared against. 'Change' is (now − before) ÷ before — or percentage points for rate metrics. 'New' means it sold in the focus period but not in the comparison period.",
    legend: [
      { color: ORANGE, label: "This period" },
      { color: SERIES, label: "Compared against" },
    ],
    source: FRANPOS,
  },
  comparePace: {
    summary: "Both periods overlaid day by day as a running revenue total.",
    read: "The X axis is the day number within each period; each line adds up revenue as the period progresses. Orange above the dashed line means this period is ahead of the comparison at the same point — a gap that widens late often means a strong final week, not a strong month.",
    legend: [
      { color: ORANGE, label: "This period" },
      { color: SERIES, label: "Compared against" },
    ],
    source: FRANPOS,
  },
  compareDiverging: {
    summary: "What moved between the two periods — gainers right, decliners left.",
    read: "Each bar is the change for one item: green bars to the right sold more than in the comparison period, orange bars to the left sold less. Sorted biggest gain to biggest drop, so the top and bottom of the chart are the story.",
    legend: [
      { color: "var(--color-good)", label: "Gained" },
      { color: ORANGE, label: "Declined" },
    ],
    source: FRANPOS,
  },
  managerRank: {
    summary: "Where your store stands against the other three on this metric.",
    read: "Each bar is a store and yours is highlighted; the caption shows your rank and the gap to the leader. It's a relative-standing view only — never another store's customers or revenue.",
    legend: [
      { color: TRACK, label: "Other stores" },
      { color: ORANGE, label: "Your store" },
    ],
    source: "Same metric definition across all four stores",
  },
  returningVsNew: {
    summary: "The share of customers who came back after their first visit.",
    read: "The ring is 100% of customers who have had at least 90 days since their first visit — enough time for a return to be possible. A larger returning slice means more of the base actually comes back.",
    legend: [
      { color: ORANGE, label: "Returning" },
      { color: SERIES, label: "New" },
    ],
    source: FRANPOS,
  },
  groomingCycle: {
    summary: "How many days pass between a customer's grooming visits.",
    read: "Each bar is the share of all return gaps — the time between one groom and that customer's next. The peak is your natural cycle. Retail-only visits don't reset the clock, and anonymous walk-in tickets aren't counted. A 'recurring customer' holds a median cycle of 60 days or less.",
    legend: [{ color: ORANGE, label: "Share of return gaps" }],
    source: FRANPOS,
  },
  cohortRetention: {
    summary: "Of the customers who started in a given month, how many are still active as time passes.",
    read: "The X axis is months since a customer's first visit; the Y axis is the percent whose visits continued at least that long. Only genuinely new customers count (first seen after the first 90 days of our history, so pre-existing regulars don't pollute the curve). A flatter decline means more durable revenue.",
    legend: [{ color: ORANGE, label: "Still active", shape: "line" }],
    source: "FranPOS order history, January 2024 onward",
  },
  returnRateTrend: {
    summary: "The share of grooming visits that are 90-day returns, month by month over the trailing year.",
    read: "Each point is one month; the Y axis is the percent of identified grooming visits where the customer's previous service visit was within the prior 90 days. Anonymous walk-in tickets are excluded from the denominator — they can never register a return. A stable or rising line means the base keeps coming back; a slide is the earliest retention warning you'll get.",
    legend: [{ color: ORANGE, label: "Return rate", shape: "line" }],
    source: FRANPOS,
  },
  ratingDistribution: {
    summary: "How this store's reviews break down across one to five stars.",
    read: "Each row is a star level and the bar is how many reviews sit there. A healthy profile is heavy on 4–5★ with few 1–2★. A cluster of 1★ with no matching customer is a sign of fakes.",
    legend: [
      { color: SERIES, label: "4–5★", note: "healthy" },
      { color: ORANGE, label: "1–3★", note: "watch for fakes" },
    ],
    source: GBP,
  },
  productivityRank: {
    summary: "Groomers ranked by service revenue for the selected period — grooming lines only, attributed by FranPOS salesperson.",
    read: "Each bar is one groomer; longer is more service revenue from their chair in this period. It's a coaching lens, not a leaderboard — read it next to return rate and attach, never on its own. Revenue per labour hour replaces this ranking once labour-hours data is available.",
    legend: [{ color: TRACK, label: "Groomer" }],
    source: FRANPOS,
  },
} satisfies Record<string, ChartGuide>;

export type GuideId = keyof typeof CHART_GUIDES;
