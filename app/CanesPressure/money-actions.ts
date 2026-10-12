"use server";

import { revalidatePath } from "next/cache";
import type { MoneyMutation } from "@urso/types";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { denyUnlessPermitted } from "@/lib/canes/access";
import { getAdminSession } from "@/lib/urso-auth";
import { isDateKey, todayEtKey } from "@/lib/canes/recurring";
import { reconcileWorkerCommissions } from "@/lib/canes/money";

const cents = (value: number) =>
  Number.isSafeInteger(value) && Math.abs(value) <= 2_147_483_647;
const request = (value: string) =>
  typeof value === "string" && /^[\w-]{8,160}$/.test(value);
const reason = (value: string) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 2000;
const pastDate = (value: string) => isDateKey(value) && value <= todayEtKey();

export async function mutateMoney(
  input: MoneyMutation,
): Promise<{ ok: boolean; notice?: string }> {
  if (!canesConfigured())
    return { ok: false, notice: "Demo mode: nothing was saved." };
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  const actor = (await getAdminSession())?.email;
  if (!actor) return { ok: false, notice: "Owner access required." };
  const db = canesDb();
  try {
    switch (input.action) {
      case "rate": {
        if (
          !isDateKey(input.effectiveOn) ||
          !cents(input.hourlyCents) ||
          input.hourlyCents < 0 ||
          !Number.isInteger(input.commissionBps) ||
          input.commissionBps < 0 ||
          input.commissionBps > 10000
        )
          throw new Error(
            "Enter an effective date, hourly rate and commission from 0–100%.",
          );
        const { error } = await db
          .from("canes_worker_rates")
          .insert({
            employee_id: input.employeeId,
            effective_on: input.effectiveOn,
            hourly_cents: input.hourlyCents,
            commission_bps: input.commissionBps,
            created_by: actor,
          });
        if (error)
          throw new Error(
            error.code === "23505"
              ? "A rate already exists on that date. Choose a new effective date; approved wages retain their original rate."
              : "The worker rate could not be saved.",
          );
        break;
      }
      case "approveTime": {
        if (
          !pastDate(input.date) ||
          !Number.isInteger(input.minutes) ||
          input.minutes < 1 ||
          input.minutes > 1440 ||
          !reason(input.reason) ||
          !request(input.requestKey)
        )
          throw new Error(
            "Enter completed work, 1–1,440 minutes, and an approval reason.",
          );
        const { error } = await db.rpc("approve_canes_worker_time", {
          p_employee: input.employeeId,
          p_job: input.jobId,
          p_date: input.date,
          p_minutes: input.minutes,
          p_entry: input.entryId ?? null,
          p_reason: input.reason,
          p_actor: actor,
          p_request: input.requestKey,
        });
        if (error) throw new Error(error.message);
        break;
      }
      case "adjustment": {
        if (
          !pastDate(input.date) ||
          !cents(input.amountCents) ||
          !input.amountCents ||
          !reason(input.reason) ||
          !request(input.requestKey)
        )
          throw new Error(
            "Enter an adjustment date, signed amount, and reason.",
          );
        const { error } = await db.rpc("record_canes_worker_adjustment", {
          p_employee: input.employeeId,
          p_job: input.jobId ?? null,
          p_date: input.date,
          p_amount: input.amountCents,
          p_reason: input.reason,
          p_actor: actor,
          p_request: input.requestKey,
        });
        if (error) throw new Error(error.message);
        break;
      }
      case "upsell": {
        if (
          !cents(input.additionalCents) ||
          input.additionalCents <= 0 ||
          !reason(input.reason)
        )
          throw new Error(
            "Enter the approved additional service amount and reason.",
          );
        const { error } = await db.rpc("approve_canes_upsell", {
          p_employee: input.employeeId,
          p_invoice: input.invoiceId,
          p_line: input.serviceLineId,
          p_additional: input.additionalCents,
          p_reason: input.reason,
          p_actor: actor,
        });
        if (error) throw new Error(error.message);
        try {
          await reconcileWorkerCommissions();
        } catch {
          return {
            ok: true,
            notice:
              "Upsell approved. Commission will update after payment reconciliation.",
          };
        }
        break;
      }
      case "spend": {
        if (
          !pastDate(input.date) ||
          !cents(input.amountCents) ||
          input.amountCents <= 0 ||
          !reason(input.note) ||
          !request(input.requestKey)
        )
          throw new Error("Enter a paid spend date, amount, and description.");
        const { data: channel } = await db
          .from("canes_marketing_channels")
          .select("name")
          .eq("id", input.channelId)
          .eq("active", true)
          .maybeSingle();
        if (!channel) throw new Error("Choose an active marketing channel.");
        const { error } = await db.rpc("record_canes_marketing_spend", {
          p_channel: input.channelId,
          p_date: input.date,
          p_amount: input.amountCents,
          p_note: input.note.trim(),
          p_request: input.requestKey,
        });
        if (error) throw new Error(error.message);
        break;
      }
      case "channel": {
        if (!reason(input.name) || input.name.length > 80)
          throw new Error("Enter a channel name up to 80 characters.");
        const { error } = await db
          .from("canes_marketing_channels")
          .insert({ name: input.name.trim() });
        if (error)
          throw new Error(
            error.code === "23505"
              ? "That channel already exists."
              : "The channel could not be saved.",
          );
        break;
      }
      case "attribution": {
        const { error } = await db.rpc("set_canes_job_marketing_channel", {
          p_job: input.jobId,
          p_channel: input.channelId,
          p_actor: actor,
        });
        if (error) throw new Error(error.message);
        break;
      }
      case "paymentMethod": {
        if (
          ![
            "cash",
            "card",
            "check",
            "bank",
            "zelle",
            "venmo",
            "other",
          ].includes(input.method)
        )
          throw new Error("Choose a payment method.");
        const { data, error } = await db
          .from("payments")
          .update({ method_detail: input.method })
          .eq("id", input.paymentId)
          .is("square_payment_id", null)
          .select("id")
          .maybeSingle();
        if (error || !data)
          throw new Error(
            "Only a manual payment can be reclassified. Square payments remain Card.",
          );
        break;
      }
      case "serviceDate": {
        if (!pastDate(input.date))
          throw new Error("Choose the date the service was completed.");
        const { error } = await db.rpc("set_canes_completed_service_date", {
          p_job: input.jobId,
          p_date: input.date,
        });
        if (error) throw new Error(error.message);
        break;
      }
      case "cost": {
        if (input.paidOn !== null && !pastDate(input.paidOn))
          throw new Error("Choose the date this cost was actually paid.");
        const { error } = await db.rpc("classify_canes_job_cost", {
          p_cost: input.costId,
          p_line: input.serviceLineId,
          p_paid: input.paidOn,
        });
        if (error) throw new Error(error.message);
        break;
      }
      default:
        return { ok: false, notice: "Choose a valid money action." };
    }
    revalidatePath("/CanesPressure", "layout");
    return { ok: true, notice: "Saved." };
  } catch (error) {
    return {
      ok: false,
      notice:
        error instanceof Error
          ? error.message
          : "The change could not be saved.",
    };
  }
}
