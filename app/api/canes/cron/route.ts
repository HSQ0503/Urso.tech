import { NextRequest, NextResponse } from "next/server";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getAgenda, getLead, getOverview, getSettings } from "@/lib/canes/data";
import type { Overview } from "@/lib/canes/data";
import { alertOwner, fillTemplate, nextAllowedSendTime, sendCanesSms } from "@/lib/canes/twilio";
import { notifyColdEscalation, notifyUnconfirmed, sendDigestEmail } from "@/lib/canes/notify";
import { logLeadEvent, upsertConfirmationTask } from "@/lib/canes/inbound";
import { ET, fmtEt, fmtPhone, minutesSince } from "@/lib/canes/types";
import type { AutomationTask, Lead } from "@/lib/canes/types";

// The Canes automation heartbeat, hit by Vercel cron every 5 minutes
// (vercel.json). Drains the task outbox, escalates cold leads and unconfirmed
// appointments, nags about stale follow-ups, and sends the 7am ET digest.
// Every send is idempotent through the tasks table's unique dedupe_key, so
// overlapping or retried runs never double-text anyone.
// Auth mirrors /api/franpos/sync: Vercel sends `Authorization: Bearer
// ${CRON_SECRET}` automatically; manual runs can pass ?secret= instead.
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.tech";

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
  await section("safety_net", confirmationSafetyNet);
  await section("no_reply", noReplyEscalations);
  await section("cold_escalation", coldEscalations);
  await section("follow_up", followUps);
  await section("digest", morningDigest);

  return NextResponse.json(report);
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
    .in("kind", ["hold_text", "confirmation"])
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
  await sendDigestEmail(`Canes morning digest for ${dayLabel}`, digestHtml(overview, appts, dayLabel));
  await alertOwner(
    `Canes today: ${appts.length} visit${appts.length === 1 ? "" : "s"}` +
      `${unconfirmed ? ` (${unconfirmed} unconfirmed)` : ""}, ` +
      `${overview.coldNeedingCall.length} quotes waiting, ` +
      `${overview.followUpsDue.length} follow-ups due.`,
  );
  console.log(`[canes] morning digest sent for ${day}`);
  return { sent: true, appointments: appts.length, unconfirmed };
}

function digestHtml(o: Overview, appts: Lead[], dayLabel: string): string {
  const esc = (s: string | null) =>
    (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  const td = 'style="padding:6px 10px;border-top:1px solid #E5E9EE;font-size:13px;color:#131B23"';
  const h3 = 'style="font-size:14px;color:#131B23;margin:18px 0 6px"';
  const none = '<p style="font-size:13px;color:#5B6673;margin:4px 0">None.</p>';
  const table = (rows: string) =>
    `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">${rows}</table>`;
  const link = (l: Lead, label: string) =>
    `<a href="${APP_URL}/CanesPressure/leads/${l.id}" style="color:#0E7490;text-decoration:none;font-weight:600">${esc(label)}</a>`;

  const countCell = (n: number, label: string) =>
    `<td style="padding:8px 16px 8px 0"><div style="font-size:22px;font-weight:700;color:#131B23">${n}</div>` +
    `<div style="font-size:12px;color:#5B6673">${label}</div></td>`;

  const apptRows = appts
    .map(
      (l) =>
        `<tr><td ${td}>${esc(fmtEt(l.appointment_at, { hour: "numeric", minute: "2-digit" }))}</td>` +
        `<td ${td}>${link(l, l.name ?? fmtPhone(l.phone))}</td>` +
        `<td ${td}>${esc(l.address)}</td>` +
        `<td ${td}>${l.status === "confirmed" ? '<span style="color:#2F9E44;font-weight:600">Confirmed</span>' : '<span style="color:#E8590C;font-weight:600">Not confirmed</span>'}</td></tr>`,
    )
    .join("");

  const coldRows = o.coldNeedingCall
    .map(
      (l) =>
        `<tr><td ${td}>${link(l, l.name ?? fmtPhone(l.phone))}</td>` +
        `<td ${td}>${esc(l.service)}</td>` +
        `<td ${td}>${esc(fmtPhone(l.phone))}</td>` +
        `<td ${td}>waiting ${minutesSince(l.created_at)}m</td></tr>`,
    )
    .join("");

  const followRows = o.followUpsDue
    .map(
      (l) =>
        `<tr><td ${td}>${link(l, l.name ?? fmtPhone(l.phone))}</td>` +
        `<td ${td}>${esc(l.service)}</td>` +
        `<td ${td}>last activity ${esc(fmtEt(l.last_activity_at))}</td></tr>`,
    )
    .join("");

  return `
  <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px">
    <div style="border-left:4px solid #0E7490;padding:2px 0 2px 14px;margin-bottom:12px">
      <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#0E7490;font-weight:700">Morning digest</div>
      <div style="font-size:19px;font-weight:700;color:#131B23;margin-top:2px">${dayLabel}</div>
    </div>
    <table cellpadding="0" cellspacing="0"><tr>
      ${countCell(o.counts.open, "Open leads")}
      ${countCell(o.counts.hot, "Hot")}
      ${countCell(o.counts.cold, "Cold")}
      ${countCell(o.counts.wonThisWeek, "Won this week")}
    </tr></table>
    <h3 ${h3}>Today's estimate visits</h3>
    ${apptRows ? table(apptRows) : none}
    <h3 ${h3}>Cold leads waiting for a call</h3>
    ${coldRows ? table(coldRows) : none}
    <h3 ${h3}>Follow-ups due</h3>
    ${followRows ? table(followRows) : none}
    <div style="margin-top:18px">
      <a href="${APP_URL}/CanesPressure"
         style="background:#0E7490;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;display:inline-block">
        Open dashboard</a>
    </div>
  </div>`;
}
