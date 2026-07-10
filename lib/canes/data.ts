import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import {
  DEMO_CALLS,
  DEMO_CONTACTS,
  DEMO_ESTIMATES,
  DEMO_EVENTS,
  DEMO_INVOICES,
  DEMO_JOBS,
  DEMO_LEADS,
  DEMO_MESSAGES,
  DEMO_PAYMENTS,
} from "@/lib/canes/fixtures";
import { toE164 } from "@/lib/canes/types";
import type {
  Call,
  CanesSettings,
  Contact,
  Estimate,
  Invoice,
  Job,
  Lead,
  LeadEvent,
  LeadStatus,
  Message,
  Payment,
  Thread,
  ThreadKind,
} from "@/lib/canes/types";

// Data access for the Canes funnel. Every read has a demo fallback so the UI
// works before the Supabase secret key exists; writes live in actions.ts and
// the webhook routes, and no-op with a notice in demo mode.

export function isDemo(): boolean {
  return !canesConfigured();
}

const DEFAULT_SETTINGS: CanesSettings = {
  quiet_hours: { start: 21, end: 8, timezone: "America/New_York" },
  confirmation_offset_hours: 12,
  templates: {
    hold_text:
      "Hi{name}! This is Canes Pressure Washing. We got your request and Sebastian will call you in just a few minutes. Reply STOP to opt out.",
    confirmation:
      "Hi{name}, this is Canes Pressure Washing confirming your free estimate visit {when} at {address}. Reply YES to confirm. Reply STOP to opt out.",
    confirmation_ack:
      "You are confirmed for {when}. See you then! - Canes Pressure Washing. Reply STOP to opt out.",
    missed_call:
      "Hi, this is Canes Pressure Washing. Sorry we missed your call - we will get back to you shortly. Reply here and we will text you right back. Reply STOP to opt out.",
  },
  lead_vendor_phones: [],
  estimate_terms:
    "Payment due on completion unless a deposit is agreed. Estimates are valid for 28 days. Canes Pressure Washing is not responsible for pre-existing damage, loose or failing surfaces, or oxidation revealed by cleaning. Access to water and power required. Reschedules due to weather are expected.",
  estimate_message:
    "Thanks for having us out. Here is your estimate. Tap to review the details and approve, and we will get you on the schedule. Any questions, just reply to this text.",
  deposit_presets: [0, 25, 50],
  estimate_expiry_days: 28,
  estimate_tax_rate_bps: 0,
  job_confirmation_template:
    "Hi{name}, this is Canes Pressure Washing confirming your appointment {when} at {address}. Reply YES to confirm. Reply STOP to opt out.",
  job_confirmation_offset_hours: 24,
  invoice_terms:
    "Payment is due upon receipt. Thank you for your business. Canes Pressure Washing is not responsible for pre-existing damage, loose or failing surfaces, or oxidation revealed by cleaning.",
  invoice_message:
    "Thanks for choosing Canes Pressure Washing! Your invoice is ready. Tap to view the details and pay securely online, or reply to this text with any questions.",
  invoice_reminder_days: [3, 7],
  confirmation_final_offset_hours: 2,
  confirmation_final_template:
    "Hi{name}, we still need a YES to confirm your Canes Pressure Washing appointment {when} at {address}. If we do not hear back we will have to release the slot. Just reply with a day and time that works (tomorrow or the day after is perfect) and we will lock it in. Reply STOP to opt out.",
  confirmation_auto_release: false,
  call_greeting_enabled: true,
  call_greeting_text:
    "Thank you for calling Canes Pressure Washing. Please hold while we connect you.",
  call_whisper_enabled: true,
  call_ivr_enabled: false,
  expense_categories: ["Materials", "Gas / travel", "Dump fee", "Subcontractor", "Equipment", "Other"],
};

export async function getSettings(): Promise<CanesSettings> {
  if (isDemo()) return DEFAULT_SETTINGS;
  const { data, error } = await canesDb().from("settings").select("key, value");
  if (error || !data) return DEFAULT_SETTINGS;
  const map = Object.fromEntries(data.map((r) => [r.key, r.value]));
  return {
    quiet_hours: map.quiet_hours ?? DEFAULT_SETTINGS.quiet_hours,
    confirmation_offset_hours: Number(map.confirmation_offset_hours ?? 12),
    templates: { ...DEFAULT_SETTINGS.templates, ...(map.templates ?? {}) },
    lead_vendor_phones: (map.lead_vendor_phones ?? []).concat(
      process.env.CANES_LEAD_VENDOR_PHONE ? [process.env.CANES_LEAD_VENDOR_PHONE] : [],
    ),
    estimate_terms: map.estimate_terms ?? DEFAULT_SETTINGS.estimate_terms,
    estimate_message: map.estimate_message ?? DEFAULT_SETTINGS.estimate_message,
    deposit_presets: map.deposit_presets ?? DEFAULT_SETTINGS.deposit_presets,
    estimate_expiry_days: Number(map.estimate_expiry_days ?? DEFAULT_SETTINGS.estimate_expiry_days),
    estimate_tax_rate_bps: Number(map.estimate_tax_rate_bps ?? DEFAULT_SETTINGS.estimate_tax_rate_bps),
    job_confirmation_template: map.job_confirmation_template ?? DEFAULT_SETTINGS.job_confirmation_template,
    job_confirmation_offset_hours: Number(
      map.job_confirmation_offset_hours ?? DEFAULT_SETTINGS.job_confirmation_offset_hours,
    ),
    invoice_terms: map.invoice_terms ?? DEFAULT_SETTINGS.invoice_terms,
    invoice_message: map.invoice_message ?? DEFAULT_SETTINGS.invoice_message,
    invoice_reminder_days: map.invoice_reminder_days ?? DEFAULT_SETTINGS.invoice_reminder_days,
    confirmation_final_offset_hours: Number(
      map.confirmation_final_offset_hours ?? DEFAULT_SETTINGS.confirmation_final_offset_hours,
    ),
    confirmation_final_template: map.confirmation_final_template ?? DEFAULT_SETTINGS.confirmation_final_template,
    confirmation_auto_release: Boolean(map.confirmation_auto_release ?? DEFAULT_SETTINGS.confirmation_auto_release),
    call_greeting_enabled: Boolean(map.call_greeting_enabled ?? DEFAULT_SETTINGS.call_greeting_enabled),
    call_greeting_text: map.call_greeting_text ?? DEFAULT_SETTINGS.call_greeting_text,
    call_whisper_enabled: Boolean(map.call_whisper_enabled ?? DEFAULT_SETTINGS.call_whisper_enabled),
    call_ivr_enabled: Boolean(map.call_ivr_enabled ?? DEFAULT_SETTINGS.call_ivr_enabled),
    expense_categories: map.expense_categories ?? DEFAULT_SETTINGS.expense_categories,
  };
}

export async function listLeads(filter?: {
  status?: LeadStatus | "open";
  type?: "hot" | "cold";
}): Promise<Lead[]> {
  let rows: Lead[];
  if (isDemo()) {
    rows = [...DEMO_LEADS];
  } else {
    const { data, error } = await canesDb()
      .from("leads")
      .select("*")
      .order("last_activity_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(`listLeads: ${error.message}`);
    rows = (data ?? []) as Lead[];
  }
  if (filter?.status === "open") {
    rows = rows.filter((l) => l.status !== "won" && l.status !== "lost");
  } else if (filter?.status) {
    rows = rows.filter((l) => l.status === filter.status);
  }
  if (filter?.type) rows = rows.filter((l) => l.type === filter.type);
  return rows;
}

export async function getLead(id: string): Promise<Lead | null> {
  if (isDemo()) return DEMO_LEADS.find((l) => l.id === id) ?? null;
  const { data } = await canesDb().from("leads").select("*").eq("id", id).maybeSingle();
  return (data as Lead) ?? null;
}

export async function getLeadEvents(leadId: string): Promise<LeadEvent[]> {
  if (isDemo()) return DEMO_EVENTS.filter((e) => e.lead_id === leadId);
  const { data } = await canesDb()
    .from("events")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as LeadEvent[];
}

export async function getLeadCalls(leadId: string): Promise<Call[]> {
  if (isDemo()) return DEMO_CALLS.filter((c) => c.lead_id === leadId);
  const { data } = await canesDb()
    .from("calls")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as Call[];
}

export async function getThreadMessages(peerPhone: string): Promise<Message[]> {
  if (isDemo()) {
    return DEMO_MESSAGES.filter((m) => m.peer_phone === peerPhone).sort(
      (a, b) => a.created_at.localeCompare(b.created_at),
    );
  }
  const { data } = await canesDb()
    .from("messages")
    .select("*")
    .eq("peer_phone", peerPhone)
    .order("created_at", { ascending: true })
    .limit(500);
  return (data ?? []) as Message[];
}

export async function listThreads(): Promise<Thread[]> {
  let messages: Message[];
  let calls: Call[];
  let leads: Lead[];
  let contacts: Contact[];
  let jobs: Pick<Job, "id" | "contact_id">[];
  let vendorPhones: string[];
  if (isDemo()) {
    messages = DEMO_MESSAGES;
    calls = DEMO_CALLS;
    leads = DEMO_LEADS;
    contacts = DEMO_CONTACTS;
    jobs = DEMO_JOBS;
    vendorPhones = ["+15615550001"];
  } else {
    const db = canesDb();
    const [m, c, l, ct, j, settings] = await Promise.all([
      db.from("messages").select("*").order("created_at", { ascending: false }).limit(1000),
      db.from("calls").select("*").order("created_at", { ascending: false }).limit(500),
      db.from("leads").select("*"),
      db.from("contacts").select("*").limit(1000),
      db.from("jobs").select("id, contact_id").not("contact_id", "is", null).limit(1000),
      getSettings(),
    ]);
    messages = (m.data ?? []) as Message[];
    calls = (c.data ?? []) as Call[];
    leads = (l.data ?? []) as Lead[];
    contacts = (ct.data ?? []) as Contact[];
    jobs = (j.data ?? []) as Pick<Job, "id" | "contact_id">[];
    vendorPhones = settings.lead_vendor_phones.filter(Boolean).map((p) => toE164(p) ?? p);
  }
  const msgsByPeer = new Map<string, Message[]>();
  for (const msg of messages) {
    const arr = msgsByPeer.get(msg.peer_phone) ?? [];
    arr.push(msg);
    msgsByPeer.set(msg.peer_phone, arr);
  }
  const callsByPeer = new Map<string, Call[]>();
  for (const call of calls) {
    const arr = callsByPeer.get(call.peer_phone) ?? [];
    arr.push(call);
    callsByPeer.set(call.peer_phone, arr);
  }
  // Phones normalized to E.164 on both sides so a manually typed lead/contact
  // number still matches its thread.
  const leadByPhone = new Map(
    leads.filter((l) => l.phone).map((l) => [toE164(l.phone as string) ?? (l.phone as string), l]),
  );
  const contactByPhone = new Map(
    contacts.filter((c) => c.phone).map((c) => [toE164(c.phone as string) ?? (c.phone as string), c]),
  );
  const contactJobCounts = new Map<string, number>();
  for (const job of jobs) {
    if (!job.contact_id) continue;
    contactJobCounts.set(job.contact_id, (contactJobCounts.get(job.contact_id) ?? 0) + 1);
  }
  const peers = new Set([...msgsByPeer.keys(), ...callsByPeer.keys()]);
  const threads: Thread[] = [];
  for (const peer of peers) {
    const msgs = (msgsByPeer.get(peer) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const peerCalls = (callsByPeer.get(peer) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const lastMessage = msgs[0] ?? null;
    const lastCall = peerCalls[0] ?? null;
    const lastAt = [lastMessage?.created_at, lastCall?.created_at]
      .filter((t): t is string => Boolean(t))
      .sort()
      .at(-1) as string;
    const callIsNewest = Boolean(lastCall && (!lastMessage || lastCall.created_at > lastMessage.created_at));
    const unread = callIsNewest
      ? lastCall!.direction === "in" && lastCall!.status !== "completed"
      : lastMessage?.direction === "in";
    const lead = leadByPhone.get(peer) ?? null;
    const contact = contactByPhone.get(peer) ?? null;
    // Vendor is a configured-number membership ONLY — the old "unattributed
    // inbound" heuristic must never pin a customer thread to the vendor slot.
    // Customer = the contact has job history, or the lead is already linked.
    const kind: ThreadKind = vendorPhones.includes(peer)
      ? "vendor"
      : contact && ((contactJobCounts.get(contact.id) ?? 0) > 0 || lead?.contact_id === contact.id)
        ? "customer"
        : "lead";
    threads.push({
      peer_phone: peer,
      lead,
      contact,
      contact_id: contact?.id ?? null,
      kind,
      display_name: contact?.name ?? lead?.name ?? null,
      last_message: lastMessage,
      last_call: lastCall,
      last_activity_at: lastAt,
      unread: Boolean(unread),
      message_count: msgs.length,
    });
  }
  return threads.sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at));
}

export async function getThreadCalls(peerPhone: string): Promise<Call[]> {
  if (isDemo()) {
    return DEMO_CALLS.filter((c) => c.peer_phone === peerPhone).sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
  }
  const { data } = await canesDb()
    .from("calls")
    .select("*")
    .eq("peer_phone", peerPhone)
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []) as Call[];
}

export type Agenda = { day: string; leads: Lead[] }[];

// Epoch ms of midnight today in ET, so past appointments drop off the agenda.
function etMidnightTodayMs(): number {
  const etNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const start = new Date(etNow);
  start.setHours(0, 0, 0, 0);
  return Date.now() - (etNow.getTime() - start.getTime());
}

// Estimate appointments grouped by ET calendar day, today through `days` days.
export async function getAgenda(days = 7): Promise<Agenda> {
  const all = await listLeads();
  const upcoming = all
    .filter((l) => l.appointment_at && ["appointment_set", "confirmed"].includes(l.status))
    .sort((a, b) => (a.appointment_at as string).localeCompare(b.appointment_at as string));
  const dayKey = (iso: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  const horizon = Date.now() + days * 86_400_000;
  const cutoff = etMidnightTodayMs();
  const groups = new Map<string, Lead[]>();
  for (const lead of upcoming) {
    const t = new Date(lead.appointment_at as string).getTime();
    if (t < cutoff || t > horizon) continue;
    const key = dayKey(lead.appointment_at as string);
    groups.set(key, [...(groups.get(key) ?? []), lead]);
  }
  return [...groups.entries()].map(([day, leads]) => ({ day, leads }));
}

// Estimate visits inside an arbitrary window — the schedule board pages through
// past and future weeks, so unlike getAgenda this takes a start instead of "now".
export async function listVisitsInRange(startIso: string, days: number): Promise<Lead[]> {
  const start = new Date(startIso).getTime();
  const end = start + days * 86_400_000;
  const all = await listLeads();
  return all
    .filter((l) => l.appointment_at && ["appointment_set", "confirmed"].includes(l.status))
    .filter((l) => {
      const t = new Date(l.appointment_at as string).getTime();
      return t >= start && t < end;
    })
    .sort((a, b) => (a.appointment_at as string).localeCompare(b.appointment_at as string));
}

export type Overview = {
  counts: { open: number; hot: number; cold: number; wonThisWeek: number };
  coldNeedingCall: Lead[]; // status new, type cold — the "call now" queue
  unconfirmedToday: Lead[]; // appointment inside 24h, not confirmed
  followUpsDue: Lead[];
  todayAgenda: Lead[];
  pastDueVisits: Lead[]; // appointment came and went with no disposition — the black hole
  pipeline: {
    leads: { newCount: number; hotCount: number };
    quotes: { awaitingCount: number; awaitingCents: number; declinedRecentCount: number };
    jobs: { unscheduledCount: number; unscheduledCents: number; activeCount: number };
    invoices: { outstandingCents: number; outstandingCount: number; overdueCount: number };
  };
  money: {
    collectedThisWeekCents: number; // completed payments, rolling 7 days
    wonThisWeekCents: number; // estimates approved, rolling 7 days
    bookedNext7DaysCents: number; // active jobs scheduled in the next 7 days
  };
  recentActivity: {
    at: string;
    leadId: string | null;
    leadName: string | null;
    kind: string;
    detail: string | null;
  }[];
};

// ── getOverview module readers: one small targeted select each, run in a single
//    Promise.all round from getOverview. Every one demo-branches to fixtures.

type OverviewEstimate = Pick<Estimate, "status" | "total_cents" | "declined_at" | "approved_at">;

async function readOverviewEstimates(): Promise<OverviewEstimate[]> {
  if (isDemo()) return DEMO_ESTIMATES;
  const { data } = await canesDb()
    .from("estimates")
    .select("status, total_cents, declined_at, approved_at")
    .limit(500);
  return (data ?? []) as OverviewEstimate[];
}

type OverviewJob = Pick<Job, "status" | "total_cents" | "scheduled_at">;

async function readOverviewJobs(): Promise<OverviewJob[]> {
  if (isDemo()) return DEMO_JOBS;
  const { data } = await canesDb().from("jobs").select("status, total_cents, scheduled_at").limit(500);
  return (data ?? []) as OverviewJob[];
}

type OverviewInvoice = Pick<Invoice, "status" | "total_cents" | "amount_paid_cents" | "sent_at">;

async function readOverviewInvoices(): Promise<OverviewInvoice[]> {
  if (isDemo()) return DEMO_INVOICES;
  const { data } = await canesDb()
    .from("invoices")
    .select("status, total_cents, amount_paid_cents, sent_at")
    .limit(500);
  return (data ?? []) as OverviewInvoice[];
}

type OverviewPayment = Pick<Payment, "amount_cents" | "status" | "created_at">;

async function readPaymentsSince(sinceIso: string): Promise<OverviewPayment[]> {
  if (isDemo()) return DEMO_PAYMENTS.filter((p) => p.created_at >= sinceIso);
  const { data } = await canesDb()
    .from("payments")
    .select("amount_cents, status, created_at")
    .gte("created_at", sinceIso)
    .limit(1000);
  return (data ?? []) as OverviewPayment[];
}

async function readRecentEvents(limit: number): Promise<LeadEvent[]> {
  if (isDemo()) {
    return [...DEMO_EVENTS].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  }
  const { data } = await canesDb()
    .from("events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as LeadEvent[];
}

export async function getOverview(): Promise<Overview> {
  const now = Date.now();
  const weekAgoIso = new Date(now - 7 * 86_400_000).toISOString();
  const [all, estimates, jobs, invoices, weekPayments, recentEvents] = await Promise.all([
    listLeads(),
    readOverviewEstimates(),
    readOverviewJobs(),
    readOverviewInvoices(),
    readPaymentsSince(weekAgoIso),
    readRecentEvents(8),
  ]);
  const in24h = now + 24 * 3_600_000;
  const startOfWeek = now - 7 * 86_400_000;
  const next7Days = now + 7 * 86_400_000;
  const todayKey = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "short" });
  const isToday = (iso: string) => todayKey.format(new Date(iso)) === todayKey.format(new Date());
  const leadById = new Map(all.map((l) => [l.id, l]));

  const awaiting = estimates.filter((e) => e.status === "sent" || e.status === "viewed");
  // "Recent" declines = the last 14 days — long enough to chase a save call.
  const declinedRecent = estimates.filter(
    (e) => e.status === "declined" && e.declined_at && new Date(e.declined_at).getTime() > now - 14 * 86_400_000,
  );
  const unscheduled = jobs.filter((j) => j.status === "unscheduled");
  const activeJobs = jobs.filter((j) => ["scheduled", "confirmed", "in_progress"].includes(j.status));
  const outstanding = invoices.filter((i) => i.status === "sent" || i.status === "viewed");
  // No due date on invoices — "overdue" = still open past the final (day-7) reminder.
  const overdue = outstanding.filter(
    (i) => i.sent_at && new Date(i.sent_at).getTime() < now - 7 * 86_400_000,
  );
  const bookedNext7 = activeJobs.filter((j) => {
    if (!j.scheduled_at) return false;
    const t = new Date(j.scheduled_at).getTime();
    return t >= now && t < next7Days;
  });

  return {
    counts: {
      open: all.filter((l) => !["won", "lost"].includes(l.status)).length,
      hot: all.filter((l) => l.type === "hot" && !["won", "lost"].includes(l.status)).length,
      cold: all.filter((l) => l.type === "cold" && !["won", "lost"].includes(l.status)).length,
      wonThisWeek: all.filter((l) => l.status === "won" && new Date(l.last_activity_at).getTime() > startOfWeek).length,
    },
    coldNeedingCall: all.filter((l) => l.type === "cold" && l.status === "new" && !l.opted_out),
    unconfirmedToday: all.filter(
      (l) =>
        l.status === "appointment_set" &&
        l.appointment_at &&
        new Date(l.appointment_at).getTime() < in24h &&
        new Date(l.appointment_at).getTime() > now,
    ),
    followUpsDue: all.filter(
      (l) =>
        l.type === "cold" &&
        l.status === "contacted" &&
        (!l.snoozed_until || new Date(l.snoozed_until).getTime() < now),
    ),
    todayAgenda: all
      .filter((l) => l.appointment_at && isToday(l.appointment_at) && ["appointment_set", "confirmed"].includes(l.status))
      .sort((a, b) => (a.appointment_at as string).localeCompare(b.appointment_at as string)),
    pastDueVisits: all
      .filter(
        (l) =>
          l.appointment_at &&
          new Date(l.appointment_at).getTime() < now &&
          ["appointment_set", "confirmed"].includes(l.status),
      )
      .sort((a, b) => (b.appointment_at as string).localeCompare(a.appointment_at as string)),
    pipeline: {
      leads: {
        newCount: all.filter((l) => l.status === "new" && !l.opted_out).length,
        hotCount: all.filter((l) => l.type === "hot" && !["won", "lost"].includes(l.status)).length,
      },
      quotes: {
        awaitingCount: awaiting.length,
        awaitingCents: awaiting.reduce((sum, e) => sum + e.total_cents, 0),
        declinedRecentCount: declinedRecent.length,
      },
      jobs: {
        unscheduledCount: unscheduled.length,
        unscheduledCents: unscheduled.reduce((sum, j) => sum + j.total_cents, 0),
        activeCount: activeJobs.length,
      },
      invoices: {
        outstandingCents: outstanding.reduce((sum, i) => sum + Math.max(0, i.total_cents - i.amount_paid_cents), 0),
        outstandingCount: outstanding.length,
        overdueCount: overdue.length,
      },
    },
    money: {
      collectedThisWeekCents: weekPayments
        .filter((p) => p.status === "completed")
        .reduce((sum, p) => sum + p.amount_cents, 0),
      wonThisWeekCents: estimates
        .filter((e) => e.status === "approved" && e.approved_at && new Date(e.approved_at).getTime() > startOfWeek)
        .reduce((sum, e) => sum + e.total_cents, 0),
      bookedNext7DaysCents: bookedNext7.reduce((sum, j) => sum + j.total_cents, 0),
    },
    recentActivity: recentEvents.map((e) => ({
      at: e.created_at,
      leadId: e.lead_id ?? null,
      leadName: (e.lead_id ? leadById.get(e.lead_id)?.name : null) ?? null,
      kind: e.kind,
      detail: e.detail,
    })),
  };
}
