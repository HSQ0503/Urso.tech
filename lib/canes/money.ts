import {
  allocateCents,
  serviceCategoryLabel,
  type BusinessExpense,
  type Invoice,
  type InvoiceItem,
  type Job,
  type JobExpense,
  type JobItem,
  type MarketingChannel,
  type MoneyPeriod,
  type MoneyReport,
  type Payment,
  type TeamMember,
  type WorkerEarning,
  type WorkerRate,
  type WorkerUpsell,
} from "@urso/types";
import { canesDb } from "./supabase";
import { isDemo } from "./data";
import { rangeBounds } from "./payouts";
import { readAll } from "./read-all";
import {
  DEMO_JOBS,
  DEMO_INVOICES,
  DEMO_INVOICE_ITEMS,
  DEMO_JOB_ITEMS,
  DEMO_PAYMENTS,
  DEMO_TEAM,
} from "./fixtures";

type Refund = {
  id: string;
  payment_id: string;
  created_at: string;
  amount_cents: number;
};
type Allocation = {
  expense_id: string;
  earning_id: string;
  amount_cents: number;
};
type Time = {
  id: string;
  account_id: string;
  job_id: string;
  checked_in_at: string;
  checked_out_at: string | null;
};
type Account = { id: string; team_member_id: string };
export type MoneySources = {
  jobs: Job[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  jobItems: JobItem[];
  payments: Payment[];
  refunds: Refund[];
  costs: JobExpense[];
  expenses: BusinessExpense[];
  channels: MarketingChannel[];
  workers: TeamMember[];
  rates: WorkerRate[];
  earnings: WorkerEarning[];
  allocations: Allocation[];
  time: Time[];
  accounts: Account[];
  upsells: WorkerUpsell[];
};
const dayOf = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
export function parseMoneyPeriod(raw?: string | null): MoneyPeriod {
  return raw === "week" || raw === "year" ? raw : "month";
}

export async function readMoneySources(): Promise<MoneySources> {
  if (isDemo())
    return {
      jobs: DEMO_JOBS,
      invoices: DEMO_INVOICES,
      invoiceItems: DEMO_INVOICE_ITEMS,
      jobItems: DEMO_JOB_ITEMS,
      payments: DEMO_PAYMENTS,
      refunds: [],
      costs: [],
      expenses: [],
      channels: [],
      workers: DEMO_TEAM,
      rates: [],
      earnings: [],
      allocations: [],
      time: [],
      accounts: [],
      upsells: [],
    };
  const { data, error } = await canesDb().rpc("canes_money_sources");
  if (error || !data)
    throw new Error("The financial ledger could not be loaded.");
  return data as MoneySources;
}

type Line = Pick<
  InvoiceItem,
  | "id"
  | "service_line_id"
  | "service_category"
  | "name"
  | "line_total_cents"
  | "service_net_snapshot_cents"
>;
function weightedLines(lines: Line[]) {
  return lines.map((line) => ({
    id: line.id,
    weight: Math.max(
      0,
      line.service_net_snapshot_cents ?? line.line_total_cents,
    ),
  }));
}

export function invoiceLineCollections(
  source: MoneySources,
  invoice: Invoice,
): Map<string, number> {
  const payments = source.payments.filter(
    (payment) => payment.invoice_id === invoice.id,
  );
  const ids = new Set(payments.map((payment) => payment.id));
  const net =
    payments.reduce((sum, payment) => sum + payment.amount_cents, 0) -
    source.refunds
      .filter((refund) => ids.has(refund.payment_id))
      .reduce((sum, refund) => sum + refund.amount_cents, 0);
  const beforeTax =
    invoice.total_cents > 0
      ? Math.round(
          (Math.min(Math.max(0, net), invoice.total_cents) *
            Math.max(0, invoice.total_cents - invoice.tax_cents)) /
            invoice.total_cents,
        )
      : 0;
  return allocateCents(
    beforeTax,
    weightedLines(
      source.invoiceItems.filter((line) => line.invoice_id === invoice.id),
    ),
  );
}

export function buildMoneyReport(
  source: MoneySources,
  period: MoneyPeriod,
  from: string,
  to: string,
  asOf = new Date().toISOString(),
): MoneyReport {
  const fromDay = dayOf(from),
    toDay = dayOf(to),
    today = dayOf(asOf);
  const inTime = (at: string) =>
    Date.parse(at) >= Date.parse(from) && Date.parse(at) < Date.parse(to);
  const inDay = (date: string | null | undefined): boolean =>
    Boolean(date && date >= fromDay && date < toDay);
  const invoices = new Map(
    source.invoices.map((invoice) => [invoice.id, invoice]),
  );
  const jobs = new Map(source.jobs.map((job) => [job.id, job]));
  const payments = new Map(
    source.payments.map((payment) => [payment.id, payment]),
  );
  const services = new Map<string, MoneyReport["services"][number]>();
  const serviceJobs = new Map<string, Set<string>>();
  const marketing = new Map<string, MoneyReport["marketing"][number]>(
    source.channels.map((channel) => [
      channel.id,
      {
        ...channel,
        collectedCents: 0,
        spendCents: 0,
        bookedCents: 0,
        roas: null,
      },
    ]),
  );
  marketing.set("unknown", {
    id: "unknown",
    name: "Unknown",
    collectedCents: 0,
    spendCents: 0,
    bookedCents: 0,
    roas: null,
  });
  function channel(id: string | null | undefined) {
    return marketing.get(id ?? "unknown") ?? marketing.get("unknown")!;
  }
  function service(line?: Line) {
    const key = line?.service_category ?? "unknown";
    if (!services.has(key))
      services.set(key, {
        key,
        name: serviceCategoryLabel(line?.service_category),
        collectedCents: 0,
        revenueCents: 0,
        costCents: 0,
        directCostCents: 0,
        allocatedCostCents: 0,
        profitCents: 0,
        jobs: 0,
      });
    return services.get(key)!;
  }
  function apply(
    lines: Line[],
    cents: number,
    field:
      | "collectedCents"
      | "revenueCents"
      | "directCostCents"
      | "allocatedCostCents",
    workId?: string,
  ) {
    if (!lines.some((line) => line.line_total_cents > 0)) {
      service()[field] += cents;
      return;
    }
    const split = allocateCents(cents, weightedLines(lines));
    for (const line of lines) {
      const row = service(line);
      row[field] += split.get(line.id) ?? 0;
      if (workId) {
        const set = serviceJobs.get(row.key) ?? new Set<string>();
        set.add(workId);
        serviceJobs.set(row.key, set);
      }
    }
  }
  const movements: MoneyReport["payments"] = [];
  const collectedByDocument = new Map<string, number>();
  function movement(payment: Payment, cents: number, at: string, id: string) {
    const invoice = payment.invoice_id
      ? invoices.get(payment.invoice_id)
      : source.invoices.find(
          (invoice) =>
            invoice.job_id === payment.job_id && invoice.status !== "void",
        );
    const job = jobs.get(payment.job_id ?? invoice?.job_id ?? "");
    const lines = invoice
      ? source.invoiceItems.filter((line) => line.invoice_id === invoice.id)
      : source.jobItems.filter(
          (line) => line.job_id === job?.id && !line.checklist_only,
        );
    const total = invoice?.total_cents ?? job?.total_cents ?? 0,
      tax = invoice?.tax_cents ?? job?.tax_cents ?? 0;
    const documentKey = invoice
      ? `invoice:${invoice.id}`
      : job
        ? `job:${job.id}`
        : `payment:${payment.id}`;
    const prior = collectedByDocument.get(documentKey) ?? 0,
      next = prior + cents;
    collectedByDocument.set(documentKey, next);
    if (!inTime(at)) return;
    const servicePortion = (amount: number) =>
      total > 0
        ? Number(
            (BigInt(Math.min(total, Math.max(0, amount))) *
              BigInt(Math.max(0, total - tax)) *
              BigInt(2) +
              BigInt(total)) /
              (BigInt(total) * BigInt(2)),
          )
        : amount;
    const before =
        invoice?.service_autopay_kind === "cancellation"
          ? 0
          : servicePortion(prior),
      after =
        invoice?.service_autopay_kind === "cancellation"
          ? 0
          : servicePortion(next),
      netService = after - before;
    if (lines.some((line) => line.line_total_cents > 0)) {
      const oldShares = allocateCents(before, weightedLines(lines)),
        newShares = allocateCents(after, weightedLines(lines));
      for (const line of lines)
        service(line).collectedCents +=
          (newShares.get(line.id) ?? 0) - (oldShares.get(line.id) ?? 0);
    } else service().collectedCents += netService;
    channel(
      invoice?.marketing_channel_id ?? job?.marketing_channel_id,
    ).collectedCents += netService;
    movements.push({
      id,
      paymentId: payment.id,
      at,
      cents,
      method: payment.method_detail ?? payment.method,
      provider: payment.square_payment_id ? "Square" : "Manual",
      invoiceId: invoice?.id ?? null,
      jobId: job?.id ?? null,
    });
  }
  const events = [
    ...source.payments.map((payment) => ({
      payment,
      cents: payment.amount_cents,
      at: payment.created_at,
      id: payment.id,
    })),
    ...source.refunds.flatMap((refund) => {
      const payment = payments.get(refund.payment_id);
      return payment
        ? [
            {
              payment,
              cents: -refund.amount_cents,
              at: refund.created_at,
              id: refund.id,
            },
          ]
        : [];
    }),
  ].sort(
    (a, b) =>
      Date.parse(a.at) - Date.parse(b.at) ||
      b.cents - a.cents ||
      a.id.localeCompare(b.id),
  );
  for (const event of events)
    movement(event.payment, event.cents, event.at, event.id);

  let undatedCompletedJobs = 0;
  for (const job of source.jobs) {
    if (job.status === "canceled") continue;
    if (inTime(job.created_at))
      channel(job.marketing_channel_id).bookedCents += Math.max(
        0,
        job.total_cents - (job.tax_cents ?? 0),
      );
    if (!["completed", "invoiced", "paid"].includes(job.status)) continue;
    if (!job.service_completed_on) {
      undatedCompletedJobs++;
      continue;
    }
    if (!inDay(job.service_completed_on)) continue;
    const invoice = source.invoices.find(
      (candidate) => candidate.job_id === job.id && candidate.status !== "void",
    );
    const lines = invoice
      ? source.invoiceItems.filter((line) => line.invoice_id === invoice.id)
      : source.jobItems.filter(
          (line) => line.job_id === job.id && !line.checklist_only,
        );
    apply(
      lines,
      Math.max(
        0,
        (invoice?.total_cents ?? job.total_cents) -
          (invoice?.tax_cents ?? job.tax_cents ?? 0),
      ),
      "revenueCents",
      job.id,
    );
    for (const cost of source.costs.filter((cost) => cost.job_id === job.id)) {
      const direct = lines.filter(
        (line) =>
          line.service_line_id && line.service_line_id === cost.service_line_id,
      );
      apply(
        direct.length ? direct : lines,
        cost.amount_cents,
        direct.length ? "directCostCents" : "allocatedCostCents",
      );
    }
    for (const earning of source.earnings.filter(
      (earning) => earning.job_id === job.id,
    ))
      apply(lines, earning.amount_cents, "allocatedCostCents");
  }
  for (const invoice of source.invoices.filter(
    (invoice) =>
      !invoice.job_id &&
      invoice.status !== "void" &&
      invoice.service_autopay_kind !== "cancellation",
  )) {
    if (inTime(invoice.created_at))
      channel(invoice.marketing_channel_id).bookedCents += Math.max(
        0,
        invoice.total_cents - invoice.tax_cents,
      );
    if (inDay(invoice.service_date))
      apply(
        source.invoiceItems.filter((line) => line.invoice_id === invoice.id),
        Math.max(0, invoice.total_cents - invoice.tax_cents),
        "revenueCents",
        invoice.id,
      );
  }
  const expenseTotals = new Map<string, number>();
  for (const expense of source.expenses.filter(
    (expense) =>
      expense.active &&
      !expense.skipped &&
      !expense.legacy_template &&
      !expense.recurring &&
      inDay(expense.incurred_on),
  )) {
    expenseTotals.set(
      expense.category,
      (expenseTotals.get(expense.category) ?? 0) + expense.amount_cents,
    );
    if (
      expense.marketing_channel_id ||
      expense.category.toLowerCase() === "marketing"
    )
      channel(expense.marketing_channel_id).spendCents += expense.amount_cents;
  }
  for (const cost of source.costs.filter((cost) => inDay(cost.paid_on)))
    expenseTotals.set(
      cost.category,
      (expenseTotals.get(cost.category) ?? 0) + cost.amount_cents,
    );
  const earningsById = new Map(
    source.earnings.map((earning) => [earning.id, earning]),
  );
  const workers = source.workers
    .filter(
      (worker) =>
        ["worker", "ops_manager"].includes(worker.role) ||
        source.earnings.some((earning) => earning.employee_id === worker.id),
    )
    .map((worker) => {
      const earned = source.earnings.filter(
        (earning) => earning.employee_id === worker.id,
      );
      const allocatedPaidCents = source.allocations
        .filter(
          (allocation) =>
            earningsById.get(allocation.earning_id)?.employee_id === worker.id,
        )
        .reduce((sum, allocation) => sum + allocation.amount_cents, 0);
      const earnedCents = earned.reduce(
        (sum, earning) => sum + earning.amount_cents,
        0,
      );
      const paid = source.expenses.filter(
        (expense) =>
          expense.employee_id === worker.id &&
          expense.active &&
          !expense.skipped &&
          !expense.legacy_template,
      );
      const recordedPaidCents = paid.reduce(
        (sum, expense) => sum + expense.amount_cents,
        0,
      );
      return {
        id: worker.id,
        name: worker.name,
        earnedCents,
        allocatedPaidCents,
        unpaidCents: earnedCents - allocatedPaidCents,
        recordedPaidCents,
        unallocatedPaidCents: recordedPaidCents - allocatedPaidCents,
        periodEarnedCents: earned
          .filter((earning) => inDay(earning.earned_on))
          .reduce((sum, earning) => sum + earning.amount_cents, 0),
        hours:
          earned
            .filter((earning) => inDay(earning.earned_on))
            .reduce((sum, earning) => sum + (earning.minutes ?? 0), 0) / 60,
        rate:
          source.rates
            .filter(
              (rate) =>
                rate.employee_id === worker.id && rate.effective_on <= today,
            )
            .sort((a, b) => b.effective_on.localeCompare(a.effective_on))[0] ??
          null,
      };
    });
  const collectedCents = movements.reduce(
      (sum, movement) => sum + movement.cents,
      0,
    ),
    spentCents = [...expenseTotals.values()].reduce(
      (sum, cents) => sum + cents,
      0,
    );
  return {
    period,
    label:
      period === "week"
        ? "This week"
        : period === "year"
          ? "This year"
          : "This month",
    from,
    to,
    asOf,
    undatedCompletedJobs,
    cash: {
      collectedCents,
      spentCents,
      netCents: collectedCents - spentCents,
      undatedJobCostCents: source.costs
        .filter((cost) => !cost.paid_on)
        .reduce((sum, cost) => sum + cost.amount_cents, 0),
    },
    services: [...services.values()]
      .map((row) => ({
        ...row,
        jobs: serviceJobs.get(row.key)?.size ?? 0,
        costCents: row.directCostCents + row.allocatedCostCents,
        profitCents:
          row.revenueCents - row.directCostCents - row.allocatedCostCents,
      }))
      .sort((a, b) => b.collectedCents - a.collectedCents),
    marketing: [...marketing.values()].map((row) => ({
      ...row,
      roas: row.spendCents > 0 ? row.collectedCents / row.spendCents : null,
    })),
    workers,
    earnings: source.earnings.sort((a, b) =>
      b.earned_on.localeCompare(a.earned_on),
    ),
    rates: source.rates,
    time: source.time.map((entry) => {
      const employeeId =
        source.accounts.find((account) => account.id === entry.account_id)
          ?.team_member_id ?? "";
      return {
        id: entry.id,
        employeeId,
        employeeName:
          source.workers.find((worker) => worker.id === employeeId)?.name ??
          "Unknown worker",
        jobId: entry.job_id,
        checkedInAt: entry.checked_in_at,
        checkedOutAt: entry.checked_out_at,
        minutes: entry.checked_out_at
          ? Math.max(
              1,
              Math.round(
                (Date.parse(entry.checked_out_at) -
                  Date.parse(entry.checked_in_at)) /
                  60000,
              ),
            )
          : null,
        approved: source.earnings.some(
          (earning) => earning.time_entry_id === entry.id,
        ),
      };
    }),
    expenses: [...expenseTotals].map(([category, cents]) => ({
      category,
      cents,
    })),
    payments: movements.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    channels: source.channels,
    jobCosts: source.costs.map((cost) => ({
      id: cost.id,
      jobId: cost.job_id,
      label: `${jobs.get(cost.job_id)?.customer_name ?? "Customer"} · ${cost.category} · ${cost.note ?? ""}`,
      amountCents: cost.amount_cents,
      serviceLineId: cost.service_line_id ?? null,
      paidOn: cost.paid_on ?? null,
    })),
    jobServiceLines: source.jobItems
      .filter((line) => line.service_line_id && !line.checklist_only)
      .map((line) => ({
        id: line.service_line_id!,
        jobId: line.job_id,
        name: `${jobs.get(line.job_id)?.customer_name ?? "Customer"} · ${line.name}`,
      })),
    jobs: source.jobs
      .filter((job) => !job.archived_at)
      .map((job) => ({
        id: job.id,
        name: `${job.customer_name ?? "Customer"} · ${job.job_name ?? "Work order"}`,
        channelId: job.marketing_channel_id ?? null,
      })),
    upsellLines: source.invoiceItems
      .filter(
        (line) =>
          line.service_line_id &&
          line.line_total_cents > 0 &&
          !invoices.get(line.invoice_id)?.service_visit &&
          invoices.get(line.invoice_id)?.service_autopay_kind !==
            "cancellation" &&
          !source.upsells.some(
            (upsell) =>
              upsell.invoice_id === line.invoice_id &&
              upsell.service_line_id === line.service_line_id,
          ),
      )
      .map((line) => ({
        invoiceId: line.invoice_id,
        invoiceNumber: invoices.get(line.invoice_id)?.number ?? "Invoice",
        serviceLineId: line.service_line_id!,
        name: line.name,
        cents: line.line_total_cents,
      })),
  };
}

export async function getMoneyReport(
  period: MoneyPeriod,
): Promise<MoneyReport> {
  const { startIso, endIso } = rangeBounds(period);
  return buildMoneyReport(await readMoneySources(), period, startIso, endIso);
}

export async function reconcileWorkerCommissions() {
  if (isDemo()) return { reconciled: 0 };
  const upsells = await readAll<{ id: string }>((from, to) =>
    canesDb()
      .from("canes_worker_upsells")
      .select("id")
      .order("id")
      .range(from, to),
  );
  let reconciled = 0;
  for (const upsell of upsells) {
    const { data, error } = await canesDb().rpc("reconcile_canes_upsell", {
      p_upsell: upsell.id,
    });
    if (error) throw new Error("Worker commission reconciliation failed.");
    if (data) reconciled++;
  }
  return { reconciled };
}
