import { NextRequest, NextResponse } from "next/server";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getAgenda, getLead, getOverview, getSettings } from "@/lib/canes/data";
import { getEstimate, getJob } from "@/lib/canes/estimates";
import { getInvoice, invoicePublicUrl } from "@/lib/canes/invoices";
import { alertOwner, fillTemplate, nextAllowedSendTime, sendCanesSms } from "@/lib/canes/twilio";
import { notifyColdEscalation, notifyUnconfirmed, renderDigestHtml, sendDigestEmail } from "@/lib/canes/notify";
import { logLeadEvent, upsertConfirmationTask } from "@/lib/canes/inbound";
import { ET, fmtEt, fmtPhone, minutesSince } from "@/lib/canes/types";
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

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorized = secret
    ? req.headers.get("authorization") === `Bearer ${secret}` ||
      req.nextUrl.searchParams.get("secret") === secret
    : process.env.NODE_ENV !== "production"; // no secret set → dev only

  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canesConfigured()) return NextResponse.json({ skipped: true });

  const report: Record<string, unknown> = {};
  const section = async (name: string, fn: () => Promise<unknown>) => {
    try {
      report[name] = await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[canes] cron section ${name} failed:`, msg);
      report[name] = { error: msg };
    }
  };

  await section("tasks", drainDueTasks);
  await section("expire_estimates", expireEstimates);
  await section("safety_net", confirmationSafetyNet);
  await section("no_reply", noReplyEscalations);
  await section("cold_escalation", coldEscalations);
  await section("follow_up", followUps);
  await section("digest", morningDigest);

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

async function drainDueTasks() {
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

  for (const task of tasks) {
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
      const optedOut = invoice?.lead_id ? (await getLead(invoice.lead_id))?.opted_out : false;
      if (
        !invoice ||
        !invoice.customer_phone ||
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
        to: invoice.customer_phone,
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
        job.scheduled_at !== scheduledAt
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
  return { due: tasks.length, sent, deferred, canceled, failed, contested };
}

// ── Safety net: appointment_set leads with no confirmation task ──────────────

async function confirmationSafetyNet() {
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
    if (await upsertConfirmationTask(lead, settings)) created++;
  }
  return { checked: leads.length, created };
}

// ── Due no-reply escalations ─────────────────────────────────────────────────

async function noReplyEscalations() {
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
    const lead = task.lead_id ? await getLead(task.lead_id) : null;
    if (!lead || lead.status !== "appointment_set") {
      await db.from("tasks").update({ status: "canceled" }).eq("id", task.id);
      canceled++;
      continue;
    }
    const when = fmtEt(lead.appointment_at);
    await notifyUnconfirmed(lead, when);
    await alertOwner(
      `No YES yet from ${lead.name ?? fmtPhone(lead.phone)} for the ${when} estimate. ` +
        `Open: ${APP_URL}/CanesPressure/leads/${lead.id}`,
    );
    await db.from("tasks").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", task.id);
    await logLeadEvent(lead.id, "automation", "Escalated: appointment still unconfirmed");
    alerted++;
  }
  return { due: tasks.length, alerted, canceled };
}

// ── Cold leads sitting uncalled (15m, then 45m) ──────────────────────────────

async function coldEscalations() {
  const db = canesDb();
  const { data } = await db
    .from("leads")
    .select("*")
    .eq("type", "cold")
    .eq("status", "new")
    .eq("opted_out", false)
    .limit(200);
  const leads = (data ?? []) as Lead[];
  let alerted = 0;
  const errors: string[] = [];

  for (const lead of leads) {
    const age = minutesSince(lead.created_at);
    const stages = [
      { min: 45, key: `cold_esc:${lead.id}:2` },
      { min: 15, key: `cold_esc:${lead.id}:1` },
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
  return { candidates: leads.length, alerted, ...(errors.length ? { errors } : {}) };
}

// ── Follow-up nudges for contacted-but-quiet cold leads ──────────────────────

async function followUps() {
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

async function morningDigest() {
  const db = canesDb();
  const now = new Date();
  const etHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", hour12: false }).format(now),
  );
  if (etHour !== 7) return { skipped: "outside 7am ET window" };

  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
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
  if (!ins || ins.length === 0) return { skipped: "already sent today" };

  const [overview, agenda] = await Promise.all([getOverview(), getAgenda(1)]);
  const appts = agenda.flatMap((g) => g.leads);
  const unconfirmed = appts.filter((l) => l.status !== "confirmed").length;

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
  return { sent: true, appointments: appts.length, unconfirmed };
}
