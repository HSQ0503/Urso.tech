import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { isDemo } from "@/lib/canes/data";
import {
  DEMO_ADDRESSES,
  DEMO_CONTACTS,
  DEMO_ESTIMATES,
  DEMO_INVOICES,
  DEMO_JOBS,
  DEMO_LEADS,
  DEMO_PAYMENTS,
} from "@/lib/canes/fixtures";
import { toE164 } from "@/lib/canes/types";
import type {
  Address,
  Contact,
  CustomerDetail,
  CustomerSummary,
  Estimate,
  Invoice,
  Job,
  Lead,
  LeadSource,
  Payment,
} from "@/lib/canes/types";

// Reads (+ the ensureContact upsert) for the Canes customers layer — the
// revived contacts/addresses tables from 0002/0006. Mirrors lib/canes/invoices.ts:
// every read has an isDemo() fixtures fallback; list reads throw on hard error,
// single reads use .maybeSingle() and return null. Page-facing writes live in
// actions.ts; ensureContact lives here because the pipeline (estimate approval,
// job creation, inbound) calls it as a library helper, not a server action.

// Resolve which contact a payment belongs to: through its invoice's contact
// first, then invoice → job → contact when the invoice was never linked.
function paymentContactId(
  p: Payment,
  invoiceById: Map<string, Invoice>,
  jobById: Map<string, Job>,
): string | null {
  const invoice = p.invoice_id ? invoiceById.get(p.invoice_id) : undefined;
  if (invoice?.contact_id) return invoice.contact_id;
  const jobId = invoice?.job_id ?? p.job_id;
  return (jobId ? jobById.get(jobId)?.contact_id : null) ?? null;
}

function invoiceContactId(inv: Invoice, jobById: Map<string, Job>): string | null {
  return inv.contact_id ?? (inv.job_id ? jobById.get(inv.job_id)?.contact_id ?? null : null);
}

export async function listCustomers(query?: string): Promise<CustomerSummary[]> {
  let contacts: Contact[];
  let addresses: Address[];
  let jobs: Job[];
  let invoices: Invoice[];
  let payments: Payment[];
  if (isDemo()) {
    contacts = [...DEMO_CONTACTS];
    addresses = DEMO_ADDRESSES;
    jobs = DEMO_JOBS;
    invoices = DEMO_INVOICES;
    payments = DEMO_PAYMENTS;
  } else {
    const db = canesDb();
    const [c, a, j, i, p] = await Promise.all([
      db.from("contacts").select("*").order("last_activity_at", { ascending: false }).limit(500),
      db.from("addresses").select("*").limit(1000),
      db.from("jobs").select("*").limit(1000),
      db.from("invoices").select("*").limit(1000),
      db.from("payments").select("*").limit(2000),
    ]);
    if (c.error) throw new Error(`listCustomers: ${c.error.message}`);
    contacts = (c.data ?? []) as Contact[];
    addresses = (a.data ?? []) as Address[];
    jobs = (j.data ?? []) as Job[];
    invoices = (i.data ?? []) as Invoice[];
    payments = (p.data ?? []) as Payment[];
  }

  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const addrsByContact = new Map<string, Address[]>();
  for (const a of addresses) {
    if (!a.contact_id) continue;
    addrsByContact.set(a.contact_id, [...(addrsByContact.get(a.contact_id) ?? []), a]);
  }
  const jobsByContact = new Map<string, Job[]>();
  for (const j of jobs) {
    if (!j.contact_id) continue;
    jobsByContact.set(j.contact_id, [...(jobsByContact.get(j.contact_id) ?? []), j]);
  }
  const lifetimeByContact = new Map<string, number>();
  for (const p of payments) {
    if (p.status !== "completed") continue;
    const cid = paymentContactId(p, invoiceById, jobById);
    if (cid) lifetimeByContact.set(cid, (lifetimeByContact.get(cid) ?? 0) + p.amount_cents);
  }
  const balanceByContact = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.status !== "sent" && inv.status !== "viewed") continue;
    const cid = invoiceContactId(inv, jobById);
    if (!cid) continue;
    const owed = Math.max(0, inv.total_cents - inv.amount_paid_cents);
    balanceByContact.set(cid, (balanceByContact.get(cid) ?? 0) + owed);
  }

  let rows: CustomerSummary[] = contacts.map((c) => {
    const addrs = addrsByContact.get(c.id) ?? [];
    const primary = addrs.find((a) => a.is_primary) ?? addrs[0] ?? null;
    const cJobs = jobsByContact.get(c.id) ?? [];
    const lastJobAt = cJobs
      .map((j) => j.scheduled_at ?? j.created_at)
      .sort()
      .at(-1);
    return {
      ...c,
      primary_address: primary?.line ?? null,
      jobs_count: cJobs.length,
      last_job_at: lastJobAt ?? null,
      lifetime_cents: lifetimeByContact.get(c.id) ?? 0,
      open_balance_cents: balanceByContact.get(c.id) ?? 0,
    };
  });

  if (query?.trim()) {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    rows = rows.filter((c) => {
      const addrs = (addrsByContact.get(c.id) ?? []).map((a) => a.line.toLowerCase());
      return (
        c.name?.toLowerCase().includes(q) ||
        (qDigits.length > 0 && c.phone?.includes(qDigits)) ||
        c.email?.toLowerCase().includes(q) ||
        addrs.some((line) => line.includes(q))
      );
    });
  }
  return rows.sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at));
}

export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  let contact: Contact | null;
  let addresses: Address[];
  let lead: Lead | null;
  let estimates: Estimate[];
  let jobs: Job[];
  let invoices: Invoice[];
  let payments: Payment[];
  if (isDemo()) {
    contact = DEMO_CONTACTS.find((c) => c.id === id) ?? null;
    if (!contact) return null;
    addresses = DEMO_ADDRESSES.filter((a) => a.contact_id === id);
    lead = DEMO_LEADS.find((l) => l.contact_id === id) ?? null;
    estimates = DEMO_ESTIMATES.filter((e) => e.contact_id === id || (lead && e.lead_id === lead.id));
    jobs = DEMO_JOBS.filter((j) => j.contact_id === id || (lead && j.lead_id === lead.id));
    invoices = DEMO_INVOICES.filter((i) => i.contact_id === id || (lead && i.lead_id === lead.id));
    const invoiceIds = new Set(invoices.map((i) => i.id));
    payments = DEMO_PAYMENTS.filter((p) => p.invoice_id && invoiceIds.has(p.invoice_id));
  } else {
    const db = canesDb();
    const { data } = await db.from("contacts").select("*").eq("id", id).maybeSingle();
    contact = (data as Contact | null) ?? null;
    if (!contact) return null;
    const [a, l, e, j, i] = await Promise.all([
      db.from("addresses").select("*").eq("contact_id", id).order("is_primary", { ascending: false }).limit(50),
      db.from("leads").select("*").eq("contact_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("estimates").select("*").eq("contact_id", id).order("created_at", { ascending: false }).limit(100),
      db.from("jobs").select("*").eq("contact_id", id).order("created_at", { ascending: false }).limit(100),
      db.from("invoices").select("*").eq("contact_id", id).order("created_at", { ascending: false }).limit(100),
    ]);
    addresses = (a.data ?? []) as Address[];
    lead = (l.data as Lead | null) ?? null;
    estimates = (e.data ?? []) as Estimate[];
    jobs = (j.data ?? []) as Job[];
    invoices = (i.data ?? []) as Invoice[];
    const invoiceIds = invoices.map((inv) => inv.id);
    if (invoiceIds.length > 0) {
      const { data: pays } = await db.from("payments").select("*").in("invoice_id", invoiceIds).limit(500);
      payments = (pays ?? []) as Payment[];
    } else {
      payments = [];
    }
  }

  const paymentsTotal = payments
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + p.amount_cents, 0);
  const openBalance = invoices
    .filter((i) => i.status === "sent" || i.status === "viewed")
    .reduce((sum, i) => sum + Math.max(0, i.total_cents - i.amount_paid_cents), 0);

  return {
    contact,
    addresses,
    lead,
    estimates,
    jobs,
    invoices,
    payments_total_cents: paymentsTotal,
    open_balance_cents: openBalance,
  };
}

export async function findCustomerByPhone(phone: string): Promise<Contact | null> {
  const e164 = toE164(phone) ?? phone;
  if (isDemo()) return DEMO_CONTACTS.find((c) => c.phone === e164) ?? null;
  const { data } = await canesDb().from("contacts").select("*").eq("phone", e164).maybeSingle();
  return (data as Contact | null) ?? null;
}

// Upsert-by-identity: find the contact by phone (or, phoneless, by email), fill
// in only the blanks — never overwrite a value Sebastian may have corrected —
// and create the contact when nothing matches. Also links the lead and seeds
// the primary address when the contact has none. Every pipeline step that
// learns customer identity funnels through here.
export async function ensureContact(input: {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  source?: LeadSource;
  leadId?: string | null;
}): Promise<Contact | null> {
  if (!canesConfigured()) return null;
  const db = canesDb();
  const phone = input.phone ? toE164(input.phone) : null;
  const email = input.email?.trim().toLowerCase() || null;
  const name = input.name?.trim() || null;

  let contact: Contact | null = null;
  if (phone) {
    contact = await findCustomerByPhone(phone);
  } else if (email) {
    // No phone to key on — match case-insensitively on email (no unique
    // constraint exists, so take the most recent).
    const { data } = await db
      .from("contacts")
      .select("*")
      .ilike("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    contact = (data as Contact | null) ?? null;
  }

  if (contact) {
    const patch: Record<string, unknown> = { last_activity_at: new Date().toISOString() };
    if (!contact.name && name) patch.name = name;
    if (!contact.phone && phone) patch.phone = phone;
    if (!contact.email && email) patch.email = email;
    const { data } = await db.from("contacts").update(patch).eq("id", contact.id).select("*").maybeSingle();
    contact = (data as Contact | null) ?? contact;
  } else {
    const { data, error } = await db
      .from("contacts")
      .insert({ name, phone, email, source: input.source ?? "other" })
      .select("*")
      .single();
    if (error) {
      // A concurrent insert won the phone-unique race — re-read and reuse it.
      contact = phone ? await findCustomerByPhone(phone) : null;
      if (!contact) {
        console.error(`[canes] ensureContact insert failed: ${error.message}`);
        return null;
      }
    } else {
      contact = data as Contact;
    }
  }

  if (input.leadId) {
    await db.from("leads").update({ contact_id: contact.id }).eq("id", input.leadId);
  }

  if (input.address?.trim()) {
    const { data: existing } = await db
      .from("addresses")
      .select("id")
      .eq("contact_id", contact.id)
      .limit(1);
    if (!existing || existing.length === 0) {
      await db
        .from("addresses")
        .insert({ contact_id: contact.id, line: input.address.trim(), is_primary: true });
    }
  }
  return contact;
}
