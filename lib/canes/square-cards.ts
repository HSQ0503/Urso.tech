import type { Invoice } from "@urso/types";
import { canesDb, squarePaymentsReady } from "./supabase";
import { SQUARE_API_BASE, SQUARE_ENV, squareHeaders } from "./square-config";

type Card = {
  id: string;
  customer_id: string;
  enabled: boolean;
  card_brand?: string;
  last_4?: string;
  reference_id?: string;
};
export type ServiceEnrollment = {
  id: string;
  invoice_id: string;
  state: "preparing" | "card_ready" | "applied" | "needs_review";
  square_customer_id: string | null;
  customer_name: string;
  customer_email: string;
  choices: {
    service_line_id: string;
    months: number;
    original_net_cents: number;
    saving_cents: number;
    recurring_cents: number;
  }[];
  snapshot: { invoice: Invoice };
  fingerprint: string;
  terms_text: string;
  terms_version: string;
};
async function square<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${SQUARE_API_BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: squareHeaders(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      "Square could not verify card setup. No recurring visit has been activated. Please retry this enrollment or contact Canes.",
    );
  return response.json() as Promise<T>;
}
let applicationId: string | null = null;
export async function squareCardConfiguration(): Promise<{
  applicationId: string;
  locationId: string;
  scriptUrl: string;
} | null> {
  if (!squarePaymentsReady()) return null;
  applicationId ??= process.env.CANES_SQUARE_APPLICATION_ID ?? null;
  if (!applicationId) {
    try {
      applicationId =
        (await square<{ client_id?: string }>("/oauth2/token/status", {}))
          .client_id ?? null;
    } catch {
      return null;
    }
  }
  if (!applicationId) return null;
  return {
    applicationId,
    locationId: process.env.CANES_SQUARE_LOCATION_ID!,
    scriptUrl:
      SQUARE_ENV === "sandbox"
        ? "https://sandbox.web.squarecdn.com/v1/square.js"
        : "https://web.squarecdn.com/v1/square.js",
  };
}

export async function saveEnrollmentCard(
  enrollment: ServiceEnrollment,
  sourceId: string,
): Promise<void> {
  if (enrollment.state === "applied") return;
  const db = canesDb();
  let customerId = enrollment.square_customer_id;
  if (!customerId) {
    const [givenName, ...familyName] = enrollment.customer_name.split(/\s+/);
    const response = await square<{ customer?: { id?: string } }>(
      "/v2/customers",
      {
        idempotency_key: `c:${enrollment.id}`,
        given_name: givenName,
        family_name: familyName.join(" ") || undefined,
        email_address: enrollment.customer_email,
        reference_id: enrollment.id,
      },
    );
    customerId = response.customer?.id ?? null;
    if (!customerId)
      throw new Error("Card setup could not establish the customer profile.");
    const { error } = await db
      .from("canes_service_enrollments")
      .update({ square_customer_id: customerId })
      .eq("id", enrollment.id);
    if (error)
      throw new Error(
        "Card setup is still being recorded. Retry the same enrollment.",
      );
  }
  // A lost CreateCard response is recovered by reference, before another nonce
  // is considered. Card tokens never enter our database or application logs.
  const found = await square<{ cards?: Card[] }>(
    `/v2/cards?customer_id=${encodeURIComponent(customerId)}&reference_id=${encodeURIComponent(enrollment.id)}&include_disabled=true`,
  );
  let card = found.cards?.find(
    (card) =>
      card.reference_id === enrollment.id && card.customer_id === customerId,
  );
  if (!card) {
    if (
      typeof sourceId !== "string" ||
      sourceId.length < 5 ||
      sourceId.length > 16384
    )
      throw new Error("Enter and verify your card before accepting.");
    card = (
      await square<{ card?: Card }>("/v2/cards", {
        idempotency_key: `card:${enrollment.id}`,
        source_id: sourceId,
        card: {
          customer_id: customerId,
          cardholder_name: enrollment.customer_name,
          reference_id: enrollment.id,
        },
      })
    ).card;
  }
  if (!card?.id)
    throw new Error(
      "Square did not confirm the saved card. No service is active.",
    );
  const verified = (
    await square<{ card?: Card }>(`/v2/cards/${encodeURIComponent(card.id)}`)
  ).card;
  if (
    !verified?.enabled ||
    verified.customer_id !== customerId ||
    verified.reference_id !== enrollment.id
  )
    throw new Error(
      "The stored card could not be verified for this enrollment.",
    );
  const { error } = await db.from("canes_card_authorizations").upsert(
    {
      enrollment_id: enrollment.id,
      square_customer_id: customerId,
      square_card_id: verified.id,
      card_brand: verified.card_brand ?? null,
      card_last4: verified.last_4 ?? null,
      verified_at: new Date().toISOString(),
      accepted_name: enrollment.customer_name,
      terms_text: enrollment.terms_text,
      terms_version: enrollment.terms_version,
      acceptance_snapshot: {
        ...enrollment.snapshot,
        choices: enrollment.choices,
        customer_email: enrollment.customer_email,
      },
    },
    { onConflict: "enrollment_id", ignoreDuplicates: true },
  );
  if (error)
    throw new Error(
      "Your card was saved by Square but its authorization is still being recorded. Retry the same enrollment.",
    );
  const { data: stateChanged, error: stateError } = await db
    .from("canes_service_enrollments")
    .update({ state: "card_ready" })
    .eq("id", enrollment.id)
    .in("state", ["preparing", "card_ready"])
    .select("id")
    .maybeSingle();
  if (stateError || !stateChanged)
    throw new Error("Card setup is being recorded. Retry the same enrollment.");
}

export async function invoiceCardAuthorization(
  invoice: Invoice,
): Promise<{ customerId: string; cardId: string } | null> {
  if (invoice.service_visit && !invoice.service_autopay_finalized_at)
    throw new Error(
      "Complete the visit and finalize its agreed service lines before billing.",
    );
  if (!invoice.service_autopay_authorization_id) return null;
  if (!invoice.service_autopay_finalized_at || !invoice.customer_email)
    throw new Error(
      "A finalized invoice, email and accepted card authorization are required.",
    );
  const { data, error } = await canesDb()
    .from("canes_card_authorizations")
    .select("square_customer_id,square_card_id,revoked_at,verified_at")
    .eq("id", invoice.service_autopay_authorization_id)
    .maybeSingle();
  if (error || !data || data.revoked_at || !data.verified_at)
    throw new Error("This invoice’s payment authorization needs review.");
  return { customerId: data.square_customer_id, cardId: data.square_card_id };
}
