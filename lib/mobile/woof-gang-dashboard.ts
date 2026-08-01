import {
  PRODUCT_PAGE_SIZE,
  parseCompareMetric,
  parseCompareMode,
  parseComparePreset,
  parseProductSort,
  parseSortDir,
  scopeLabel,
  type MonthValue,
  type Scope,
} from "@/components/dashboard/data";
import {
  getAllAgentActions,
  getBusinessEvents,
  getCallStats,
  getCallsHourly,
  getCompareData,
  getCompareOverview,
  getConsolidatedPnl,
  getCostBenchmark,
  getCostBreakdown,
  getCrossSell,
  getCustomerIntel,
  getCustomerSegments,
  getCustomersByValue,
  getFunnel,
  getKpiDeltas,
  getMarginTrend,
  getMetrics,
  getMoneyOverview,
  getOwnerRevenue,
  getProductCatalog,
  getProfitDeltas,
  getProfitPerBooking,
  getProfitWaterfall,
  getRevenueByGroomer,
  getRevenueByLocation,
  getRevenueByService,
  getRevenueNewVsRepeat,
  getRetention,
  getReturnRateTrend,
  getReviewsData,
  getSeries,
  getServiceLineMargin,
  getStoreScores,
  getTeamRoster,
  getWebStats,
  getWeeklyBrief,
  getWinbackList,
  getBreakeven,
  resolveCompareRanges,
  storeComparison,
} from "@/components/dashboard/data.server";
import type { WgMobileActor } from "@/lib/mobile/woof-gang";
import type {
  WgDashboardSection,
  WgMobileMetric,
  WgMobileSectionBlock,
  WgMobileSectionData,
  WgTone,
  WgValueFormat,
} from "@urso/types";

export type WgSectionParams = {
  query?: string;
  sort?: string;
  direction?: string;
  page?: string;
  compareMode?: string;
  comparePreset?: string;
  compareMetric?: string;
  compareA?: string;
  compareB?: string;
};

const SECTION_TITLES: Record<WgDashboardSection, { title: string; eyebrow: string; ownerOnly: boolean }> = {
  brief: { title: "The week in one page", eyebrow: "Urso · Weekly operating brief", ownerOnly: true },
  performance: { title: "Performance", eyebrow: "Diagnostics", ownerOnly: true },
  revenue: { title: "Where the money comes from", eyebrow: "Revenue map", ownerOnly: true },
  money: { title: "Profit & margins", eyebrow: "Money · QuickBooks", ownerOnly: true },
  compare: { title: "Compare anything", eyebrow: "Period comparison", ownerOnly: true },
  customers: { title: "Customer retention", eyebrow: "Customers", ownerOnly: true },
  products: { title: "Products", eyebrow: "Catalog · sold in period", ownerOnly: true },
  actions: { title: "What the agents recommend", eyebrow: "urso.ai · action center", ownerOnly: true },
  events: { title: "Events", eyebrow: "Context log", ownerOnly: false },
  stores: { title: "Store comparison", eyebrow: "All locations", ownerOnly: true },
  team: { title: "Team performance", eyebrow: "Groomers", ownerOnly: true },
  reviews: { title: "Reviews & reputation", eyebrow: "Customer voice", ownerOnly: true },
};

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const integer = (value: number) => Math.round(value).toLocaleString("en-US");
const percent = (value: number) => `${(value * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
const decimal = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });

function display(value: number | null, format: WgValueFormat): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (format === "money") return money(value);
  if (format === "percent") return percent(value);
  if (format === "number") return integer(value);
  return decimal(value);
}

function metric(label: string, value: number | null, format: WgValueFormat, options: { detail?: string; delta?: number | null; tone?: WgTone } = {}): WgMobileMetric {
  return { label, value, display: display(value, format), format, ...options };
}

function table(id: string, title: string, columns: string[], rows: Array<{ id: string; cells: string[]; detail?: string; tone?: WgTone }>, detail?: string): WgMobileSectionBlock {
  return { id, type: "table", title, columns, rows, detail };
}

function bars(id: string, title: string, format: WgValueFormat, rows: Array<{ id: string; label: string; value: number; detail?: string; tone?: WgTone }>, detail?: string): WgMobileSectionBlock {
  return {
    id,
    type: "bars",
    title,
    format,
    detail,
    rows: rows.map((row) => ({ ...row, display: display(row.value, format) })),
  };
}

function periodLabel(month: MonthValue): string {
  if (month === "all") return "Last 12 months";
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

async function performance(scope: Scope, month: MonthValue): Promise<WgMobileSectionBlock[]> {
  const [metrics, deltas, revenue, calls, hourly, web, series, funnel, crossSell] = await Promise.all([
    getMetrics(scope, month),
    getKpiDeltas(scope, month),
    getOwnerRevenue(scope, month),
    getCallStats(scope, month),
    getCallsHourly(scope, month),
    getWebStats(scope, month),
    getSeries(scope, month),
    getFunnel(scope, month),
    getCrossSell(scope, month),
  ]);
  const blocks: WgMobileSectionBlock[] = [
    { id: "performance-kpis", type: "metrics", items: [
      metric("Revenue", revenue.total, "money", { delta: revenue.source === "books" ? revenue.delta : deltas.revenue }),
      metric("Bookings", metrics.bookings, "number", { delta: deltas.bookings }),
      metric("Avg visit", metrics.avgTicket, "money", { delta: deltas.avgTicket }),
      metric("Return rate", metrics.rebook, "percent", { delta: deltas.rebook }),
      metric("Retail attach", metrics.attach, "percent", { delta: deltas.attach }),
      metric("Grooming share", metrics.groomingShare, "percent", { delta: deltas.groomingShare }),
    ] },
    { id: "revenue-trend", type: "line", title: "Revenue", labels: series.labels, series: [{ name: "Revenue", values: series.revenue, format: "money", tone: "accent" }] },
  ];
  if (calls.total > 0) {
    blocks.push(
      { id: "calls", type: "line", title: "Answered vs missed calls", labels: series.labels, series: [
        { name: "Answered", values: series.callsTotal.map((value, index) => value - (series.callsMissed[index] ?? 0)), format: "number", tone: "muted" },
        { name: "Missed", values: series.callsMissed, format: "number", tone: "accent" },
      ] },
      { id: "call-rate", type: "metrics", title: "Call capture", items: [metric("Answered", calls.total - calls.missed, "number"), metric("Missed", calls.missed, "number", { tone: calls.missedPct > 0.05 ? "accent" : "good" }), metric("Answer rate", calls.answeredPct, "percent")] },
      { id: "calls-hourly", type: "line", title: "Calls by hour", detail: `Open hours ${hourly.startHour}:00–${hourly.closeHour}:00`, labels: hourly.hourly.map((_, index) => `${(hourly.startHour + index) % 24}:00`), series: [
        { name: "Calls", values: hourly.hourly, format: "number", tone: "muted" },
        { name: "Missed", values: hourly.missedHourly, format: "number", tone: "accent" },
      ] },
    );
  } else {
    blocks.push({ id: "calls-pending", type: "narrative", title: "Call tracking goes live with Twilio", body: "Answered, missed, and hour-by-hour call patterns will appear here after tracking is connected.", tone: "muted" });
  }
  if (web.visits > 0) {
    blocks.push(
      { id: "booking-funnel", type: "funnel", title: "Online booking funnel", steps: funnel.map((step) => ({ label: step.stage, value: step.value, display: integer(step.value), tone: step.leak ? "accent" : "plain" })) },
      { id: "web-traffic", type: "line", title: "Website traffic vs bookings", labels: series.labels, series: [{ name: "Visits", values: series.webVisits, format: "number", tone: "muted" }, { name: "Bookings", values: series.webBookings, format: "number", tone: "accent" }] },
    );
  } else {
    blocks.push({ id: "web-pending", type: "narrative", title: "Website analytics connect next", body: "Visits, booking starts, completions, and funnel leakage will appear here once analytics is linked.", tone: "muted" });
  }
  blocks.push({ id: "cross-sell", type: "segments", title: "Grooming & retail mix", items: [
    { label: "Both", value: crossSell.both, display: percent(crossSell.both), tone: "accent" },
    { label: "Grooming only", value: crossSell.groomingOnly, display: percent(crossSell.groomingOnly), tone: "muted" },
    { label: "Retail only", value: crossSell.retailOnly, display: percent(crossSell.retailOnly), tone: "plain" },
  ] });
  return blocks;
}

async function revenue(scope: Scope, month: MonthValue): Promise<WgMobileSectionBlock[]> {
  const [metrics, ownerRevenue, crossSell, locations, services, groomers, customerRevenue] = await Promise.all([
    getMetrics(scope, month), getOwnerRevenue(scope, month), getCrossSell(scope, month), getRevenueByLocation(month),
    getRevenueByService(scope, month), getRevenueByGroomer(scope, month), getRevenueNewVsRepeat(scope, month),
  ]);
  const identifiedRevenue = customerRevenue.repeat + customerRevenue.fresh;
  return [
    { id: "revenue-kpis", type: "metrics", items: [
      metric("Total revenue", ownerRevenue.total, "money"),
      metric("Avg visit", metrics.avgTicket, "money"),
      metric("Buy both", crossSell.both, "percent"),
      metric("Repeat revenue", identifiedRevenue ? customerRevenue.repeat / identifiedRevenue : 0, "percent"),
    ] },
    ...(ownerRevenue.source === "register" ? [] : [{ id: "books-basis", type: "narrative" as const, title: "How the total adds up", body: `Sales ${money(ownerRevenue.sales)} · Tips ${money(ownerRevenue.tips)} · Other income ${money(ownerRevenue.otherIncome)}${ownerRevenue.openRegister > 0 ? ` · Open register ${money(ownerRevenue.openRegister)}` : ""}. Register sales for the same period: ${money(ownerRevenue.registerSales)}.` }]),
    bars("location-revenue", "Revenue by store", "money", locations.map((row, index) => ({ id: row.id, label: row.name, value: row.value, tone: index === 0 ? "accent" : "plain" }))),
    bars("service-revenue", "Top grooming & retail lines", "money", services.map((row, index) => ({ id: `${row.line}-${index}`, label: row.name, value: row.value, detail: row.line, tone: row.line === "Grooming" ? "accent" : "plain" }))),
    { id: "cross-sell-mix", type: "segments", title: "Grooming vs retail", items: [
      { label: "Both", value: crossSell.both, display: percent(crossSell.both), tone: "accent" },
      { label: "Grooming only", value: crossSell.groomingOnly, display: percent(crossSell.groomingOnly), tone: "muted" },
      { label: "Retail only", value: crossSell.retailOnly, display: percent(crossSell.retailOnly), tone: "plain" },
    ] },
    { id: "customer-revenue", type: "segments", title: "Revenue from new vs repeat", items: [
      { label: "Repeat", value: customerRevenue.repeat, display: money(customerRevenue.repeat), tone: "accent" },
      { label: "New", value: customerRevenue.fresh, display: money(customerRevenue.fresh), tone: "muted" },
      { label: "Walk-in", value: customerRevenue.walkIn, display: money(customerRevenue.walkIn), tone: "plain" },
    ] },
    bars("groomer-revenue", "Top groomers by service revenue", "money", groomers.slice(0, 12).map((row, index) => ({ id: `${row.store}-${row.name}`, label: row.name, value: row.value, detail: row.store, tone: index === 0 ? "accent" : "plain" }))),
  ];
}

async function moneySection(scope: Scope, month: MonthValue): Promise<WgMobileSectionBlock[]> {
  const [overview, deltas, waterfall, costs, trend, benchmark, consolidated, perUnit, serviceMargins, breakeven] = await Promise.all([
    getMoneyOverview(scope, month), getProfitDeltas(scope, month), getProfitWaterfall(scope, month), getCostBreakdown(scope, month),
    getMarginTrend(scope), getCostBenchmark(month), getConsolidatedPnl(month), getProfitPerBooking(scope, month), getServiceLineMargin(scope, month), getBreakeven(scope, month),
  ]);
  if (overview.revenue === 0 && overview.expenses === 0) return [{ id: "no-books", type: "narrative", title: "No QuickBooks data for this period", body: "The books close monthly. Choose a closed month or the last 12 months.", tone: "warning" }];
  return [
    { id: "money-kpis", type: "metrics", items: [
      metric("Revenue", overview.revenue, "money", { delta: deltas.revenue }), metric("Gross margin", overview.grossMargin, "percent"),
      metric("Net profit", overview.netIncome, "money", { delta: deltas.netIncome, tone: overview.netIncome >= 0 ? "good" : "bad" }),
      metric("Net margin", overview.netMargin, "percent", { detail: deltas.netMargin === null ? undefined : `${deltas.netMargin >= 0 ? "+" : ""}${(deltas.netMargin * 100).toFixed(1)} pts` }),
      metric("Labor ratio", overview.laborRatio, "percent", { detail: "payroll ÷ revenue" }), metric("Profit / groom", perUnit.netPerBooking, "money", { detail: "net ÷ bookings" }),
    ] },
    { id: "margin-trend", type: "line", title: "Revenue, profit & margin over time", labels: trend.labels, series: [
      { name: "Revenue", values: trend.revenue, format: "money", tone: "accent" },
      { name: "Gross margin", values: trend.grossMargin, format: "percent", tone: "muted" },
      { name: "Net margin", values: trend.netMargin, format: "percent", tone: "good" },
    ] },
    bars("waterfall", "Revenue to net profit", "money", waterfall.map((row, index) => ({ id: `${row.label}-${index}`, label: row.label, value: row.amount, detail: row.kind, tone: row.kind === "subtract" ? "bad" : row.label === "Net profit" ? (row.amount >= 0 ? "good" : "bad") : "accent" }))),
    bars("costs", "Cost as % of revenue", "percent", costs.map((row) => ({ id: row.category, label: row.category, value: row.pctOfRevenue, detail: money(row.amount) }))),
    table("cost-benchmark", "Cross-store cost benchmark", ["Store", "Gross", "Net", "Labor", "Rent"], benchmark.map((row) => ({ id: row.id, cells: [row.name, percent(row.grossMargin), percent(row.netMargin), percent(row.laborPct), percent(row.rentPct)], tone: row.netMargin >= 0 ? "plain" : "bad" }))),
    table("service-margin", "Gross margin by service line", ["Line", "Revenue", "COGS", "Gross profit", "Margin"], serviceMargins.map((row) => ({ id: row.line, cells: [row.line, money(row.revenue), money(row.cogs), money(row.grossProfit), percent(row.marginPct)] }))),
    { id: "breakeven", type: "metrics", title: "Break-even", items: [metric("Monthly revenue", breakeven.monthlyRevenue, "money"), metric("Break-even revenue", breakeven.breakevenRevenue, "money"), metric("Cushion", breakeven.surplus, "money", { tone: breakeven.surplus >= 0 ? "good" : "bad" }), metric("Contribution margin", breakeven.contributionMargin, "percent")] },
    table("owner-pnl", "Consolidated owner P&L", ["Store", "Revenue", "Net profit", "Net margin"], consolidated.perStore.map((row) => ({ id: row.id, cells: [row.name, money(row.revenue), money(row.netIncome), percent(row.netMargin)] })), `Unallocated company costs: ${money(consolidated.unallocated)}`),
  ];
}

async function customers(scope: Scope, month: MonthValue): Promise<WgMobileSectionBlock[]> {
  const [metrics, crossSell, segments, topCustomers, intel, retention, winback, deltas, trend] = await Promise.all([
    getMetrics(scope, month), getCrossSell(scope, month), getCustomerSegments(scope), getCustomersByValue(scope), getCustomerIntel(scope),
    getRetention(scope, month), getWinbackList(scope), getKpiDeltas(scope, month), getReturnRateTrend(scope),
  ]);
  const blocks: WgMobileSectionBlock[] = [
    { id: "retention-kpis", type: "metrics", items: [
      metric("Returning", retention.returningPct, "percent"), metric("Return rate", metrics.rebook, "percent", { delta: deltas.rebook }),
      metric("Grooming cycle", retention.cycle.medianDays, "number", { detail: "median days" }), metric("Single-visit", retention.oneAndDone, "number", { tone: "accent" }),
      metric("Avg LTV", intel.avgLtv, "money"), metric("Win-back pool", winback.count, "number", { tone: "accent" }),
    ] },
  ];
  if (trend) blocks.push({ id: "return-trend", type: "line", title: "Return rate · trailing year", labels: trend.map((row) => row.label), series: [{ name: "Return rate", values: trend.map((row) => row.value / 100), format: "percent", tone: "accent" }] });
  blocks.push(
    { id: "new-returning", type: "segments", title: "New vs returning", items: [{ label: "Returning", value: retention.returningPct, display: percent(retention.returningPct), tone: "accent" }, { label: "New", value: retention.newPct, display: percent(retention.newPct), tone: "muted" }] },
    { id: "cohort", type: "line", title: "Cohort retention", detail: "Share still active by months since first visit", labels: retention.cohort.map((_, index) => `M${index}`), series: [{ name: "Active", values: retention.cohort.map((value) => value / 100), format: "percent", tone: "accent" }] },
    { id: "cross-sell", type: "segments", title: "Retail & grooming overlap", items: [{ label: "Both", value: crossSell.both, display: percent(crossSell.both), tone: "accent" }, { label: "Grooming only", value: crossSell.groomingOnly, display: percent(crossSell.groomingOnly), tone: "muted" }, { label: "Retail only", value: crossSell.retailOnly, display: percent(crossSell.retailOnly), tone: "plain" }] },
    bars("cycle", "Grooming cycle", "percent", retention.cycle.histogram.map((row) => ({ id: row.label, label: row.label, value: row.value })), `${integer(retention.cycle.gapCount)} return visits measured`),
    { id: "segments", type: "metrics", title: "Customer segments", items: segments.filter((row) => row.segment !== "Dormant" || row.count > 0).map((row) => metric(row.segment, row.count, "number", { tone: row.segment === "At risk" || row.segment === "Lapsed" ? "accent" : "plain" })) },
    table("top-customers", "Top customers by lifetime value", ["Customer", "Store", "Visits", "LTV", "Segment"], topCustomers.map((row, index) => ({ id: `${row.storeId}-${row.name}-${index}`, cells: [row.name, row.store, integer(row.visits), money(row.ltv), row.segment], detail: `${row.pet} · ${row.lastVisit} days since visit` }))),
    table("winback", "Win-back list", ["Customer", "Store", "Last visit", "Visits", "LTV"], winback.list.slice(0, 60).map((row, index) => ({ id: `${row.store}-${row.name}-${index}`, cells: [row.name, row.store, row.last, integer(row.visits), money(row.ltv)], detail: row.segment, tone: "accent" }))),
  );
  return blocks;
}

async function products(scope: Scope, month: MonthValue, params: WgSectionParams): Promise<{ blocks: WgMobileSectionBlock[]; controls: WgMobileSectionData["controls"] }> {
  const sort = parseProductSort(params.sort);
  const direction = parseSortDir(params.direction, sort);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const query = params.query?.trim() ?? "";
  const catalog = await getProductCatalog(scope, month, { q: query, sort, dir: direction, page });
  if (!catalog) return { blocks: [{ id: "catalog-unavailable", type: "narrative", title: "Product catalog unavailable", body: "The product catalog query is not available in this database yet.", tone: "warning" }], controls: { query, sort, direction, page: 1, pages: 1, total: 0 } };
  const pages = Math.max(1, Math.ceil(catalog.total / PRODUCT_PAGE_SIZE));
  return {
    blocks: [table("catalog", "Catalog · sold in period", ["Product", "Revenue", "Units", "Avg price", "Margin", "Stores"], catalog.rows.map((row) => ({ id: row.key, cells: [row.name, money(row.revenue), integer(row.units), row.avgPrice === null ? "—" : money(row.avgPrice), row.margin === null ? "—" : percent(row.margin), integer(row.stores)], detail: row.line, tone: row.line === "Grooming" ? "accent" : "plain" })))],
    controls: { query, sort, direction, page, pages, total: catalog.total },
  };
}

async function storesSection(month: MonthValue): Promise<WgMobileSectionBlock[]> {
  const [comparison, scores] = await Promise.all([storeComparison(month), getStoreScores(month)]);
  const rows = Object.entries(comparison);
  return [
    bars("scoreboard", "Store scoreboard", "number", scores.map((row) => ({ id: row.id, label: row.name, value: row.score, detail: `Rank #${row.rank}`, tone: row.rank === 1 ? "accent" : "plain" }))),
    table("store-table", "Location comparison", ["Location", "Revenue", "Bookings", "Avg visit", "Return", "Attach"], rows.map(([id, row]) => ({ id, cells: [scopeLabel(id as Scope), money(row.revenue), integer(row.bookings), money(row.avgTicket), percent(row.rebook), percent(row.attach)] }))),
    bars("store-revenue", "Revenue by location", "money", rows.sort((a, b) => b[1].revenue - a[1].revenue).map(([id, row], index) => ({ id, label: scopeLabel(id as Scope), value: row.revenue, tone: index === 0 ? "accent" : "plain" }))),
    bars("store-return", "Return rate by location", "percent", rows.sort((a, b) => b[1].rebook - a[1].rebook).map(([id, row]) => ({ id, label: scopeLabel(id as Scope), value: row.rebook }))),
    bars("store-attach", "Retail attach by location", "percent", rows.sort((a, b) => b[1].attach - a[1].attach).map(([id, row]) => ({ id, label: scopeLabel(id as Scope), value: row.attach, tone: row.attach < 0.15 ? "accent" : "plain" }))),
  ];
}

async function team(scope: Scope, month: MonthValue): Promise<WgMobileSectionBlock[]> {
  const roster = await getTeamRoster(scope, month);
  return [
    { id: "team-kpis", type: "metrics", items: [metric("Team revenue", roster.reduce((sum, row) => sum + row.revenue, 0), "money"), metric("Appointments", roster.reduce((sum, row) => sum + row.appts, 0), "number"), metric("Groomers", roster.length, "number"), metric("Store retained", roster.reduce((sum, row) => sum + row.storeRetained, 0), "money")] },
    bars("team-revenue", "Service revenue by groomer", "money", roster.map((row, index) => ({ id: row.id, label: row.name, value: row.revenue, detail: row.store, tone: index === 0 ? "accent" : row.flag === "coach" ? "warning" : "plain" }))),
    table("team-table", "Team scorecard", ["Groomer", "Revenue", "Appts", "Avg visit", "Return", "Attach"], roster.map((row) => ({ id: row.id, cells: [row.name, money(row.revenue), integer(row.appts), money(row.avgTicket), row.rebook === null ? "—" : percent(row.rebook), row.attach === null ? "—" : percent(row.attach)], detail: `${row.store} · ${percent(row.commissionRate)} commission`, tone: row.flag === "coach" ? "warning" : row.flag === "star" ? "good" : "plain" }))),
  ];
}

async function reviews(): Promise<WgMobileSectionBlock[]> {
  const data = await getReviewsData();
  const reviewRows = Object.entries(data.byStore).flatMap(([store, rows]) => rows.map((row, index) => ({ id: `${store}-${row.author}-${index}`, cells: [row.author, store, `${row.rating.toFixed(1)} ★`, `${row.days}d ago`], detail: row.text, tone: row.flagged ? "warning" as const : row.rating <= 3 ? "bad" as const : "plain" as const })));
  return [
    { id: "review-kpis", type: "metrics", items: [metric("Suspected fakes", data.suspectedFakes, "number", { tone: data.suspectedFakes > 0 ? "warning" : "plain" }), metric("Unanswered low ratings", data.unanswered, "number", { tone: data.unanswered > 0 ? "accent" : "good" })] },
    table("reputation", "Reputation by location", ["Store", "Rating", "Reviews", "Response", "Response time"], data.reputation.map((row) => ({ id: row.store, cells: [row.store, row.rating.toFixed(1), integer(row.volume), percent(row.responseRate), `${decimal(row.responseHrs)}h`] }))),
    table("findability", "Local findability", ["Store", "Local rank", "Listing", "Book button"], data.findability.map((row) => ({ id: row.store, cells: [row.store, `#${row.rank}`, percent(row.listing), row.bookButton ? "Live" : "Missing"], tone: row.bookButton ? "plain" : "accent" }))),
    table("reviews", "Recent reviews", ["Author", "Store", "Rating", "Age"], reviewRows.slice(0, 100)),
  ];
}

async function brief(scope: Scope): Promise<WgMobileSectionBlock[]> {
  const value = await getWeeklyBrief(scope);
  return [{ id: "weekly-brief", type: "brief", headline: value.headline, changes: value.changes.map((change) => ({ label: change.label, value: null, display: change.value, format: "text", delta: change.delta, tone: change.good ? "good" : "bad" })), wins: value.wins, risks: value.risks, opportunity: value.opportunity, recommendation: value.recommendation, actionsCompleted: value.actionsCompleted, actionsOpen: value.actionsOpen }];
}

async function actions(scope: Scope): Promise<WgMobileSectionBlock[]> {
  const all = await getAllAgentActions();
  const allowed = scope === "all" ? all : all.filter((action) => action.store === "All stores" || action.store === scopeLabel(scope));
  return [{ id: "actions", type: "actions", title: "AI suggested actions", items: allowed.map((action) => ({ id: action.id, title: action.title, store: action.store, agent: action.agent, detail: action.detail, metric: action.metric, status: action.status, result: action.result, pending: action.pending })) }];
}

async function events(scope: Scope, actor: WgMobileActor): Promise<WgMobileSectionBlock[]> {
  const rows = await getBusinessEvents(scope);
  return [{ id: "events", type: "events", title: "Business context", canEdit: actor.role !== "urso_admin", managerStoreId: actor.role === "manager" ? actor.storeId : null, items: rows.map((row) => ({ id: row.id, store: row.store, storeId: row.storeId, eventType: row.type, title: row.title, detail: row.detail, start: row.start, end: row.end, createdBy: row.createdBy })) }];
}

async function compare(scope: Scope, params: WgSectionParams): Promise<{ blocks: WgMobileSectionBlock[]; controls: WgMobileSectionData["controls"] }> {
  const mode = parseCompareMode(params.compareMode);
  const preset = parseComparePreset(params.comparePreset);
  const metricKey = parseCompareMetric(mode, params.compareMetric);
  const { a, bs, warnings } = resolveCompareRanges(preset, params.compareA, params.compareB);
  const controls = { compareMode: mode, comparePreset: preset, compareMetric: metricKey, compareA: params.compareA, compareB: params.compareB };
  if (metricKey === "all") {
    const overview = await getCompareOverview(mode, a, bs, scope);
    return { controls, blocks: [
      { id: "compare-periods", type: "narrative", title: `${a.start} → ${a.end}`, body: `Compared with ${bs.map((range) => `${range.start} → ${range.end}`).join(" · ")}`, items: warnings, tone: warnings.length ? "warning" : "muted" },
      ...overview.metrics.map((row) => ({ id: `compare-${row.key}`, type: "bars" as const, title: row.label, format: row.format === "pct" ? "percent" as const : row.format === "money" ? "money" as const : "number" as const, rows: row.values.map((value, index) => ({ id: `${row.key}-${index}`, label: index === 0 ? "This period" : `Baseline ${index}`, value: value ?? 0, display: display(value, row.format === "pct" ? "percent" : row.format), tone: index === 0 ? "accent" as const : "muted" as const })) })),
    ] };
  }
  const data = await getCompareData(mode, metricKey, a, bs, scope);
  const format: WgValueFormat = data.format === "pct" ? "percent" : data.format === "money" ? "money" : "number";
  return { controls, blocks: [
    { id: "compare-periods", type: "narrative", title: `${a.start} → ${a.end}`, body: `Compared with ${bs.map((range) => `${range.start} → ${range.end}`).join(" · ")}`, items: [...warnings, ...data.insights, ...data.notes], tone: warnings.length ? "warning" : "muted" },
    { id: "compare-headline", type: "metrics", title: data.headline.label, items: [metric("This period", data.headline.a, format, { tone: "accent" }), ...data.headline.bs.map((value, index) => metric(`Baseline ${index + 1}`, value, format))] },
    { id: "compare-bars", type: "bars", title: `${data.metricLabel} · ${mode}`, format, rows: data.rows.map((row) => ({ id: row.key, label: row.name, value: row.a ?? 0, display: display(row.a, format), detail: `Before ${display(row.b, format)}`, tone: row.a !== null && row.b !== null && row.a >= row.b ? "good" : "plain" })) },
    table("compare-table", "Exact figures", [mode === "stores" ? "Store" : mode === "groomers" ? "Groomer" : "Item", "Before", "Now", "Change"], data.rows.map((row) => {
      const change = row.a !== null && row.b !== null ? row.a - row.b : null;
      return { id: row.key, cells: [row.name, display(row.b, format), display(row.a, format), display(change, format)], detail: row.tag, tone: change !== null && change < 0 ? "bad" : change !== null && change > 0 ? "good" : "plain" };
    })),
  ] };
}

export async function buildWgMobileSection(section: WgDashboardSection, scope: Scope, month: MonthValue, actor: WgMobileActor, params: WgSectionParams): Promise<WgMobileSectionData> {
  const definition = SECTION_TITLES[section];
  let blocks: WgMobileSectionBlock[];
  let controls: WgMobileSectionData["controls"];
  if (section === "performance") blocks = await performance(scope, month);
  else if (section === "revenue") blocks = await revenue(scope, month);
  else if (section === "money") blocks = await moneySection(scope, month);
  else if (section === "customers") blocks = await customers(scope, month);
  else if (section === "products") ({ blocks, controls } = await products(scope, month, params));
  else if (section === "stores") blocks = await storesSection(month);
  else if (section === "team") blocks = await team(scope, month);
  else if (section === "reviews") blocks = await reviews();
  else if (section === "brief") blocks = await brief(scope);
  else if (section === "actions") blocks = await actions(scope);
  else if (section === "events") blocks = await events(scope, actor);
  else ({ blocks, controls } = await compare(scope, params));
  return { workspace: "woof-gang", section, title: definition.title, eyebrow: `${definition.eyebrow} · ${scopeLabel(scope)}`, scope, period: section === "brief" ? "This week" : periodLabel(month), ownerOnly: definition.ownerOnly, blocks, controls };
}

export function isOwnerOnlyWgSection(section: WgDashboardSection): boolean {
  return SECTION_TITLES[section].ownerOnly;
}
