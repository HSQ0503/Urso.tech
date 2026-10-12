import { priceServices, type ServiceLineInput } from "@urso/types";

export function manualServiceLines(
  lines: ServiceLineInput[] | undefined,
  name: string,
  totalCents: number,
) {
  const priced = priceServices(
    lines ?? [{ name, quantity: 1, unitPriceCents: totalCents }],
  );
  if (
    priced.lines.some(
      (line) => line.isOption || line.isMandatory || line.isSelected === false,
    )
  ) {
    throw new Error(
      "Manual work must include each selected service. Use an estimate for optional work.",
    );
  }
  return {
    totalCents: priced.totalCents,
    rows: priced.lines.map((line, position) => ({
      position,
      name: line.name.trim(),
      description: line.description?.trim() || null,
      service_category: line.serviceCategory ?? null,
      quantity: line.quantity,
      unit_price_cents: line.unitPriceCents,
      discount_mode: line.discountMode ?? "amount",
      discount_value: line.discountValue ?? 0,
      discount_cents: line.discountCents,
      line_total_cents: line.lineTotalCents,
      taxable: line.taxable ?? false,
    })),
  };
}
