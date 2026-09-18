"use server";
import { revalidatePath } from "next/cache";
import { denyUnlessPermitted } from "@/lib/canes/access";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getPlan, isDateKey, isPlanCadence } from "@/lib/canes/recurring";
import { getJob, getJobByEstimateId } from "@/lib/canes/estimates";
import { ET, type PlanCadence } from "@urso/types";

export async function configureRepeatSchedule(
  id: string,
  input: {
    startsOn: string;
    repeatTime: string;
    cadence: PlanCadence;
    durationMinutes: number;
    crewId: string | null;
  },
) {
  if (!canesConfigured())
    return { ok: false, notice: "Demo mode: nothing was saved." };
  const denied =
    (await denyUnlessPermitted("schedule")) ??
    (await denyUnlessPermitted("estimates"));
  if (denied) return denied;
  if (
    !isDateKey(input.startsOn) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.repeatTime) ||
    !isPlanCadence(input.cadence) ||
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 15 ||
    input.durationMinutes > 1440
  )
    return {
      ok: false,
      notice:
        "Choose a valid repeat date, Eastern time, duration, and cadence.",
    };
  const { data, error } = await canesDb().rpc("configure_canes_repeat", {
    p_id: id,
    p_date: input.startsOn,
    p_time: input.repeatTime,
    p_cadence: input.cadence,
    p_duration: input.durationMinutes,
    p_crew: input.crewId,
  });
  if (error || data !== "saved")
    return {
      ok: false,
      notice:
        "The repeat schedule could not be changed. Choose a future time and an active crew.",
    };
  revalidatePath("/CanesPressure", "layout");
  return {
    ok: true,
    notice:
      "Upcoming visits and the future repeat schedule were updated. Check any marked crew overlaps.",
  };
}

export async function moveThisAndFuture(
  jobId: string,
  iso: string,
  durationMinutes: number,
  crewId: string | null,
) {
  const denied = await denyUnlessPermitted("schedule");
  if (denied) return denied;
  const job = await getJob(jobId);
  if (!job?.plan_id)
    return {
      ok: false,
      notice: "This work order does not belong to a repeat schedule.",
    };
  const plan = await getPlan(job.plan_id);
  if (!plan) return { ok: false, notice: "Repeat schedule not found." };
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime()))
    return { ok: false, notice: "Choose a valid appointment time." };
  const startsOn = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const repeatTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: ET,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return configureRepeatSchedule(plan.id, {
    startsOn,
    repeatTime,
    durationMinutes,
    crewId,
    cadence: plan.cadence,
  });
}

export async function repeatSourceDefaults(
  kind: "estimate" | "job" | "invoice",
  id: string,
) {
  const denied =
    (await denyUnlessPermitted("schedule")) ??
    (await denyUnlessPermitted("estimates"));
  if (denied) return denied;
  if (kind === "invoice") {
    const denied = await denyUnlessPermitted("invoices");
    if (denied) return denied;
  }
  const { getInvoice } = await import("@/lib/canes/invoices");
  const invoice = kind === "invoice" ? await getInvoice(id) : null;
  const job =
    kind === "job"
      ? await getJob(id)
      : kind === "estimate"
        ? await getJobByEstimateId(id)
        : invoice?.job_id
          ? await getJob(invoice.job_id)
          : null;
  const date = job?.scheduled_at ? new Date(job.scheduled_at) : new Date();
  return {
    ok: true as const,
    data: {
      linked: !!job?.scheduled_at,
      startsOn: new Intl.DateTimeFormat("en-CA", {
        timeZone: ET,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date),
      repeatTime: job?.scheduled_at
        ? new Intl.DateTimeFormat("en-GB", {
            timeZone: ET,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          }).format(date)
        : "08:00",
    },
  };
}
