import { NextRequest, NextResponse } from "next/server";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getAgenda, getLead, getOverview, getSettings } from "@/lib/canes/data";
import { getEstimate, getJob, getScheduleBoard } from "@/lib/canes/estimates";
import { getInvoice, invoicePublicUrl } from "@/lib/canes/invoices";
import {
  alertOwner,
  fillTemplate,
  isOptOut,
  nextAllowedSendTime,
  sendCanesSms,
} from "@/lib/canes/twilio";
import { notifyColdEscalation, notifyUnconfirmed, renderDigestHtml, sendDigestEmail } from "@/lib/canes/notify";
import {
  logLeadEvent,
  looksLikeScheduleRequest,
  upsertConfirmationTask,
} from "@/lib/canes/inbound";
import { PRACTICE_PHONE } from "@/lib/canes/tour";
import { sweepStalePractice } from "@/app/CanesPressure/components/tour/practice";
import { ET, etLocalToIso, fmtEt, fmtPhone, minutesSince } from "@/lib/canes/types";
import {
  pushDailyFollowupSummary,
  pushCustomerMessage,
  pushMorningRunSheet,
  pushNewLead,
} from "@/lib/canes/push-events";
import {
  drainCanesPushOutbox,
  enqueueCanesPushBatch,
  processCanesPushReceipts,
  type CanesPush,
} from "@/lib/canes/push";
import { drainPaymentEmailTasks } from "@/lib/canes/payment-notifications";
import { reconcileLegacySquarePaymentHistory } from "@/lib/canes/square";
import type { AutomationTask, Estimate, Lead } from "@/lib/canes/types";

// The Canes automation heartbeat, hit by Vercel cron every 5 minutes
// (vercel.json). Drains the task outbox, escalates cold leads and unconfirmed
// appointments, nags about stale follow-ups, and sends the 7am ET digest.
// Every send is idempotent through the tasks table's unique dedupe_key, so
// overlapping or retried runs never double-text anyone.
// Auth mirrors /api/franpos/sync: Vercel sends `Authorization: Bearer
// ${CRON_SECRET}` automatically; manual runs can pass ?secret= instead.
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";
const MIN_CRON_SECTION_MS = 1_500;
const PUSH_CRON_RESERVE_MS = 27_000;
const PUSH_RECEIPT_RESERVE_MS = 13_000;
const MISSED_CALL_ACTIVITY_GRACE_MS = 30_000;
const WEBSITE_REQUEST_ACTIVITY_GRACE_MS = 5_000;

function hasCronBudget(deadlineAt: number, reserveMs = MIN_CRON_SECTION_MS): boolean {
  return Date.now() + reserveMs < deadlineAt;
}

function canonicalTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}

function happenedAfter(value: string, reference: string, graceMs = 0): boolean {
  const valueTime = new Date(value).getTime();
  const referenceTime = new Date(reference).getTime();
  return Number.isFinite(valueTime) &&
    Number.isFinite(referenceTime) &&
    valueTime > referenceTime + graceMs;
}

export async function GET(req: NextRequest) {
  const cronDeadlineAt = Date.now() + 55_000;
  const businessDeadlineAt = cronDeadlineAt - PUSH_CRON_RESERVE_MS;
  const pushOutboxDeadlineAt = cronDeadlineAt - PUSH_RECEIPT_RESERVE_MS;
  const secret = process.env.CRON_SECRET;
  const authorized = secret
    ? req.headers.get("authorization") === `Bearer ${secret}` ||
      req.nextUrl.searchParams.get("secret") === secret
    : process.env.NODE_ENV !== "production"; // no secret set → dev only

  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canesConfigured()) return NextResponse.json({ skipped: true });

  const report: Record<string, unknown> = {};
  const section = async (
    name: string,
    deadlineAt: number,
    fn: () => Promise<unknown>,
  ) => {
    if (!hasCronBudget(deadlineAt)) {
      report[name] = { skipped: "cron deadline" };
      return;
    }
    try {
      report[name] = await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[canes] cron section ${name} failed:`, msg);
      report[name] = { error: msg };
    }
  };

  // Purge an abandoned tour practice sandbox first, so no later section (or
  // the digest) ever reports on stale fake data. Cheap no-op when none exists.
  await section("practice_sweep", businessDeadlineAt, async () => {
    await sweepStalePractice();
    return { checked: true };
  });
  await section("tasks", businessDeadlineAt, () => drainDueTasks(businessDeadlineAt));
  await section("payment_emails", businessDeadlineAt, () =>
    drainPaymentEmailTasks({ deadlineAt: businessDeadlineAt }));
  await section("legacy_square_history", businessDeadlineAt, () =>
    reconcileLegacySquarePaymentHistory(3));
  await section("expire_estimates", businessDeadlineAt, expireEstimates);
  await section("safety_net", businessDeadlineAt, () => confirmationSafetyNet(businessDeadlineAt));
  await section("no_reply", businessDeadlineAt, () => noReplyEscalations(businessDeadlineAt));
  await section("auto_release", businessDeadlineAt, () => autoReleaseUnconfirmed(businessDeadlineAt));
  await section("cold_escalation", businessDeadlineAt, () => coldEscalations(businessDeadlineAt));
  await section("crew_late", businessDeadlineAt, crewLateCheckIns);
  await section("follow_up", businessDeadlineAt, () => followUps(businessDeadlineAt));
  await section("digest", businessDeadlineAt, () => morningDigest(businessDeadlineAt));
  await section("daily_followup_summary", businessDeadlineAt, () =>
    dailyFollowupSummary(businessDeadlineAt));
  await section("notification_repair", businessDeadlineAt, () =>
    repairNotificationOutbox(businessDeadlineAt));

  // Business automation gets a bounded first window. The final 27 seconds are
  // reserved for the push outbox, with the final 13 seconds exclusively for
  // receipt reconciliation, so either queue can make progress every heartbeat.
  await section("push_outbox", pushOutboxDeadlineAt, () =>
    drainCanesPushOutbox({ deadlineAt: pushOutboxDeadlineAt }));
  await section("push_receipts", cronDeadlineAt, () =>
    processCanesPushReceipts({ deadlineAt: cronDeadlineAt }));

  return NextResponse.json(report);
}

// ── Auto-expire: sent/viewed estimates past their expires_at ─────────────────
// Without this sweep a stale quote looks live in the list forever (nothing else
// flips the status — approval merely rejects, and reminders quietly cancel).

async function expireEstimates() {
  const db = canesDb();
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("estimates")
    .update({ status: "expired", updated_at: nowIso })
    .in("status", ["sent", "viewed"])
    .lt("expires_at", nowIso)
    .select("id, number, lead_id");
  if (error) throw new Error(`expireEstimates: ${error.message}`);
  const expired = (data ?? []) as Pick<Estimate, "id" | "number" | "lead_id">[];
  for (const est of expired) {
    if (est.lead_id) {
      await logLeadEvent(est.lead_id, "estimate", `Estimate ${est.number} expired`);
    }
  }
  return { expired: expired.length };
}

// ── Outbox: due hold texts + confirmation texts ──────────────────────────────

async function drainDueTasks(deadlineAt: number) {
  const db = canesDb();
  const settings = await getSettings();

  // Crash recovery: the claim below stamps scheduled_for with the claim time,
  // so a 'sending' row whose scheduled_for is >10 minutes old belongs to a run
  // that died mid-send. Put those back in the queue instead of stranding them.
  await db
    .from("tasks")
    .update({ status: "pending" })
    .eq("status", "sending")
    .lt("scheduled_for", new Date(Date.now() - 10 * 60_000).toISOString());

  const { data } = await db
    .from("tasks")
    .select("*")
    .in("kind", [
      "hold_text",
      "confirmation",
      "confirmation_final",
      "estimate_send",
      "estimate_reminder",
      "job_confirmation",
      "invoice_send",
      "invoice_reminder",
    ])
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(50); // backlog drains across 5-minute runs rather than one long one
  const tasks = (data ?? []) as AutomationTask[];

  let sent = 0;
  let deferred = 0;
  let canceled = 0;
  let failed = 0;
  let contested = 0;
  let stoppedAtDeadline = false;
  const taskDeadlineAt = Math.min(deadlineAt, Date.now() + 18_000);

  for (const task of tasks) {
    if (!hasCronBudget(taskDeadlineAt, 9_000)) {
      stoppedAtDeadline = true;
      break;
    }
    // Atomic claim: exactly one run flips pending → sending; an overlapping
    // run sees zero updated rows and skips, so nobody is double-texted.
    const { data: claimed } = await db
      .from("tasks")
      .update({ status: "sending", scheduled_for: new Date().toISOString() })
      .eq("id", task.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) {
      contested++;
      continue;
    }

    // Estimate texts key off the estimate, not the lead: cancel the moment the
    // quote leaves the sent/viewed window (approved, declined, expired), the
    // estimate is gone, the customer opted out, or there's no number to text.
    const isEstimateTask = task.kind === "estimate_send" || task.kind === "estimate_reminder";
    if (isEstimateTask) {
      const estimateId =
        typeof task.payload?.estimate_id === "string" ? task.payload.estimate_id : null;
      const estimate = estimateId ? await getEstimate(estimateId) : null;
      const optedOut = estimate?.lead_id ? (await getLead(estimate.lead_id))?.opted_out : false;
      const expired =
        !!estimate?.expires_at && new Date(estimate.expires_at).getTime() < Date.now();
      if (
        !estimate ||
        !estimate.customer_phone ||
        optedOut ||
        expired ||
        (estimate.status !== "sent" && estimate.status !== "viewed")
      ) {
        await db.from("tasks").update({ status: "canceled" }).eq("id", task.id);
        canceled++;
        continue;
      }

      const link = `${APP_URL}/CanesPressure/e/${estimate.public_token}`;
      const body =
        task.kind === "estimate_send"
          ? `Here is your estimate: ${link}`
          : `Just following up on your estimate: ${link}`;
      const res = await sendCanesSms({
        to: estimate.customer_phone,
        body,
        leadId: estimate.lead_id,
        automated: true,
      });

      if (res.ok) {
        await db
          .from("tasks")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", task.id);
        if (estimate.lead_id) {
          await logLeadEvent(
            estimate.lead_id,
            "automation",
            task.kind === "estimate_send" ? "Estimate text sent" : "Estimate reminder sent",
          );
        }
        sent++;
      } else if (res.skipped === "quiet_hours") {
        const at = nextAllowedSendTime(settings) ?? new Date(Date.now() + 3_600_000);
        await db
          .from("tasks")
          .update({ status: "pending", scheduled_for: at.toISOString() })
          .eq("id", task.id);
        deferred++;
      } else if (res.skipped) {
        await db.from("tasks").update({ status: "pending" }).eq("id", task.id);
        deferred++;
      } else {
        await db
          .from("tasks")
          .update({ status: "failed", payload: { ...task.payload, error: res.error ?? "send failed" } })
          .eq("id", task.id);
        failed++;
      }
      continue;
    }

    // Invoice texts key off the invoice: cancel the moment it leaves the live
    // window (paid, void), the invoice is gone, the customer opted out, or
    // there's no number to text. Reminders only nag sent/viewed (unpaid) bills.
    const isInvoiceTask = task.kind === "invoice_send" || task.kind === "invoice_reminder";
    if (isInvoiceTask) {
      const invoiceId = typeof task.payload?.invoice_id === "string" ? task.payload.invoice_id : null;
      const invoice = invoiceId ? await getInvoice(invoiceId) : null;
      const snapshottedPhone = typeof task.payload?.to_phone === "string"
        ? task.payload.to_phone
        : null;
      const targetPhone = task.kind === "invoice_send"
        ? snapshottedPhone
        : invoice?.customer_phone ?? null;
      const optedOut = invoice?.lead_id ? (await getLead(invoice.lead_id))?.opted_out : false;
      if (
        !invoice ||
        !targetPhone ||
        optedOut ||
        (invoice.status !== "sent" && invoice.status !== "viewed")
      ) {
        await db.from("tasks").update({ status: "canceled" }).eq("id", task.id);
        canceled++;
        continue;
      }

      const link = invoicePublicUrl(invoice);
      const body =
        task.kind === "invoice_send"
          ? `Here is your invoice from Canes Pressure Washing: ${link}`
          : `Friendly reminder — your invoice from Canes Pressure Washing is still open: ${link}`;
      const res = await sendCanesSms({
        to: targetPhone,
        body,
        leadId: invoice.lead_id,
        automated: true,
      });

      if (res.ok) {
        await db
          .from("tasks")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", task.id);
        if (invoice.lead_id) {
          await logLeadEvent(
            invoice.lead_id,
            "automation",
            task.kind === "invoice_send" ? "Invoice text sent" : "Invoice reminder sent",
          );
        }
        sent++;
      } else if (res.skipped === "quiet_hours") {
        const at = nextAllowedSendTime(settings) ?? new Date(Date.now() + 3_600_000);
        await db
          .from("tasks")
          .update({ status: "pending", scheduled_for: at.toISOString() })
          .eq("id", task.id);
        deferred++;
      } else if (res.skipped) {
        await db.from("tasks").update({ status: "pending" }).eq("id", task.id);
        deferred++;
      } else {
        await db
          .from("tasks")
          .update({ status: "failed", payload: { ...task.payload, error: res.error ?? "send failed" } })
          .eq("id", task.id);
        failed++;
      }
      continue;
    }

    // Day-before job confirmation: text the customer off the snapshotted
    // jobs.customer_phone (no join). Cancel if the job left the live window, its
    // slot moved out from under this task, or there's no phone to text.
    if (task.kind === "job_confirmation") {
      const jobId = typeof task.payload?.job_id === "string" ? task.payload.job_id : null;
      const scheduledAt =
        typeof task.payload?.scheduled_at === "string" ? task.payload.scheduled_at : null;
      const job = jobId ? await getJob(jobId) : null;
      if (
        !job ||
        (job.status !== "scheduled" && job.status !== "confirmed") ||
        !scheduledAt ||
        // Epoch compare, never string: PostgREST serializes timestamptz with
        // "+00:00" while the armed payload stored toISOString()'s "Z" — a
        // strict string compare canceled every confirmation as "slot moved".
        new Date(job.scheduled_at ?? 0).getTime() !== new Date(scheduledAt).getTime()
      ) {
        await db.from("tasks").update({ status: "canceled" }).eq("id", task.id);
        canceled++;
        continue;
      }
      if (!job.customer_phone) {
        await db
          .from("tasks")
          .update({ status: "failed", payload: { ...task.payload, error: "no customer phone" } })
          .eq("id", task.id);
        await alertOwner(
          `Couldn't send the day-before text for ${job.customer_name ?? "a job"} — no phone on file.`,
        );
        failed++;
        continue;
      }
      const body = fillTemplate(settings.job_confirmation_template, {
        name: job.customer_name,
        when: fmtEt(job.scheduled_at),
        address: job.job_address,
      });
      const res = await sendCanesSms({
        to: job.customer_phone,
        body,
        leadId: job.lead_id,
        automated: true,
      });
      if (res.ok) {
        await db
          .from("tasks")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", task.id);
        if (job.lead_id) await logLeadEvent(job.lead_id, "automation", "Job confirmation text sent");
        sent++;
      } else if (res.skipped === "quiet_hours") {
        const at = nextAllowedSendTime(settings) ?? new Date(Date.now() + 3_600_000);
        await db
          .from("tasks")
          .update({ status: "pending", scheduled_for: at.toISOString() })
          .eq("id", task.id);
        deferred++;
      } else if (res.skipped) {
        await db.from("tasks").update({ status: "pending" }).eq("id", task.id);
        deferred++;
      } else {
        await db
          .from("tasks")
          .update({ status: "failed", payload: { ...task.payload, error: res.error ?? "send failed" } })
          .eq("id", task.id);
        failed++;
      }
      continue;
    }

    // Final "confirm or we release your slot" nudge. Reload the lead: if it is
    // no longer awaiting confirmation (confirmed, lost, appointment cleared) or
    // opted out, this text is noise — cancel and send nothing. Otherwise send
    // the same fill as the first confirmation, then page Sebastian the same way
    // no_reply_escalation does so he can chase it before he drives out.
    if (task.kind === "confirmation_final") {
      const lead = task.lead_id ? await getLead(task.lead_id) : null;
      if (
        !lead ||
        !lead.phone ||
        lead.opted_out ||
        lead.status !== "appointment_set" ||
        !lead.appointment_at ||
        // Never send a "confirm or we release your slot" text once the
        // appointment has already passed (late fire, or quiet-hours deferral
        // pushed the send past the appointment) — it would only confuse.
        new Date(lead.appointment_at).getTime() <= Date.now()
      ) {
        await db.from("tasks").update({ status: "canceled" }).eq("id", task.id);
        canceled++;
        continue;
      }
      const body = fillTemplate(settings.confirmation_final_template, {
        name: lead.name,
        when: fmtEt(lead.appointment_at),
        address: lead.address,
      });
      const res = await sendCanesSms({ to: lead.phone, body, leadId: lead.id, automated: true });
      if (res.ok) {
        await db
          .from("tasks")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", task.id);
        await logLeadEvent(lead.id, "automation", "Final confirmation text sent");
        // Owner alerts skip the tour's practice sandbox — its appointment-keyed
        // dedupe keys can't be pre-muzzled at seed time, so guard by phone.
        if (lead.phone !== PRACTICE_PHONE) {
          const when = fmtEt(lead.appointment_at);
          await notifyUnconfirmed(lead, when);
          await alertOwner(
            `Final notice sent to ${lead.name ?? fmtPhone(lead.phone)} for the ${when} estimate ` +
              `(still no YES). Open: ${APP_URL}/CanesPressure/leads/${lead.id}`,
          );
        }
        sent++;
      } else if (res.skipped === "quiet_hours") {
        const at = nextAllowedSendTime(settings) ?? new Date(Date.now() + 3_600_000);
        await db
          .from("tasks")
          .update({ status: "pending", scheduled_for: at.toISOString() })
          .eq("id", task.id);
        deferred++;
      } else if (res.skipped) {
        await db.from("tasks").update({ status: "pending" }).eq("id", task.id);
        deferred++;
      } else {
        await db
          .from("tasks")
          .update({ status: "failed", payload: { ...task.payload, error: res.error ?? "send failed" } })
          .eq("id", task.id);
        failed++;
      }
      continue;
    }

    const lead = task.lead_id ? await getLead(task.lead_id) : null;
    // The moment a lead confirms, wins, loses, or opts out, its queued
    // automated texts are noise — cancel instead of sending.
    if (
      !lead ||
      !lead.phone ||
      lead.opted_out ||
      (task.kind === "confirmation" && (lead.status !== "appointment_set" || !lead.appointment_at)) ||
      (task.kind === "hold_text" && lead.status !== "new")
    ) {
      await db.from("tasks").update({ status: "canceled" }).eq("id", task.id);
      canceled++;
      continue;
    }

    const body =
      task.kind === "hold_text"
        ? fillTemplate(settings.templates.hold_text, { name: lead.name })
        : fillTemplate(settings.templates.confirmation, {
            name: lead.name,
            when: fmtEt(lead.appointment_at),
            address: lead.address,
          });
    const res = await sendCanesSms({ to: lead.phone, body, leadId: lead.id, automated: true });

    if (res.ok) {
      await db
        .from("tasks")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", task.id);
      await logLeadEvent(
        lead.id,
        "automation",
        task.kind === "hold_text" ? "Hold text sent" : "Confirmation text sent",
      );
      if (task.kind === "confirmation" && lead.appointment_at) {
        // No YES by T-minus-3h → escalate to Sebastian before he drives out.
        const appt = new Date(lead.appointment_at);
        const at = new Date(appt.getTime() - 3 * 3_600_000);
        await db.from("tasks").upsert(
          {
            lead_id: lead.id,
            kind: "no_reply_escalation",
            dedupe_key: `no_reply:${lead.id}:${appt.toISOString()}`,
            scheduled_for: (at.getTime() < Date.now() ? new Date() : at).toISOString(),
            status: "pending",
            payload: { appointment_at: appt.toISOString() },
          },
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        );
      }
      sent++;
    } else if (res.skipped === "quiet_hours") {
      const at = nextAllowedSendTime(settings) ?? new Date(Date.now() + 3_600_000);
      await db
        .from("tasks")
        .update({ status: "pending", scheduled_for: at.toISOString() })
        .eq("id", task.id);
      deferred++;
    } else if (res.skipped) {
      // Twilio not configured yet — release the claim for a later run.
      await db.from("tasks").update({ status: "pending" }).eq("id", task.id);
      deferred++;
    } else {
      await db
        .from("tasks")
        .update({ status: "failed", payload: { ...task.payload, error: res.error ?? "send failed" } })
        .eq("id", task.id);
      failed++;
    }
  }
  return { due: tasks.length, sent, deferred, canceled, failed, contested, stoppedAtDeadline };
}

// ── Safety net: appointment_set leads with no confirmation task ──────────────

async function confirmationSafetyNet(deadlineAt: number) {
  const db = canesDb();
  const settings = await getSettings();
  const { data } = await db
    .from("leads")
    .select("*")
    .eq("status", "appointment_set")
    .gt("appointment_at", new Date().toISOString())
    .not("phone", "is", null)
    .limit(200);
  const leads = (data ?? []) as Lead[];
  let created = 0;
  for (const lead of leads) {
    if (!hasCronBudget(deadlineAt, 2_000)) break;
    if (await upsertConfirmationTask(lead, settings)) created++;
  }
  return { checked: leads.length, created };
}

// ── Due no-reply escalations ─────────────────────────────────────────────────

async function noReplyEscalations(deadlineAt: number) {
  const db = canesDb();
  const { data } = await db
    .from("tasks")
    .select("*")
    .eq("kind", "no_reply_escalation")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .limit(50);
  const tasks = (data ?? []) as AutomationTask[];
  let alerted = 0;
  let canceled = 0;
  for (const task of tasks) {
    if (!hasCronBudget(deadlineAt, 10_000)) break;
    const lead = task.lead_id ? await getLead(task.lead_id) : null;
    if (!lead || lead.status !== "appointment_set") {
      await db.from("tasks").update({ status: "canceled" }).eq("id", task.id);
      canceled++;
      continue;
    }
    // Owner alerts skip the tour's practice sandbox (phone guard — the
    // appointment-keyed dedupe key can't be pre-muzzled at seed time). The
    // SMS alert is also contained so a Twilio throw can't leave the task
    // pending and re-send the email every run.
    if (lead.phone !== PRACTICE_PHONE) {
      const when = fmtEt(lead.appointment_at);
      await notifyUnconfirmed(lead, when);
      try {
        await alertOwner(
          `No YES yet from ${lead.name ?? fmtPhone(lead.phone)} for the ${when} estimate. ` +
            `Open: ${APP_URL}/CanesPressure/leads/${lead.id}`,
        );
      } catch (err) {
        console.error(`[canes] no-reply owner alert failed for lead ${lead.id}:`, err);
      }
    }
    await db.from("tasks").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", task.id);
    await logLeadEvent(lead.id, "automation", "Escalated: appointment still unconfirmed");
    alerted++;
  }
  return { due: tasks.length, alerted, canceled };
}

// ── Opt-in auto-release: drop the slot when the estimate visit came and went ──
// with no YES and no reply. Off unless settings.confirmation_auto_release is on.
// Conservative by design: never touches a lead that confirmed or texted back —
// any inbound message on the thread means they engaged, so we leave it for
// Sebastian. Releasing = clear the appointment, drop status back to contacted,
// cancel the now-moot confirmation/final/escalation tasks, and log the reason.

async function autoReleaseUnconfirmed(deadlineAt: number) {
  const settings = await getSettings();
  if (!settings.confirmation_auto_release) return { skipped: "auto-release disabled" };

  const db = canesDb();
  const { data } = await db
    .from("leads")
    .select("*")
    .eq("status", "appointment_set")
    .is("confirmed_at", null)
    .eq("opted_out", false)
    .lt("appointment_at", new Date().toISOString())
    .not("appointment_at", "is", null)
    .limit(200);
  const leads = (data ?? []) as Lead[];
  let released = 0;
  let skipped = 0;

  for (const lead of leads) {
    if (!hasCronBudget(deadlineAt, 2_500)) break;
    // Any inbound text on this lead means the customer engaged — never release.
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", lead.id)
      .eq("direction", "in");
    if ((count ?? 0) > 0) {
      skipped++;
      continue;
    }

    await db
      .from("leads")
      .update({ status: "contacted", appointment_at: null, last_activity_at: new Date().toISOString() })
      .eq("id", lead.id)
      .eq("status", "appointment_set")
      .is("confirmed_at", null);
    await db
      .from("tasks")
      .update({ status: "canceled" })
      .eq("lead_id", lead.id)
      .in("kind", ["confirmation", "confirmation_final", "no_reply_escalation"])
      .eq("status", "pending");
    await logLeadEvent(lead.id, "automation", "Appointment released, no confirmation");
    released++;
  }
  return { candidates: leads.length, released, skipped };
}

// ── Cold leads sitting uncalled (native once at 10m; legacy at 15m/45m) ─────

async function coldEscalations(deadlineAt: number) {
  const db = canesDb();
  const { data, error } = await db
    .from("leads")
    .select("*")
    .eq("type", "cold")
    .eq("status", "new")
    .limit(200);
  if (error) throw new Error(`coldEscalations leads: ${error.message}`);
  const leads = (data ?? []) as Lead[];
  let alerted = 0;
  const errors: string[] = [];
  const nativeEvents: CanesPush[] = leads.flatMap((lead) => {
    const opportunityStartedAt = lead.opportunity_started_at ?? lead.created_at;
    const age = minutesSince(opportunityStartedAt);
    if (age < 10 || lead.phone === PRACTICE_PHONE) return [];
    const person = lead.name?.trim() || (lead.phone ? fmtPhone(lead.phone) : "A customer");
    return [{
      dedupeKey: `lead_uncontacted:${lead.id}:${canonicalTimestamp(opportunityStartedAt)}`,
      audience: { kind: "owner" },
      eventType: "lead_uncontacted",
      urgency: "time_sensitive",
      title: "Lead still waiting",
      body: `${person} has not been contacted after ${Math.max(10, Math.round(age))} minutes.`,
      href: `/(owner)/lead/${lead.id}`,
      entityId: lead.id,
      state: { opportunityStartedAt },
    }];
  });
  const nativePush = await enqueueCanesPushBatch(nativeEvents);
  if (!nativePush.ok) {
    throw new Error(`cold lead push outbox persistence failed for ${nativePush.failed} event(s)`);
  }

  for (const lead of leads) {
    if (!hasCronBudget(deadlineAt, 10_000)) break;
    // SMS consent only gates customer-facing escalations. Sebastian's native
    // internal reminder still fires for an uncontacted lead who texted STOP.
    if (lead.opted_out) continue;
    const opportunityStartedAt = lead.opportunity_started_at ?? lead.created_at;
    const age = minutesSince(opportunityStartedAt);
    const stages = [
      { min: 45, key: `cold_esc:${lead.id}:${opportunityStartedAt}:2` },
      { min: 15, key: `cold_esc:${lead.id}:${opportunityStartedAt}:1` },
    ].filter((s) => age >= s.min);
    if (stages.length === 0) continue;

    // Insert-first: the task row IS the idempotency lock (unique dedupe_key,
    // ON CONFLICT DO NOTHING). Claim every stage the lead has aged past so a
    // lead first seen at 50m never re-alerts for stage 1 on the next run,
    // but alert Sebastian at most once per run. Claims start 'pending' and
    // only flip to 'sent' after the alert goes out; a failed alert deletes
    // the claims so the next run retries instead of suppressing forever.
    const claimedKeys: string[] = [];
    for (const stage of stages) {
      const { data: ins } = await db
        .from("tasks")
        .upsert(
          {
            lead_id: lead.id,
            kind: "cold_escalation",
            dedupe_key: stage.key,
            scheduled_for: new Date().toISOString(),
            status: "pending",
            payload: { minutes: age },
          },
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        )
        .select("id");
      if (ins && ins.length > 0) claimedKeys.push(stage.key);
    }
    if (claimedKeys.length === 0) continue;

    try {
      await notifyColdEscalation(lead, age);
      await alertOwner(
        `Cold lead waiting ${age}m: ${lead.name ?? fmtPhone(lead.phone)}. ` +
          `Open: ${APP_URL}/CanesPressure/leads/${lead.id}`,
      );
      await db
        .from("tasks")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .in("dedupe_key", claimedKeys);
      alerted++;
    } catch (err) {
      await db.from("tasks").delete().in("dedupe_key", claimedKeys);
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[canes] cold escalation failed for lead ${lead.id}:`, msg);
      errors.push(`${lead.id}: ${msg}`);
    }
  }
  return {
    candidates: leads.length,
    alerted,
    nativePush,
    ...(errors.length ? { errors } : {}),
  };
}

// ── Crew start safety: no check-in after the arrival window + 10 minutes ─────

async function crewLateCheckIns() {
  const db = canesDb();
  const now = Date.now();
  const { data, error } = await db
    .from("jobs")
    .select("id, customer_name, scheduled_at, arrival_window_minutes")
    .in("status", ["scheduled", "confirmed"])
    .not("scheduled_at", "is", null)
    .not("crew_id", "is", null)
    .gte("scheduled_at", new Date(now - 6 * 60 * 60_000).toISOString())
    .lte("scheduled_at", new Date(now).toISOString())
    .limit(200);
  if (error) throw new Error(`crewLateCheckIns jobs: ${error.message}`);
  const jobs = (data ?? []) as Array<{
      id: string;
      customer_name: string | null;
      scheduled_at: string;
      arrival_window_minutes: number | null;
    }>;
  const dueJobs = jobs.filter((job) => {
    const graceMinutes = Math.max(0, job.arrival_window_minutes ?? 0) + 10;
    const threshold = new Date(job.scheduled_at).getTime() + graceMinutes * 60_000;
    return now >= threshold;
  });
  const { data: timeData, error: timeError } = dueJobs.length === 0
    ? { data: [], error: null }
    : await db
      .from("job_time_entries")
      .select("job_id, checked_in_at")
      .in("job_id", dueJobs.map((job) => job.id));
  if (timeError) throw new Error(`crewLateCheckIns time entries: ${timeError.message}`);
  const scheduledByJob = new Map(dueJobs.map((job) => [job.id, job.scheduled_at]));
  const checkedInJobIds = new Set((timeData ?? []).flatMap((row) => {
    const jobId = (row as { job_id?: unknown }).job_id;
    const checkedInAt = (row as { checked_in_at?: unknown }).checked_in_at;
    const scheduledAt = typeof jobId === "string" ? scheduledByJob.get(jobId) : undefined;
    return typeof jobId === "string" &&
        typeof checkedInAt === "string" &&
        typeof scheduledAt === "string" &&
        new Date(checkedInAt).getTime() >= new Date(scheduledAt).getTime() - 6 * 60 * 60_000
      ? [jobId]
      : [];
  }));
  const lateJobs = dueJobs.filter((job) => !checkedInJobIds.has(job.id));
  const nativePush = await enqueueCanesPushBatch(lateJobs.map((job) => {
    const person = job.customer_name?.trim() || "A customer";
    const minutesLate = Math.floor((now - new Date(job.scheduled_at).getTime()) / 60_000);
    return {
      dedupeKey: `crew_late:${job.id}:${canonicalTimestamp(job.scheduled_at)}`,
      audience: { kind: "owner" },
      eventType: "crew_late",
      urgency: "time_sensitive",
      title: "No crew check-in",
      body: `${person}'s crew is ${Math.max(1, Math.round(minutesLate))} minutes past start.`,
      href: `/(owner)/job/${job.id}`,
      entityId: job.id,
      state: { scheduledAt: job.scheduled_at },
    } satisfies CanesPush;
  }));
  if (!nativePush.ok) {
    throw new Error(`crew-late push outbox persistence failed for ${nativePush.failed} event(s)`);
  }
  return {
    candidates: jobs.length,
    alerted: lateJobs.length,
    checkedIn: dueJobs.length - lateJobs.length,
    notDue: jobs.length - dueJobs.length,
    nativePush,
  };
}

// ── Follow-up nudges for contacted-but-quiet cold leads ──────────────────────

async function followUps(deadlineAt: number) {
  const db = canesDb();
  const now = Date.now();
  const { data } = await db
    .from("leads")
    .select("*")
    .eq("type", "cold")
    .eq("status", "contacted")
    .limit(200);
  const leads = ((data ?? []) as Lead[]).filter(
    (l) => !l.snoozed_until || new Date(l.snoozed_until).getTime() < now,
  );
  let reminded = 0;
  const errors: string[] = [];

  for (const lead of leads) {
    if (!hasCronBudget(deadlineAt, 9_000)) break;
    const idleDays = (now - new Date(lead.last_activity_at).getTime()) / 86_400_000;
    const buckets = [
      { days: 7, tag: "d7" },
      { days: 3, tag: "d3" },
      { days: 1, tag: "d1" },
    ].filter((b) => idleDays >= b.days);
    if (buckets.length === 0) continue;

    // Same insert-first pattern as cold escalation: claim every bucket the
    // lead has aged past, remind once per run. Claims start 'pending', flip
    // to 'sent' only after the alert; a failure deletes them so we retry.
    const claimedKeys: string[] = [];
    for (const b of buckets) {
      const key = `follow_up:${lead.id}:${b.tag}`;
      const { data: ins } = await db
        .from("tasks")
        .upsert(
          {
            lead_id: lead.id,
            kind: "follow_up",
            dedupe_key: key,
            scheduled_for: new Date().toISOString(),
            status: "pending",
            payload: { idle_days: Math.floor(idleDays) },
          },
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        )
        .select("id");
      if (ins && ins.length > 0) claimedKeys.push(key);
    }
    if (claimedKeys.length === 0) continue;

    try {
      await alertOwner(
        `Follow up with ${lead.name ?? fmtPhone(lead.phone)} (quiet for ${Math.floor(idleDays)}d). ` +
          `Open: ${APP_URL}/CanesPressure/leads/${lead.id}`,
      );
      await db
        .from("tasks")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .in("dedupe_key", claimedKeys);
      reminded++;
    } catch (err) {
      await db.from("tasks").delete().in("dedupe_key", claimedKeys);
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[canes] follow-up alert failed for lead ${lead.id}:`, msg);
      errors.push(`${lead.id}: ${msg}`);
    }
  }
  return { candidates: leads.length, reminded, ...(errors.length ? { errors } : {}) };
}

// ── 7am ET daily digest ──────────────────────────────────────────────────────

async function morningDigest(deadlineAt: number) {
  const db = canesDb();
  const now = new Date();
  const etHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", hour12: false }).format(now),
  );
  if (etHour !== 7) return { skipped: "outside 7am ET window" };
  if (!hasCronBudget(deadlineAt, 12_000)) return { skipped: "cron deadline" };

  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // The native run sheet has its own durable outbox and must not depend on the
  // legacy email/SMS digest claim. If either legacy channel failed after its
  // task row was inserted, returning early here used to suppress push forever.
  const [overview, agenda] = await Promise.all([getOverview(), getAgenda(1)]);
  const appts = agenda.flatMap((group) => group.leads);
  const startIso = etLocalToIso(`${day}T00:00`);
  const nextDate = new Date(`${day}T12:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const nextDay = nextDate.toISOString().slice(0, 10);
  const endIso = etLocalToIso(`${nextDay}T00:00`);
  const dayStart = new Date(startIso).getTime();
  const dayEnd = new Date(endIso).getTime();
  const unconfirmed = appts.filter((lead) => {
    const appointmentAt = lead.appointment_at ? new Date(lead.appointment_at).getTime() : 0;
    return lead.status !== "confirmed" && appointmentAt >= dayStart && appointmentAt < dayEnd;
  }).length;
  const jobs = (await getScheduleBoard(startIso, 2)).filter(
    (job) => job.scheduled_at && job.scheduled_at >= startIso && job.scheduled_at < endIso,
  );
  await pushMorningRunSheet({
    day,
    jobs: jobs.length,
    unconfirmed,
    leadsWaiting: overview.coldNeedingCall.length,
  });

  // Insert-first so overlapping runs inside the 7am hour send exactly one.
  const { data: ins } = await db
    .from("tasks")
    .upsert(
      {
        lead_id: null,
        kind: "digest",
        dedupe_key: `digest:${day}`,
        scheduled_for: now.toISOString(),
        status: "sent",
        sent_at: now.toISOString(),
        payload: {},
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (!ins || ins.length === 0) {
    return { skipped: "legacy digest already sent today", push: "claimed separately" };
  }

  const dayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(now);
  await sendDigestEmail(`Canes morning digest for ${dayLabel}`, await renderDigestHtml(overview, appts, dayLabel));
  await alertOwner(
    `Canes today: ${appts.length} visit${appts.length === 1 ? "" : "s"}` +
      `${unconfirmed ? ` (${unconfirmed} unconfirmed)` : ""}, ` +
      `${overview.coldNeedingCall.length} quotes waiting, ` +
      `${overview.followUpsDue.length} follow-ups due.`,
  );
  console.log(`[canes] morning digest sent for ${day}`);
  return { sent: true, appointments: appts.length, jobs: jobs.length, unconfirmed };
}

// A separate, once-daily operational cleanup summary. Keeping it at 8am ET
// avoids burying the 7am run sheet while still putting receivables and dormant
// follow-ups in front of Sebastian before calls begin.
async function dailyFollowupSummary(deadlineAt: number) {
  const now = new Date();
  const etHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", hour12: false }).format(now),
  );
  if (etHour !== 8) return { skipped: "outside 8am ET window" };
  if (!hasCronBudget(deadlineAt, 5_000)) return { skipped: "cron deadline" };
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const overview = await getOverview();
  const dormantLeads = overview.followUpsDue.filter(
    (lead) => new Date(lead.last_activity_at).getTime() <= now.getTime() - 86_400_000,
  ).length;
  await pushDailyFollowupSummary({
    day,
    overdueInvoices: overview.pipeline.invoices.overdueCount,
    dormantLeads,
  });
  return {
    sent: true,
    overdueInvoices: overview.pipeline.invoices.overdueCount,
    dormantLeads,
  };
}

// Interactive mutations return success once the business write commits; a
// transient outbox insert must not tell the user the mutation failed. Repair
// state-derived alerts here, using the same dedupe keys as the immediate path.
// The 48-hour window covers provider/database outages without surprising the
// owner with notifications for historical records after first deployment.
async function repairNotificationOutbox(deadlineAt: number) {
  if (!hasCronBudget(deadlineAt, 4_000)) return { skipped: "cron deadline" };
  const db = canesDb();
  const since = new Date(Date.now() - 48 * 60 * 60_000).toISOString();
  const [
    estimateResult,
    checklistResult,
    jobEventResult,
    manualJobResult,
    leadEventResult,
    inboundMessageResult,
    missedCallResult,
  ] = await Promise.all([
    db
      .from("estimates")
      .select("id, number, customer_name, status, approved_at")
      .eq("status", "approved")
      .eq("approval_source", "customer")
      .gte("approved_at", since)
      .order("approved_at", { ascending: false })
      .limit(100),
    db
      .from("job_items")
      .select("id, job_id, name, required, blocked, blocked_at, done")
      .eq("required", true)
      .eq("blocked", true)
      .eq("done", false)
      .gte("blocked_at", since)
      .order("blocked_at", { ascending: false })
      .limit(100),
    db
      .from("job_activity_events")
      .select("id, job_id, event_type, detail, created_at")
      .in("event_type", [
        "schedule_changed",
        "schedule_removed",
        "crew_assignment_changed",
        "status_changed",
      ])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("jobs")
      .select("id, created_at, customer_name, job_name, crew_id, status, scheduled_at, ends_at, creation_notification_crew_id, creation_notification_scheduled_at")
      .not("creation_notification_crew_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("events")
      .select("id, lead_id, kind, detail, source_key, created_at")
      .in("kind", ["created", "website_request"])
      .not("lead_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("messages")
      .select("id, lead_id, peer_phone, body, twilio_sid, created_at")
      .eq("direction", "in")
      .not("lead_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("calls")
      .select("id, lead_id, peer_phone, status, twilio_sid, created_at")
      .eq("direction", "in")
      .in("status", ["no-answer", "busy", "failed", "voicemail", "canceled"])
      .not("lead_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (estimateResult.error) throw new Error(`notification repair estimates: ${estimateResult.error.message}`);
  if (checklistResult.error) throw new Error(`notification repair checklist: ${checklistResult.error.message}`);
  if (jobEventResult.error) throw new Error(`notification repair job events: ${jobEventResult.error.message}`);
  if (manualJobResult.error) throw new Error(`notification repair manual jobs: ${manualJobResult.error.message}`);
  if (leadEventResult.error) throw new Error(`notification repair lead events: ${leadEventResult.error.message}`);
  if (inboundMessageResult.error) {
    throw new Error(`notification repair inbound messages: ${inboundMessageResult.error.message}`);
  }
  if (missedCallResult.error) {
    throw new Error(`notification repair missed calls: ${missedCallResult.error.message}`);
  }

  const estimates = estimateResult.data ?? [];
  const checklist = checklistResult.data ?? [];
  const allJobEvents = jobEventResult.data ?? [];
  // Current-crew schedule and status alerts are superseded by a newer event of
  // the same class. Crew-removal alerts are different: A still needs to learn
  // about A→B even if B's schedule changes afterward, so those are rebuilt
  // from every audit row below.
  const latestJobChangeEvents = new Map<
    string,
    (NonNullable<typeof jobEventResult.data>)[number]
  >();
  const latestStatusEvents = new Map<
    string,
    (NonNullable<typeof jobEventResult.data>)[number]
  >();
  for (const event of allJobEvents) {
    const target = event.event_type === "status_changed"
      ? latestStatusEvents
      : latestJobChangeEvents;
    if (!target.has(event.job_id)) target.set(event.job_id, event);
  }
  const estimateIds = estimates.map((estimate) => estimate.id);
  const jobIds = [...new Set([
    ...checklist.map((item) => item.job_id),
    ...allJobEvents.map((event) => event.job_id),
  ])];
  const leadIds = [...new Set([
    ...(leadEventResult.data ?? []).map((event) => event.lead_id as string),
    ...(inboundMessageResult.data ?? []).map((message) => message.lead_id as string),
    ...(missedCallResult.data ?? []).map((call) => call.lead_id as string),
  ])];
  const [estimateJobsResult, checklistJobsResult, leadsResult] = await Promise.all([
    estimateIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : db.from("jobs").select("id, estimate_id").in("estimate_id", estimateIds),
    jobIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : db
        .from("jobs")
        .select("id, customer_name, job_name, crew_id, status, scheduled_at, ends_at")
        .in("id", jobIds),
    leadIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : db
        .from("leads")
        .select("id, name, phone, status, opportunity_started_at, created_at, last_activity_at")
        .in("id", leadIds),
  ]);
  if (estimateJobsResult.error) {
    throw new Error(`notification repair estimate jobs: ${estimateJobsResult.error.message}`);
  }
  if (checklistJobsResult.error) {
    throw new Error(`notification repair checklist jobs: ${checklistJobsResult.error.message}`);
  }
  if (leadsResult.error) {
    throw new Error(`notification repair leads: ${leadsResult.error.message}`);
  }
  const estimateJob = new Map(
    (estimateJobsResult.data ?? []).map((job) => [job.estimate_id as string, job.id as string]),
  );
  const jobsById = new Map(
    (checklistJobsResult.data ?? []).map((job) => [job.id as string, job]),
  );
  const leadsById = new Map(
    (leadsResult.data ?? []).map((lead) => [lead.id as string, lead]),
  );

  let repairedMessages = 0;
  let repairedMissedCalls = 0;
  let repairedLeadAlerts = 0;
  let staleMissedCalls = 0;

  // Rebuild the exact-thread notification from the immutable inbound message
  // row. The provider SID is the immediate path's dedupe identity; simulator
  // messages intentionally fall back to their persisted UUID.
  for (const message of inboundMessageResult.data ?? []) {
    if (!hasCronBudget(deadlineAt, 2_000)) break;
    const lead = leadsById.get(message.lead_id as string);
    if (!lead) continue;
    await pushCustomerMessage({
      messageId: message.twilio_sid ?? message.id,
      peerPhone: message.peer_phone,
      displayName: lead.name,
      rescheduleRequest: looksLikeScheduleRequest(message.body),
      optOut: isOptOut(message.body),
    });
    repairedMessages++;
  }

  // A known caller does not create a lead event, so the calls ledger is the
  // only durable recovery source. Do not resurrect a missed-call page after a
  // later text/edit has materially advanced the lead.
  for (const call of missedCallResult.data ?? []) {
    if (!hasCronBudget(deadlineAt, 2_000)) break;
    const lead = leadsById.get(call.lead_id as string);
    if (!lead) continue;
    if (
      happenedAfter(
        lead.last_activity_at,
        call.created_at,
        MISSED_CALL_ACTIVITY_GRACE_MS,
      )
    ) {
      staleMissedCalls++;
      continue;
    }
    await pushNewLead(
      lead,
      "missed_call",
      call.twilio_sid ?? call.id,
    );
    repairedMissedCalls++;
  }

  const websiteReminderCandidates: CanesPush[] = [];
  for (const event of leadEventResult.data ?? []) {
    if (!hasCronBudget(deadlineAt, 2_000)) break;
    const lead = leadsById.get(event.lead_id as string);
    if (!lead) continue;
    const sourceKey = typeof event.source_key === "string" ? event.source_key : "";
    const websiteEvent = event.kind === "website_request" && sourceKey.endsWith(":request");
    const ingressMatch = event.kind === "created"
      ? sourceKey.match(/^(text|call):(.+):created$/)
      : null;
    const vendorCreation = event.kind === "created" &&
      /^sms:[^:]+:vendor:\d+:created$/.test(sourceKey);
    if (!websiteEvent && !ingressMatch && !vendorCreation) continue;

    const missedCall = ingressMatch?.[1] === "call";
    if (
      missedCall &&
      happenedAfter(
        lead.last_activity_at,
        event.created_at,
        MISSED_CALL_ACTIVITY_GRACE_MS,
      )
    ) {
      staleMissedCalls++;
      continue;
    }
    const sourceEventId = websiteEvent
      ? sourceKey.slice(0, -":request".length)
      : ingressMatch?.[2] ?? event.id;
    await pushNewLead(
      lead,
      websiteEvent ? "website_request" : missedCall ? "missed_call" : "new_lead",
      sourceEventId,
    );
    repairedLeadAlerts++;

    // Existing active leads preserve their pipeline status when a new website
    // request arrives, so the normal cold/new 10-minute sweep intentionally
    // cannot cover them. Queue one request-scoped fallback only while the
    // request remains the lead's latest activity.
    const eventTime = new Date(event.created_at).getTime();
    const activePreservedStatus = [
      "contacted",
      "appointment_set",
      "confirmed",
      "estimated",
    ].includes(lead.status);
    if (
      websiteEvent &&
      activePreservedStatus &&
      lead.phone !== PRACTICE_PHONE &&
      Number.isFinite(eventTime) &&
      Date.now() - eventTime >= 10 * 60_000 &&
      !happenedAfter(
        lead.last_activity_at,
        event.created_at,
        WEBSITE_REQUEST_ACTIVITY_GRACE_MS,
      )
    ) {
      const person = lead.name?.trim() || (lead.phone ? fmtPhone(lead.phone) : "A customer");
      websiteReminderCandidates.push({
        dedupeKey: `website_request_uncontacted:${sourceEventId}`,
        audience: { kind: "owner" },
        eventType: "lead_uncontacted",
        urgency: "time_sensitive",
        title: "Website request still waiting",
        body: `${person}'s website request has been waiting at least 10 minutes.`,
        href: `/(owner)/lead/${lead.id}`,
        entityId: lead.id,
        state: {
          websiteRequest: {
            leadId: lead.id,
            requestAt: event.created_at,
            leadStatus: lead.status,
            lastActivityAt: lead.last_activity_at,
          },
        },
      });
    }
  }

  const candidates: CanesPush[] = [
    ...websiteReminderCandidates,
    ...estimates.map((estimate) => {
      const jobId = estimateJob.get(estimate.id) ?? null;
      return {
        dedupeKey: `estimate_approved:${estimate.id}`,
        audience: { kind: "owner" } as const,
        eventType: "estimate_approved" as const,
        urgency: "active" as const,
        title: "Estimate approved",
        body: `${estimate.customer_name?.trim() || "A customer"} approved ${estimate.number}.`,
        href: jobId ? `/(owner)/job/${jobId}` : `/(owner)/estimate/${estimate.id}`,
        entityId: jobId ?? estimate.id,
        state: {
          estimateId: estimate.id,
          estimateState: { status: estimate.status, approvedAt: estimate.approved_at },
        },
      };
    }),
    ...checklist.map((item) => ({
      dedupeKey: `checklist_blocked:${item.id}:${canonicalTimestamp(item.blocked_at)}`,
      audience: { kind: "owner" } as const,
      eventType: "checklist_blocked" as const,
      urgency: "time_sensitive" as const,
      title: "Crew is blocked",
      body: `A required step, “${item.name},” is blocked for ${jobsById.get(item.job_id)?.customer_name?.trim() || "a customer"}.`,
      href: `/(owner)/job/${item.job_id}?focus=checklist`,
      entityId: item.job_id,
      state: { itemId: item.id, blockedAt: item.blocked_at },
    })),
    ...allJobEvents.flatMap((event): CanesPush[] => {
      const job = jobsById.get(event.job_id);
      if (!job) return [];
      const detail = event.detail && typeof event.detail === "object" && !Array.isArray(event.detail)
        ? event.detail as Record<string, unknown>
        : {};
      const previousCrewId = typeof detail.previousCrewId === "string"
        ? detail.previousCrewId
        : null;
      const intendedCrewId = typeof detail.crewId === "string" ? detail.crewId : null;
      const terminal = ["completed", "invoiced", "paid", "canceled"].includes(job.status);
      const scheduledAt = typeof detail.scheduledAt === "string" ? detail.scheduledAt : null;
      const activeWhenRecovered = scheduledAt
        ? new Date(scheduledAt).getTime() >= Date.now()
        : job.scheduled_at === null;
      if (
        !["schedule_changed", "crew_assignment_changed"].includes(event.event_type) ||
        terminal ||
        !activeWhenRecovered ||
        !previousCrewId ||
        previousCrewId === intendedCrewId ||
        job.crew_id === previousCrewId
      ) {
        return [];
      }
      return [{
        dedupeKey: `job_removed:crew:${event.id}`,
        audience: { kind: "crew_accounts", accountIds: [], crewId: previousCrewId },
        eventType: "job_changed",
        urgency: "time_sensitive",
        title: "Assignment changed",
        body: `You are no longer assigned to ${job.customer_name?.trim() || "A customer"}'s ${job.job_name || "job"}.`,
        href: "/(crew)",
        entityId: job.id,
      } satisfies CanesPush];
    }),
    ...[
      ...latestJobChangeEvents.values(),
      ...latestStatusEvents.values(),
    ].flatMap((event): CanesPush[] => {
      const job = jobsById.get(event.job_id);
      if (!job) return [];
      if (
        event.event_type !== "status_changed" &&
        ["completed", "invoiced", "paid", "canceled"].includes(job.status)
      ) {
        return [];
      }
      const detail = event.detail && typeof event.detail === "object" && !Array.isArray(event.detail)
        ? event.detail as Record<string, unknown>
        : {};
      const customer = job.customer_name?.trim() || "A customer";
      const state = {
        jobState: {
          crewId: job.crew_id,
          status: job.status,
          scheduledAt: job.scheduled_at,
          endsAt: job.ends_at,
        },
      };
      const events: CanesPush[] = [];
      const previousCrewId = typeof detail.previousCrewId === "string"
        ? detail.previousCrewId
        : null;
      const intendedCrewId = typeof detail.crewId === "string" ? detail.crewId : null;

      const future = typeof job.scheduled_at === "string" &&
        new Date(job.scheduled_at).getTime() >= Date.now();
      const activeUnscheduledAssignment = event.event_type === "crew_assignment_changed" &&
        job.scheduled_at === null &&
        !["completed", "invoiced", "paid", "canceled"].includes(job.status);
      const scheduleMatches = typeof detail.scheduledAt !== "string" ||
        (typeof job.scheduled_at === "string" &&
          new Date(detail.scheduledAt).getTime() === new Date(job.scheduled_at).getTime());
      if (
        intendedCrewId &&
        job.crew_id === intendedCrewId &&
        (future || activeUnscheduledAssignment) &&
        scheduleMatches &&
        event.event_type !== "status_changed"
      ) {
        events.push({
          dedupeKey: `job_changed:crew:${event.id}`,
          audience: { kind: "crew_accounts", accountIds: [], crewId: intendedCrewId },
          eventType: "job_changed",
          urgency: "time_sensitive",
          title: event.event_type === "crew_assignment_changed" ? "Assignment changed" : "Schedule changed",
          body: `${customer}'s ${job.job_name || "job"} was updated.`,
          href: `/(crew)/job/${job.id}`,
          entityId: job.id,
          state,
        });
      }
      if (
        event.event_type === "schedule_removed" &&
        previousCrewId &&
        job.crew_id === previousCrewId &&
        job.scheduled_at === null
      ) {
        events.push({
          dedupeKey: `job_changed:crew:${event.id}`,
          audience: { kind: "crew_accounts", accountIds: [], crewId: previousCrewId },
          eventType: "job_changed",
          urgency: "time_sensitive",
          title: "Schedule changed",
          body: `${customer}'s ${job.job_name || "job"} was removed from the schedule.`,
          href: `/(crew)/job/${job.id}`,
          entityId: job.id,
          state,
        });
      }
      if (
        event.event_type === "status_changed" &&
        detail.status === "canceled" &&
        job.status === "canceled" &&
        typeof job.crew_id === "string" &&
        future
      ) {
        events.push({
          dedupeKey: `job_changed:crew:${event.id}`,
          audience: { kind: "crew_accounts", accountIds: [], crewId: job.crew_id },
          eventType: "job_changed",
          urgency: "time_sensitive",
          title: "Job canceled",
          body: `${customer}'s ${job.job_name || "job"} was canceled.`,
          href: `/(crew)/job/${job.id}`,
          entityId: job.id,
          state,
        });
      }
      return events;
    }),
    ...(manualJobResult.data ?? []).flatMap((job): CanesPush[] => {
      if (typeof job.creation_notification_crew_id !== "string") return [];
      const initialScheduledAt = typeof job.creation_notification_scheduled_at === "string"
        ? job.creation_notification_scheduled_at
        : null;
      const initialScheduledKey = initialScheduledAt === null
        ? "unscheduled"
        : canonicalTimestamp(initialScheduledAt);
      const scheduleStillMatches = initialScheduledAt === null
        ? job.scheduled_at === null
        : typeof job.scheduled_at === "string" &&
          new Date(job.scheduled_at).getTime() === new Date(initialScheduledAt).getTime();
      // This candidate represents the immutable creation-time assignment only.
      // If the job has since moved or changed crews, its transition audit event
      // is the recovery source and this stale notification must disappear.
      if (job.crew_id !== job.creation_notification_crew_id || !scheduleStillMatches) return [];
      const futureOrUnscheduled = initialScheduledAt === null ||
        new Date(initialScheduledAt).getTime() >= Date.now();
      if (!futureOrUnscheduled || ["completed", "invoiced", "paid", "canceled"].includes(job.status)) {
        return [];
      }
      return [{
        dedupeKey: `job_changed:crew:manual-created:${job.id}:${initialScheduledKey}:${job.creation_notification_crew_id}`,
        audience: { kind: "crew_accounts", accountIds: [], crewId: job.creation_notification_crew_id },
        eventType: "job_changed",
        urgency: "time_sensitive",
        title: "New assignment",
        body: `${job.customer_name?.trim() || "A customer"}'s ${job.job_name || "job"} was assigned to your crew.`,
        href: `/(crew)/job/${job.id}`,
        entityId: job.id,
        state: {
          jobState: {
            crewId: job.creation_notification_crew_id,
            status: job.status,
            scheduledAt: initialScheduledAt,
            endsAt: job.ends_at,
          },
        },
      }];
    }),
  ];
  if (candidates.length === 0) {
    return {
      candidates: 0,
      queued: 0,
      repairedMessages,
      repairedMissedCalls,
      repairedLeadAlerts,
      staleMissedCalls,
    };
  }
  const queued = await enqueueCanesPushBatch(candidates);
  if (!queued.ok) {
    throw new Error(`notification repair outbox failed for ${queued.failed} event(s)`);
  }
  return {
    candidates: candidates.length,
    queued: queued.queued,
    existing: queued.skipped,
    repairedMessages,
    repairedMissedCalls,
    repairedLeadAlerts,
    staleMissedCalls,
  };
}
