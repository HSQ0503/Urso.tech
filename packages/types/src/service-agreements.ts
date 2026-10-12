import { anchoredMonthDate } from "./pricing";
import type { ServiceCategory } from "./service-categories";
import type { ServiceArea } from "./service-areas";

export const SERVICE_CADENCES = [
  { months: 3, discountBps: 2000, label: "Every 3 months · 20% off" },
  { months: 4, discountBps: 1500, label: "Every 4 months · 15% off" },
  { months: 6, discountBps: 1000, label: "Every 6 months · 10% off" },
] as const;
export type ServiceCadence = 3 | 4 | 6;
export type AgreementState =
  | "pending_payment"
  | "active"
  | "payment_review"
  | "cancel_after_next"
  | "canceled";
export type ServiceAgreement = {
  id: string;
  state: AgreementState;
  source_invoice_id: string;
  service_line_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  contact_id: string | null;
  property_key: string;
  job_address: string;
  service_area: ServiceArea | null;
  marketing_channel_id: string | null;
  service_name: string;
  service_description: string | null;
  service_category: ServiceCategory;
  cadence_months: ServiceCadence;
  original_service_on: string;
  original_net_cents: number;
  signup_discount_cents: number;
  recurring_price_cents: number;
  tax_rate_bps: number;
  taxable: boolean;
  crew_id: string | null;
  duration_minutes: number | null;
  next_due_on: string;
  next_cycle: number;
  accepted_at: string;
  accepted_name: string;
  terms_text: string;
  terms_version: string;
  activated_at: string | null;
  first_repeat_satisfied_at: string | null;
  final_occurrence_id: string | null;
  canceled_at: string | null;
  cancellation_invoice_id: string | null;
};
export type ServiceOccurrence = {
  id: string;
  agreement_id: string;
  cycle: number;
  due_on: string;
  state: "needs_scheduling" | "scheduled" | "completed" | "paid" | "canceled";
  job_id: string | null;
  invoice_id: string | null;
  completed_at: string | null;
  paid_at: string | null;
  scheduling_note: string | null;
};
export type CrewAvailability = {
  crew_id: string;
  weekdays: number[];
  start_minute: number;
  end_minute: number;
  travel_buffer_minutes: number;
};
export type ServiceAgreementsView = {
  agreements: ServiceAgreement[];
  occurrences: ServiceOccurrence[];
  availability: CrewAvailability[];
  crews: { id: string; name: string }[];
  jobs: { id: string; scheduled_at: string | null; status: string }[];
};
export type ServiceOfferLine = {
  serviceLineId: string;
  name: string;
  description: string | null;
  category: ServiceCategory;
  originalNetCents: number;
  eligible: boolean;
  taxable: boolean;
};
export type ServiceEnrollmentChoice = {
  serviceLineId: string;
  months: ServiceCadence;
};
export type ServiceAgreementAction =
  | {
      action: "offers";
      invoiceId: string;
      serviceDate: string;
      crewId: string | null;
      durations: Record<string, number>;
      enabled: boolean;
    }
  | {
      action: "configure";
      id: string;
      area: ServiceArea | null;
      crewId: string | null;
      durationMinutes: number;
    }
  | {
      action: "availability";
      crewId: string;
      weekdays: number[];
      startMinute: number;
      endMinute: number;
      travelBufferMinutes: number;
    }
  | { action: "link"; id: string; sendText: boolean }
  | {
      action: "waive";
      agreementId: string;
      amountCents: number;
      reason: string;
    }
  | { action: "finalize"; invoiceId: string }
  | {
      action: "schedule";
      occurrenceId: string;
      scheduledAt: string;
      crewId: string;
      durationMinutes: number;
    };
export type ServiceEnrollmentOffer = {
  invoiceId: string;
  invoiceNumber: string;
  revision: number;
  totalCents: number;
  paidCents: number;
  customerName: string;
  email: string;
  serviceDate: string;
  jobAddress: string;
  taxRateBps: number;
  taxCents: number;
  taxableSubtotalCents: number;
  lines: ServiceOfferLine[];
};

export function serviceDiscount(cents: number, months: ServiceCadence) {
  const cadence = SERVICE_CADENCES.find((cadence) => cadence.months === months);
  if (!cadence || !Number.isSafeInteger(cents) || cents <= 0)
    throw new Error("Choose a valid recurring service offer.");
  const savings = Number(
    (BigInt(cents) * BigInt(cadence.discountBps) + BigInt(5000)) /
      BigInt(10000),
  );
  return { savingsCents: savings, recurringCents: cents - savings };
}
export function serviceCycleDate(
  anchor: string,
  months: ServiceCadence,
  cycle: number,
): string {
  if (
    !SERVICE_CADENCES.some((cadence) => cadence.months === months) ||
    !Number.isInteger(cycle) ||
    cycle < 1 ||
    cycle > 1000
  )
    throw new Error("Choose a valid service cycle.");
  return anchoredMonthDate(anchor, months * cycle, Number(anchor.slice(-2)));
}
export function serviceCancellationFee(
  agreement: Pick<
    ServiceAgreement,
    "signup_discount_cents" | "first_repeat_satisfied_at"
  >,
): number {
  return agreement.first_repeat_satisfied_at
    ? 0
    : agreement.signup_discount_cents + 5000;
}
