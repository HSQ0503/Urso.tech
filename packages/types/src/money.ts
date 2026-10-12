export type MoneyPeriod = "week" | "month" | "year";
export type MoneyTab =
  | "services"
  | "marketing"
  | "workers"
  | "expenses"
  | "payments";
export type MarketingChannel = { id: string; name: string; active: boolean };
export type WorkerRate = {
  id: string;
  employee_id: string;
  effective_on: string;
  hourly_cents: number;
  commission_bps: number;
};
export type WorkerEarning = {
  id: string;
  employee_id: string;
  job_id: string | null;
  time_entry_id: string | null;
  upsell_id: string | null;
  kind: "wage" | "commission" | "adjustment";
  earned_on: string;
  amount_cents: number;
  minutes: number | null;
  hourly_cents: number | null;
  reason: string;
};
export type WorkerUpsell = {
  id: string;
  employee_id: string;
  invoice_id: string;
  service_line_id: string;
  additional_cents: number;
  commission_bps: number;
};
export type WorkerTime = {
  id: string;
  employeeId: string;
  employeeName: string;
  jobId: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  minutes: number | null;
  approved: boolean;
};
export type MoneyMutation =
  | {
      action: "rate";
      employeeId: string;
      effectiveOn: string;
      hourlyCents: number;
      commissionBps: number;
    }
  | {
      action: "approveTime";
      employeeId: string;
      jobId: string;
      date: string;
      minutes: number;
      entryId?: string;
      reason: string;
      requestKey: string;
    }
  | {
      action: "adjustment";
      employeeId: string;
      jobId?: string;
      date: string;
      amountCents: number;
      reason: string;
      requestKey: string;
    }
  | {
      action: "upsell";
      employeeId: string;
      invoiceId: string;
      serviceLineId: string;
      additionalCents: number;
      reason: string;
    }
  | {
      action: "spend";
      channelId: string;
      date: string;
      amountCents: number;
      note: string;
      requestKey: string;
    }
  | { action: "channel"; name: string }
  | { action: "attribution"; jobId: string; channelId: string | null }
  | { action: "paymentMethod"; paymentId: string; method: string }
  | { action: "serviceDate"; jobId: string; date: string }
  | {
      action: "cost";
      costId: string;
      serviceLineId: string | null;
      paidOn: string | null;
    };
export type MoneyReport = {
  period: MoneyPeriod;
  label: string;
  from: string;
  to: string;
  asOf: string;
  undatedCompletedJobs: number;
  cash: {
    collectedCents: number;
    spentCents: number;
    netCents: number;
    undatedJobCostCents: number;
  };
  services: {
    key: string;
    name: string;
    collectedCents: number;
    revenueCents: number;
    costCents: number;
    directCostCents: number;
    allocatedCostCents: number;
    profitCents: number;
    jobs: number;
  }[];
  marketing: {
    id: string;
    name: string;
    collectedCents: number;
    spendCents: number;
    bookedCents: number;
    roas: number | null;
  }[];
  workers: {
    id: string;
    name: string;
    earnedCents: number;
    periodEarnedCents: number;
    allocatedPaidCents: number;
    unpaidCents: number;
    recordedPaidCents: number;
    unallocatedPaidCents: number;
    hours: number;
    rate: WorkerRate | null;
  }[];
  earnings: WorkerEarning[];
  time: WorkerTime[];
  rates: WorkerRate[];
  expenses: { category: string; cents: number }[];
  payments: {
    id: string;
    paymentId: string;
    at: string;
    cents: number;
    method: string;
    provider: string;
    invoiceId: string | null;
    jobId: string | null;
  }[];
  jobCosts: {
    id: string;
    jobId: string;
    label: string;
    amountCents: number;
    serviceLineId: string | null;
    paidOn: string | null;
  }[];
  jobServiceLines: { id: string; jobId: string; name: string }[];
  channels: MarketingChannel[];
  jobs: { id: string; name: string; channelId: string | null }[];
  upsellLines: {
    invoiceId: string;
    invoiceNumber: string;
    serviceLineId: string;
    name: string;
    cents: number;
  }[];
};

/** Largest remainders keep allocations exact, including refunds and odd cents. */
export function allocateCents(
  amount: number,
  entries: { id: string; weight: number }[],
): Map<string, number> {
  if (
    !Number.isSafeInteger(amount) ||
    entries.some(
      (entry) => !Number.isSafeInteger(entry.weight) || entry.weight < 0,
    ) ||
    new Set(entries.map((entry) => entry.id)).size !== entries.length
  )
    throw new Error("Invalid allocation.");
  const weight = entries.reduce(
    (sum, entry) => sum + BigInt(entry.weight),
    BigInt(0),
  );
  if (!weight) return new Map(entries.map((entry) => [entry.id, 0]));
  const sign = amount < 0 ? -1 : 1;
  const total = BigInt(Math.abs(amount));
  const portions = entries.map((entry) => ({
    id: entry.id,
    cents: Number((total * BigInt(entry.weight)) / weight),
    remainder: (total * BigInt(entry.weight)) % weight,
  }));
  const remaining =
    Math.abs(amount) - portions.reduce((sum, entry) => sum + entry.cents, 0);
  portions.sort((a, b) =>
    a.remainder === b.remainder
      ? a.id.localeCompare(b.id)
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (let i = 0; i < remaining; i++) portions[i].cents++;
  return new Map(portions.map((entry) => [entry.id, sign * entry.cents]));
}

export function csvCell(value: string | number): string {
  const text = String(value);
  const safe =
    typeof value === "string" && /^[\s]*[=+@\-\t\r]/.test(text)
      ? `'${text}`
      : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function moneyCsv(report: MoneyReport, tab: string): string {
  let rows: (string | number)[][];
  if (tab === "marketing")
    rows = [
      [
        "Channel",
        "Net collections cents (ex tax)",
        "Paid spend cents",
        "Booked cents",
        "Period ROAS",
      ],
      ...report.marketing.map((row) => [
        row.name,
        row.collectedCents,
        row.spendCents,
        row.bookedCents,
        row.roas ?? "N/A",
      ]),
    ];
  else if (tab === "workers")
    rows = [
      [
        "Worker ID",
        "Name",
        "Earned this period cents",
        "Outstanding all-time cents",
        "Recorded payments all-time cents",
        "Unallocated paid cents",
        "Approved period hours",
      ],
      ...report.workers.map((row) => [
        row.id,
        row.name,
        row.periodEarnedCents,
        row.unpaidCents,
        row.recordedPaidCents,
        row.unallocatedPaidCents,
        row.hours,
      ]),
    ];
  else if (tab === "expenses")
    rows = [
      ["Category", "Paid spending cents"],
      ...report.expenses.map((row) => [row.category, row.cents]),
    ];
  else if (tab === "payments")
    rows = [
      [
        "Movement ID",
        "Payment ID",
        "At (ISO)",
        "Cents",
        "Method",
        "Provider",
        "Invoice ID",
        "Job ID",
      ],
      ...report.payments.map((row) => [
        row.id,
        row.paymentId,
        row.at,
        row.cents,
        row.method,
        row.provider,
        row.invoiceId ?? "",
        row.jobId ?? "",
      ]),
    ];
  else
    rows = [
      [
        "Category",
        "Service",
        "Period collections cents (ex tax)",
        "Completed work value cents",
        "Recorded direct cost cents",
        "Recorded allocated cost cents",
        "Margin after recorded costs cents",
      ],
      ...report.services.map((row) => [
        row.key,
        row.name,
        row.collectedCents,
        row.revenueCents,
        row.directCostCents,
        row.allocatedCostCents,
        row.profitCents,
      ]),
    ];
  const header = [
    "Period start (inclusive)",
    "Period end (exclusive)",
    "Timezone",
    "Generated at",
  ];
  return [
    [...header, ...rows[0]],
    ...rows
      .slice(1)
      .map((row) => [
        report.from,
        report.to,
        "America/New_York",
        report.asOf,
        ...row,
      ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
