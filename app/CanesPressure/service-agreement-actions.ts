"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  isServiceArea,
  recurringServiceEligible,
  serviceAreaScheduleNotice,
  type ServiceArea,
} from "@urso/types";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { denyUnlessPermitted } from "@/lib/canes/access";
import { getAdminSession } from "@/lib/urso-auth";
import { getJob } from "@/lib/canes/estimates";
import { getInvoice } from "@/lib/canes/invoices";
import {
  cancellationHash,
  generateServiceVisits,
  verifyFirstRepeatPayment,
  type AgreementRow,
} from "@/lib/canes/service-agreements";
import { squareCardConfiguration } from "@/lib/canes/square-cards";
import { publishServiceInvoice } from "@/lib/canes/service-billing";
import { isDateKey, todayEtKey } from "@/lib/canes/recurring";
import { sendMessage } from "./actions";

type Result = { ok: boolean; notice?: string; url?: string };
async function guard() {
  return !canesConfigured()
    ? { ok: false, notice: "Demo mode: nothing was saved." }
    : denyUnlessPermitted();
}
const refresh = () => revalidatePath("/CanesPressure", "layout");

export async function enableServiceOffers(input: {
  invoiceId: string;
  serviceDate: string;
  crewId: string | null;
  durations: Record<string, number>;
  enabled: boolean;
}): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;
  if (
    typeof input.enabled !== "boolean" ||
    !isDateKey(input.serviceDate) ||
    input.serviceDate > todayEtKey() ||
    !input.durations ||
    typeof input.durations !== "object" ||
    Object.values(input.durations).some(
      (minutes) => !Number.isInteger(minutes) || minutes < 15 || minutes > 720,
    )
  )
    return {
      ok: false,
      notice:
        "Confirm the actual service date and durations of 15–720 minutes.",
    };
  const invoice = await getInvoice(input.invoiceId);
  const { data: lines } = await canesDb()
    .from("invoice_items")
    .select("service_category")
    .eq("invoice_id", input.invoiceId);
  if (
    input.enabled &&
    (!invoice ||
      !(lines ?? []).some((line) =>
        recurringServiceEligible(line.service_category),
      ))
  )
    return {
      ok: false,
      notice: "Classify an eligible service before enabling an offer.",
    };
  if (input.enabled && !(await squareCardConfiguration()))
    return {
      ok: false,
      notice:
        "Verified Square card setup is not available. Check the payment configuration first.",
    };
  const { data, error } = await canesDb()
    .from("invoices")
    .update({
      service_offers_enabled: input.enabled,
      service_date: input.serviceDate,
      service_offer_crew_id: input.crewId,
      service_offer_durations: input.durations,
    })
    .eq("id", input.invoiceId)
    .in("status", ["draft", "sent", "viewed"])
    .is("service_autopay_authorization_id", null)
    .select("public_token")
    .maybeSingle();
  if (error || !data)
    return {
      ok: false,
      notice:
        "Only an unpaid invoice without an accepted enrollment can have its offer changed.",
    };
  refresh();
  return {
    ok: true,
    notice: input.enabled
      ? "Recurring offer enabled. Share the customer link or send the invoice."
      : "Offer disabled.",
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws"}/CanesPressure/enroll/${data.public_token}`,
  };
}
export async function configureServiceAgreement(input: {
  id: string;
  area: ServiceArea | null;
  crewId: string | null;
  durationMinutes: number;
}): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;
  if (
    (input.area !== null && !isServiceArea(input.area)) ||
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 15 ||
    input.durationMinutes > 720
  )
    return {
      ok: false,
      notice: "Choose a valid area and duration of 15–720 minutes.",
    };
  const { data, error } = await canesDb()
    .from("canes_service_agreements")
    .update({
      service_area: input.area,
      crew_id: input.crewId,
      duration_minutes: input.durationMinutes,
    })
    .eq("id", input.id)
    .neq("state", "canceled")
    .select("id")
    .maybeSingle();
  if (error || !data)
    return {
      ok: false,
      notice: "This agreement is closed or could not be updated.",
    };
  try {
    await generateServiceVisits();
  } catch {
    refresh();
    return {
      ok: true,
      notice: "Setup saved. Scheduling will retry on the next automation run.",
    };
  }
  refresh();
  return {
    ok: true,
    notice:
      "Setup saved for unscheduled and future visits. Existing appointments stay in place.",
  };
}
export async function saveCrewAvailability(input: {
  crewId: string;
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  travelBufferMinutes: number;
}): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;
  if (
    !Array.isArray(input.weekdays) ||
    !input.weekdays.length ||
    input.weekdays.some(
      (day) => !Number.isInteger(day) || day < 0 || day > 6,
    ) ||
    ![input.startMinute, input.endMinute, input.travelBufferMinutes].every(
      Number.isInteger,
    ) ||
    input.startMinute < 0 ||
    input.endMinute > 1440 ||
    input.endMinute <= input.startMinute ||
    input.travelBufferMinutes < 0 ||
    input.travelBufferMinutes > 180
  )
    return {
      ok: false,
      notice:
        "Choose working days, hours and a travel buffer of 0–180 minutes.",
    };
  const { error } = await canesDb()
    .from("canes_crew_availability")
    .upsert(
      {
        crew_id: input.crewId,
        weekdays: [...new Set(input.weekdays)],
        start_minute: input.startMinute,
        end_minute: input.endMinute,
        travel_buffer_minutes: input.travelBufferMinutes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "crew_id" },
    );
  if (error)
    return { ok: false, notice: "Crew availability could not be saved." };
  try {
    await generateServiceVisits();
  } catch {
    refresh();
    return {
      ok: true,
      notice:
        "Availability saved. Unscheduled visits will be checked on the next automation run.",
    };
  }
  refresh();
  return {
    ok: true,
    notice:
      "Availability saved. Sunday remains available only for manual scheduling.",
  };
}
export async function setServiceCancellationFee(input: {
  agreementId: string;
  amountCents: number;
  reason: string;
}): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;
  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents < 0 ||
    typeof input.reason !== "string" ||
    !input.reason.trim() ||
    input.reason.length > 2000
  )
    return {
      ok: false,
      notice: "Enter the reduced fee and an audit reason. Enter 0 to waive it.",
    };
  const actor = (await getAdminSession())!.email;
  const { error } = await canesDb().rpc("waive_canes_service_fee", {
    p_agreement: input.agreementId,
    p_fee: input.amountCents,
    p_reason: input.reason.trim(),
    p_actor: actor,
  });
  if (error) return { ok: false, notice: error.message };
  refresh();
  return {
    ok: true,
    notice:
      "Cancellation fee updated. The customer sees the revised amount before confirming.",
  };
}
export async function createServiceCancellationLink(
  agreementId: string,
  sendText = false,
): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;
  const db = canesDb();
  const { data, error } = await db
    .from("canes_service_agreements")
    .select("*")
    .eq("id", agreementId)
    .not("activated_at", "is", null)
    .neq("state", "canceled")
    .maybeSingle();
  if (error || !data)
    return {
      ok: false,
      notice:
        "Choose an active agreement. Pending enrollment needs payment review first.",
    };
  const agreement = data as AgreementRow;
  const { data: setting } = await db
    .from("settings")
    .select("value")
    .eq("key", "service_cancellation_link_hours")
    .maybeSingle();
  const hours = Math.max(1, Math.min(168, Number(setting?.value) || 72));
  const token = randomBytes(32).toString("base64url"),
    expires = new Date(Date.now() + hours * 3600000).toISOString();
  const { error: write } = await db
    .from("canes_service_agreements")
    .update({
      cancellation_token_hash: cancellationHash(token),
      cancellation_token_expires_at: expires,
    })
    .eq("id", agreement.id);
  if (write)
    return { ok: false, notice: "The cancellation link could not be created." };
  // The fragment is omitted from HTTP requests and referrer headers.
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws"}/CanesPressure/cancel#token=${token}`;
  await db
    .from("canes_service_agreement_events")
    .insert({
      agreement_id: agreement.id,
      actor: (await getAdminSession())!.email,
      kind: "cancellation_link_issued",
      detail: { expires_at: expires },
    });
  if (sendText) {
    if (!agreement.customer_phone)
      return {
        ok: true,
        url,
        notice:
          "Link created. This customer has no phone; copy the link to share it.",
      };
    const sent = await sendMessage(
      agreement.customer_phone,
      `Hi ${agreement.customer_name.split(" ")[0]}, here’s your Canes Pressure Washing link to manage cancellation of ${agreement.service_name}: ${url}. The page shows both options and any amount due before you confirm.`,
    );
    if (!sent.ok)
      return {
        ok: true,
        url,
        notice: `Link created, but the text was not sent. ${sent.notice ?? "Copy the link to share it."}`,
      };
  }
  refresh();
  return {
    ok: true,
    url,
    notice: `${sendText ? "Cancellation link sent" : "Cancellation link created"}. It expires in ${hours} hours and replaces any earlier link.`,
  };
}
export async function finalizeServiceInvoice(
  invoiceId: string,
): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;
  const invoice = await getInvoice(invoiceId);
  const actor = (await getAdminSession())!.email;
  if (
    invoice?.service_autopay_kind === "cancellation" &&
    !invoice.service_autopay_finalized_at
  ) {
    const { data: agreement } = await canesDb()
      .from("canes_service_agreements")
      .select("id")
      .eq("cancellation_invoice_id", invoiceId)
      .maybeSingle();
    if (!agreement || !(await verifyFirstRepeatPayment(agreement.id)))
      return {
        ok: false,
        notice:
          "The earlier service payment is still unresolved. The cancellation charge remains paused.",
      };
    const resolved = await canesDb().rpc("review_canes_cancellation_invoice", {
      p_invoice: invoiceId,
      p_actor: actor,
    });
    if (resolved.error) return { ok: false, notice: resolved.error.message };
    if (resolved.data === "void") {
      refresh();
      return {
        ok: true,
        notice:
          "The first repeat was paid. The cancellation fee was voided without charging.",
      };
    }
  }
  const { error } = await canesDb().rpc("finalize_canes_service_invoice", {
    p_invoice: invoiceId,
    p_actor: actor,
  });
  if (error) return { ok: false, notice: error.message };
  try {
    const result = await publishServiceInvoice(invoiceId);
    refresh();
    return {
      ...result,
      ...(result.hostedUrl ? { url: result.hostedUrl } : {}),
    };
  } catch (error) {
    refresh();
    return {
      ok: false,
      notice:
        error instanceof Error
          ? error.message
          : "The accepted invoice is finalized, but payment needs review.",
    };
  }
}
export async function scheduleServiceOccurrence(input: {
  occurrenceId: string;
  scheduledAt: string;
  crewId: string;
  durationMinutes: number;
}): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;
  if (
    typeof input.scheduledAt !== "string" ||
    !Number.isFinite(Date.parse(input.scheduledAt)) ||
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 15 ||
    input.durationMinutes > 720
  )
    return {
      ok: false,
      notice: "Choose a valid future appointment, crew and duration.",
    };
  const { data, error } = await canesDb().rpc(
    "manually_schedule_canes_service",
    {
      p_occurrence: input.occurrenceId,
      p_slot: input.scheduledAt,
      p_crew: input.crewId,
      p_duration: input.durationMinutes,
      p_actor: (await getAdminSession())!.email,
    },
  );
  if (error) return { ok: false, notice: error.message };
  const job = await getJob(data);
  refresh();
  return {
    ok: true,
    notice:
      serviceAreaScheduleNotice(job?.service_area, input.scheduledAt) ??
      "Visit scheduled. The contractual due date is unchanged.",
    url: `/CanesPressure/jobs/${data}`,
  };
}
