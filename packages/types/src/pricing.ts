export type DiscountMode = "amount" | "percent";
export type DocumentKind = "estimate" | "job" | "invoice";
export type DocumentEdit = {
  kind: DocumentKind;
  id: string;
  fingerprint: string;
  title: string;
  lines: ServiceLineInput[];
  adjustmentCents: number;
  taxRateBps: number;
  terms: string;
  paidCents: number;
  totalCents: number;
  invoiceRewardCents: number;
  recurringPlanId?: string;
  futureVisitCount?: number;
  futureVisitsEditable?: boolean;
  affected: { kind: DocumentKind; id: string; label: string }[];
};
export type DocumentChange = {
  fingerprint: string;
  lines: ServiceLineInput[];
  adjustmentCents: number;
  taxRateBps: number;
  terms: string;
  agreement: "resend" | "verbal";
  futureVisits?: boolean;
};

export type ServiceLineInput = {
  name: string;
  description?: string | null;
  quantity: number;
  unitPriceCents: number;
  discountMode?: DiscountMode;
  /** Cents for an amount, basis points for a percentage. */
  discountValue?: number;
  taxable?: boolean;
  isOption?: boolean;
  isMandatory?: boolean;
  isSelected?: boolean;
  packageGroup?: string | null;
  kind?: string;
};

const MAX_CENTS = 2_147_483_647;

export function priceServiceLine(line: ServiceLineInput) {
  const quantity = Number(line.quantity);
  const value = line.discountValue ?? 0;
  const mode = line.discountMode ?? "amount";
  if (
    !line.name.trim() ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isSafeInteger(line.unitPriceCents) ||
    line.unitPriceCents < 0 ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !["amount", "percent"].includes(mode)
  ) {
    throw new Error(
      "Each service needs a name, positive quantity, valid price, and valid discount.",
    );
  }
  const grossCents = Math.round(quantity * line.unitPriceCents);
  if (!Number.isSafeInteger(grossCents) || grossCents > MAX_CENTS)
    throw new Error("The line amount is too large.");
  if (mode === "percent" && value > 10_000)
    throw new Error("A percentage discount cannot exceed 100%.");
  const discountCents =
    mode === "percent" ? Math.round((grossCents * value) / 10_000) : value;
  if (discountCents > grossCents)
    throw new Error("A discount cannot exceed its line subtotal.");
  return {
    grossCents,
    discountCents,
    lineTotalCents: grossCents - discountCents,
  };
}

export function priceServices(
  lines: ServiceLineInput[],
  adjustmentCents = 0,
  taxRateBps = 0,
) {
  if (!lines.length || lines.length > 200)
    throw new Error("Add between 1 and 200 service lines.");
  if (
    !Number.isSafeInteger(adjustmentCents) ||
    !Number.isSafeInteger(taxRateBps) ||
    taxRateBps < 0 ||
    taxRateBps > 10_000
  ) {
    throw new Error("Enter a valid adjustment and tax rate.");
  }
  const priced = lines.map((line) => ({ ...line, ...priceServiceLine(line) }));
  const included = priced.filter(
    (line) => !line.isOption || line.isMandatory || line.isSelected,
  );
  const subtotalCents = included.reduce(
    (sum, line) => sum + line.lineTotalCents,
    0,
  );
  const discountCents = included.reduce(
    (sum, line) => sum + line.discountCents,
    0,
  );
  const taxCents = Math.round(
    (included.reduce(
      (sum, line) => sum + (line.taxable ? line.lineTotalCents : 0),
      0,
    ) *
      taxRateBps) /
      10_000,
  );
  const totalCents = subtotalCents + adjustmentCents + taxCents;
  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents < 0 ||
    totalCents > MAX_CENTS ||
    subtotalCents > MAX_CENTS
  ) {
    throw new Error("The total must be a valid, non-negative amount.");
  }
  return { lines: priced, subtotalCents, discountCents, taxCents, totalCents };
}

export function anchoredMonthDate(
  date: string,
  months: number,
  anchorDay: number,
): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isInteger(months) ||
    !Number.isInteger(anchorDay) ||
    anchorDay < 1 ||
    anchorDay > 31
  ) {
    throw new Error("Choose a valid repeat date.");
  }
  const [year, month] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1, 12));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  target.setUTCDate(Math.min(anchorDay, lastDay));
  return target.toISOString().slice(0, 10);
}
