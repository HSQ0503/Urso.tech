import { createHash } from "node:crypto";
import {
  recurringServiceEligible,
  serviceCancellationFee,
  serviceCycleDate,
  type CrewAvailability,
  type ServiceAgreement,
  type ServiceAgreementsView,
  type ServiceEnrollmentOffer,
  type ServiceOccurrence,
} from "@urso/types";
import { canesConfigured, canesDb } from "./supabase";
import { getInvoiceByToken, getInvoiceItems } from "./invoices";
import { readAll } from "./read-all";
import {
  squareCardConfiguration,
  type ServiceEnrollment,
} from "./square-cards";
import { SQUARE_API_BASE, squareHeaders } from "./square-config";
import { pushPaymentIssue } from "./push-events";
import { handleSquarePaymentEvent, parseSquareEvent } from "./square";

export const SERVICE_TERMS_VERSION = "2026-10-12";
export const SERVICE_TERMS =
  "Each selected service is a separate recurring agreement. The current service receives the selected signup discount: every 3 months saves 20%, every 4 months saves 15%, or every 6 months saves 10%. The recurring dollar price shown stays fixed while the service scope stays the same. A scope or price change needs fresh acceptance. Recurrence is anchored to the original completed service date; weather and scheduling changes do not reset that cycle. Canes may group compatible services into one visit and invoice. Your card is stored securely by Square. You authorize the discounted current invoice balance now, and each agreed future service after it is completed and its invoice finalized. Additional work requires separate authorization. Before the first repeat service has been completed and paid, canceling now requires repayment of that service’s actual original signup savings plus $50 per agreement, less any written owner waiver. After that first completed and paid repeat, this initial cancellation obligation ends permanently. You may instead cancel after the next service without repaying the initial discount or paying the $50 fee; that final service is billed normally. Cancellation stops future service even if collection fails; completed work and cancellation invoices remain payable. Acceptance, a verified saved card and successful settlement of the discounted current invoice are required before service activates.";

export type AgreementRow = ServiceAgreement & {
  card_authorization_id: string;
  cancellation_token_hash: string | null;
  cancellation_token_expires_at: string | null;
  cancellation_fee_override_cents: number | null;
};
export async function getServiceAgreements(): Promise<ServiceAgreementsView> {
  if (!canesConfigured())
    return {
      agreements: [],
      occurrences: [],
      availability: [],
      crews: [],
      jobs: [],
    };
  const all = <T>(table: string) =>
    readAll<T>((from, to) =>
      canesDb().from(table).select("*").order("id").range(from, to),
    );
  const [agreements, occurrences, availability, crews, jobs] =
    await Promise.all([
      all<AgreementRow>("canes_service_agreements"),
      all<ServiceOccurrence>("canes_service_occurrences"),
      readAll<CrewAvailability>((from, to) =>
        canesDb()
          .from("canes_crew_availability")
          .select("*")
          .order("crew_id")
          .range(from, to),
      ),
      readAll<{ id: string; name: string }>((from, to) =>
        canesDb()
          .from("crews")
          .select("id,name")
          .eq("active", true)
          .order("id")
          .range(from, to),
      ),
      readAll<{ id: string; scheduled_at: string | null; status: string }>(
        (from, to) =>
          canesDb()
            .from("jobs")
            .select("id,scheduled_at,status")
            .order("id")
            .range(from, to),
      ),
    ]);
  return {
    agreements: agreements.map((agreement) => ({
      ...agreement,
      cancellation_token_hash: undefined,
      cancellation_token_expires_at: undefined,
    })),
    occurrences,
    availability,
    crews,
    jobs,
  };
}

export async function getEnrollmentPage(token: string) {
  const invoice = await getInvoiceByToken(token);
  if (!invoice || invoice.status === "void" || !canesConfigured()) return null;
  const { data: enrollment } = await canesDb()
    .from("canes_service_enrollments")
    .select("*")
    .eq("invoice_id", invoice.id)
    .neq("state", "abandoned")
    .maybeSingle();
  const { data: card } = enrollment
    ? await canesDb()
        .from("canes_card_authorizations")
        .select("card_brand,card_last4,verified_at,revoked_at")
        .eq("enrollment_id", enrollment.id)
        .maybeSingle()
    : { data: null };
  if (enrollment?.state === "applied") {
    const { data: rows } = await canesDb()
      .from("canes_service_agreements")
      .select("id,state,service_name,recurring_price_cents,next_due_on")
      .eq("source_invoice_id", invoice.id);
    return {
      status: "accepted" as const,
      invoiceNumber: invoice.number,
      paid: invoice.status === "paid",
      notice: invoice.service_payment_issue ?? null,
      hostedUrl: invoice.hosted_payment_url,
      agreements: rows ?? [],
    };
  }
  if (
    !invoice.service_offers_enabled ||
    invoice.status === "paid" ||
    !invoice.service_date ||
    !invoice.job_address
  )
    return null;
  const [items, values, configuration] = await Promise.all([
    getInvoiceItems(invoice.id),
    canesDb().rpc("canes_invoice_service_values", { p_invoice: invoice.id }),
    squareCardConfiguration(),
  ]);
  if (values.error) throw new Error("This offer could not be loaded.");
  const amounts = new Map(
    (values.data as { service_line_id: string; net_cents: number }[]).map(
      (line) => [line.service_line_id, line.net_cents],
    ),
  );
  const offer: ServiceEnrollmentOffer = {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    revision: invoice.revision ?? 1,
    totalCents: invoice.total_cents,
    paidCents: invoice.amount_paid_cents,
    customerName: invoice.customer_name ?? "",
    email: invoice.customer_email ?? "",
    serviceDate: invoice.service_date,
    jobAddress: invoice.job_address,
    taxRateBps: invoice.tax_rate_bps,
    taxCents: invoice.tax_cents,
    taxableSubtotalCents: items
      .filter((line) => line.taxable)
      .reduce((sum, line) => sum + line.line_total_cents, 0),
    lines: items
      .filter((line) => line.service_line_id && line.service_category)
      .map((line) => ({
        serviceLineId: line.service_line_id!,
        name: line.name,
        description: line.description,
        category: line.service_category!,
        originalNetCents: amounts.get(line.service_line_id!) ?? 0,
        eligible: recurringServiceEligible(line.service_category),
        taxable: line.taxable ?? false,
      })),
  };
  return {
    status: "offer" as const,
    offer,
    configuration,
    terms: enrollment?.terms_text ?? SERVICE_TERMS,
    recovery: enrollment
      ? {
          cardSaved: Boolean(card?.verified_at && !card.revoked_at),
          cardLabel: card
            ? `${card.card_brand ?? "Card"} •••• ${card.card_last4 ?? ""}`
            : null,
          state: enrollment.state as ServiceEnrollment["state"],
          name: enrollment.customer_name as string,
          email: enrollment.customer_email as string,
          choices: (enrollment as ServiceEnrollment).choices.map((choice) => ({
            serviceLineId: choice.service_line_id,
            months: choice.months,
          })),
        }
      : null,
  };
}

export function cancellationHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export type CancellationView = {
  agreementId: string;
  customerName: string;
  serviceName: string;
  state: string;
  recurringCents: number;
  feeCents: number;
  finalDue: string;
  finalScheduledAt: string | null;
  terms: string;
};
export async function cancellationView(
  token: string,
): Promise<CancellationView | null> {
  if (!canesConfigured() || !/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  const { data, error } = await canesDb()
    .from("canes_service_agreements")
    .select("*")
    .eq("cancellation_token_hash", cancellationHash(token))
    .gt("cancellation_token_expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  const agreement = data as AgreementRow;
  const { data: rows, error: occurrenceError } = await canesDb()
    .from("canes_service_occurrences")
    .select("*")
    .eq("agreement_id", agreement.id)
    .order("cycle");
  if (occurrenceError)
    throw new Error("The final visit could not be verified.");
  const occurrences = rows as ServiceOccurrence[];
  const final = occurrences.find((occurrence) =>
    ["needs_scheduling", "scheduled"].includes(occurrence.state),
  );
  const cycle =
    final?.cycle ??
    Math.max(0, ...occurrences.map((occurrence) => occurrence.cycle)) + 1;
  const due =
    final?.due_on ??
    serviceCycleDate(
      agreement.original_service_on,
      agreement.cadence_months,
      cycle,
    );
  const { data: job } = final?.job_id
    ? await canesDb()
        .from("jobs")
        .select("scheduled_at")
        .eq("id", final.job_id)
        .maybeSingle()
    : { data: null };
  const fee = serviceCancellationFee(agreement);
  return {
    agreementId: agreement.id,
    customerName: agreement.customer_name,
    serviceName: agreement.service_name,
    state: agreement.state,
    recurringCents: agreement.recurring_price_cents,
    feeCents: Math.min(fee, agreement.cancellation_fee_override_cents ?? fee),
    finalDue: due,
    finalScheduledAt: job?.scheduled_at ?? null,
    terms: agreement.terms_text,
  };
}

export async function generateServiceVisits() {
  const { data, error } = await canesDb().rpc("generate_canes_service_visits");
  if (error)
    throw new Error("Recurring service scheduling could not complete.");
  return { scheduled: new Set((data ?? []) as string[]).size };
}

export async function reviewServicePayments(deadlineAt: number) {
  const { data, error } = await canesDb()
    .from("invoices")
    .select("id,number,job_id,square_invoice_id,status")
    .not("service_autopay_authorization_id", "is", null)
    .not("square_invoice_id", "is", null)
    .in("status", ["draft", "sent", "viewed"])
    .order("updated_at")
    .limit(10);
  if (error) throw new Error("Recurring payments could not be checked.");
  let issues = 0;
  for (const invoice of data ?? []) {
    if (Date.now() + 8500 > deadlineAt) break;
    const response = await fetch(
      `${SQUARE_API_BASE}/v2/invoices/${encodeURIComponent(invoice.square_invoice_id)}`,
      {
        headers: squareHeaders(),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      },
    );
    if (!response.ok) continue;
    const body = (await response.json()) as {
      invoice?: {
        status?: string;
        payment_requests?: { automatic_payment_source?: string }[];
      };
    };
    if (body.invoice) {
      const eventId = `service-poll:${invoice.id}:${createHash("sha256").update(JSON.stringify(body.invoice)).digest("hex").slice(0, 24)}`;
      const payload = {
        event_id: eventId,
        type: "invoice.updated",
        data: { object: { invoice: body.invoice } },
      };
      const event = parseSquareEvent(payload);
      if (event?.paid) await handleSquarePaymentEvent(event, payload);
    }
    if (["PAID", "REFUNDED", "CANCELED"].includes(body.invoice?.status ?? ""))
      continue;
    if (
      body.invoice?.status === "FAILED" ||
      body.invoice?.payment_requests?.every(
        (request) => request.automatic_payment_source === "NONE",
      )
    ) {
      const notice =
        "The automatic card payment was not collected. Use the existing Square payment link or contact Canes; no second automatic charge was started.";
      const { data: changed } = await canesDb()
        .from("invoices")
        .update({
          service_payment_issue: notice,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id)
        .is("service_payment_issue", null)
        .neq("status", "paid")
        .select("id");
      if (changed?.length) {
        issues++;
        await pushPaymentIssue({
          eventId: `service-card-recovery:${invoice.id}`,
          invoiceId: invoice.id,
          jobId: invoice.job_id ?? undefined,
          title: "Recurring card payment needs attention",
          detail: `${invoice.number} needs customer payment through its existing Square link.`,
        });
      }
    }
  }
  return { issues };
}

export async function verifyFirstRepeatPayment(
  agreementId: string,
): Promise<boolean> {
  const { data: occurrences, error } = await canesDb()
    .from("canes_service_occurrences")
    .select("invoice_id")
    .eq("agreement_id", agreementId)
    .not("completed_at", "is", null);
  if (error) return false;
  for (const occurrence of occurrences ?? []) {
    if (!occurrence.invoice_id) continue;
    const { data: invoice, error: invoiceError } = await canesDb()
      .from("invoices")
      .select("id,square_invoice_id,status")
      .eq("id", occurrence.invoice_id)
      .maybeSingle();
    if (invoiceError) return false;
    if (!invoice?.square_invoice_id) continue;
    try {
      const response = await fetch(
        `${SQUARE_API_BASE}/v2/invoices/${encodeURIComponent(invoice.square_invoice_id)}`,
        {
          headers: squareHeaders(),
          signal: AbortSignal.timeout(8000),
          cache: "no-store",
        },
      );
      if (!response.ok) return false;
      const body = (await response.json()) as {
        invoice?: Record<string, unknown>;
      };
      if (!body.invoice) return false;
      const payload = {
        event_id: `service-cancel-check:${invoice.id}:${createHash("sha256").update(JSON.stringify(body.invoice)).digest("hex").slice(0, 24)}`,
        type: "invoice.updated",
        data: { object: { invoice: body.invoice } },
      };
      const event = parseSquareEvent(payload);
      if (event?.paid) {
        const result = await handleSquarePaymentEvent(event, payload);
        if (["retryable_error", "amount_mismatch"].includes(result.handled))
          return false;
      }
      if (body.invoice.status === "PAYMENT_PENDING") return false;
      if (
        body.invoice.status !== "PAID" &&
        Array.isArray(body.invoice.payment_requests) &&
        body.invoice.payment_requests.some(
          (request: { automatic_payment_source?: string }) =>
            request.automatic_payment_source === "CARD_ON_FILE",
        )
      )
        return false;
      if (body.invoice.status === "PAID") {
        const { data: current } = await canesDb()
          .from("invoices")
          .select("status")
          .eq("id", invoice.id)
          .maybeSingle();
        if (current?.status !== "paid") return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}
