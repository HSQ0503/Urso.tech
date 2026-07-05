import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { DEMO_CALLS, DEMO_EVENTS, DEMO_LEADS, DEMO_MESSAGES } from "@/lib/canes/fixtures";
import type {
  Call,
  CanesSettings,
  Lead,
  LeadEvent,
  LeadStatus,
  Message,
  Thread,
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
  if (isDemo()) {
    messages = DEMO_MESSAGES;
    calls = DEMO_CALLS;
    leads = DEMO_LEADS;
  } else {
    const db = canesDb();
    const [m, c, l] = await Promise.all([
      db.from("messages").select("*").order("created_at", { ascending: false }).limit(1000),
      db.from("calls").select("*").order("created_at", { ascending: false }).limit(500),
      db.from("leads").select("*"),
    ]);
    messages = (m.data ?? []) as Message[];
    calls = (c.data ?? []) as Call[];
    leads = (l.data ?? []) as Lead[];
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
  const leadByPhone = new Map(leads.filter((l) => l.phone).map((l) => [l.phone as string, l]));
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
    threads.push({
      peer_phone: peer,
      lead: leadByPhone.get(peer) ?? null,
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

export type Overview = {
  coldNeedingCall: Lead[]; // status new, type cold — the "call now" queue
  unconfirmedToday: Lead[]; // appointment inside 24h, not confirmed
  todayAgenda: Lead[];
  followUpsDue: Lead[];
  counts: { open: number; hot: number; cold: number; wonThisWeek: number };
};

export async function getOverview(): Promise<Overview> {
  const all = await listLeads();
  const in24h = Date.now() + 24 * 3_600_000;
  const startOfWeek = Date.now() - 7 * 86_400_000;
  const todayKey = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "short" });
  const isToday = (iso: string) => todayKey.format(new Date(iso)) === todayKey.format(new Date());
  return {
    coldNeedingCall: all.filter((l) => l.type === "cold" && l.status === "new" && !l.opted_out),
    unconfirmedToday: all.filter(
      (l) =>
        l.status === "appointment_set" &&
        l.appointment_at &&
        new Date(l.appointment_at).getTime() < in24h &&
        new Date(l.appointment_at).getTime() > Date.now(),
    ),
    todayAgenda: all
      .filter((l) => l.appointment_at && isToday(l.appointment_at) && ["appointment_set", "confirmed"].includes(l.status))
      .sort((a, b) => (a.appointment_at as string).localeCompare(b.appointment_at as string)),
    followUpsDue: all.filter(
      (l) =>
        l.type === "cold" &&
        l.status === "contacted" &&
        (!l.snoozed_until || new Date(l.snoozed_until).getTime() < Date.now()),
    ),
    counts: {
      open: all.filter((l) => !["won", "lost"].includes(l.status)).length,
      hot: all.filter((l) => l.type === "hot" && !["won", "lost"].includes(l.status)).length,
      cold: all.filter((l) => l.type === "cold" && !["won", "lost"].includes(l.status)).length,
      wonThisWeek: all.filter((l) => l.status === "won" && new Date(l.last_activity_at).getTime() > startOfWeek).length,
    },
  };
}
