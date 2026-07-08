import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { isDemo } from "@/lib/canes/data";
import { DEMO_INVOICES, DEMO_INVOICE_ITEMS, DEMO_PAYMENTS } from "@/lib/canes/fixtures";
import type {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  InvoiceWithItems,
  Payment,
} from "@/lib/canes/types";

// Reads for the Canes invoice/payment layer. Mirrors lib/canes/estimates.ts:
// every read has an isDemo() fixtures fallback; list reads throw on hard error,
// single reads use .maybeSingle() and return null. Writes live in actions.ts
// and the Square webhook handler. The enqueue helpers self-guard on
// canesConfigured() and are insert-only through the tasks table's unique
// dedupe_key.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";

export async function listInvoices(filter?: {
  jobId?: string;
  leadId?: string;
  status?: InvoiceStatus;
}): Promise<Invoice[]> {
  let rows: Invoice[];
  if (isDemo()) {
    rows = [...DEMO_INVOICES];
  } else {
    const { data, error } = await canesDb()
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(`listInvoices: ${error.message}`);
    rows = (data ?? []) as Invoice[];
  }
  if (filter?.jobId) rows = rows.filter((i) => i.job_id === filter.jobId);
  if (filter?.leadId) rows = rows.filter((i) => i.lead_id === filter.leadId);
  if (filter?.status) rows = rows.filter((i) => i.status === filter.status);
  return rows;
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  if (isDemo()) return DEMO_INVOICES.find((i) => i.id === id) ?? null;
  const { data } = await canesDb().from("invoices").select("*").eq("id", id).maybeSingle();
  return (data as Invoice | null) ?? null;
}

export async function getInvoiceByToken(token: string): Promise<Invoice | null> {
  if (isDemo()) return DEMO_INVOICES.find((i) => i.public_token === token) ?? null;
  const { data } = await canesDb()
    .from("invoices")
    .select("*")
    .eq("public_token", token)
    .maybeSingle();
  return (data as Invoice | null) ?? null;
}

// The one invoice tied to a job (job_id is UNIQUE). Drives the job sheet's
// billing panel — "already billed?" is a single read.
export async function getInvoiceByJob(jobId: string): Promise<Invoice | null> {
  if (isDemo()) return DEMO_INVOICES.find((i) => i.job_id === jobId) ?? null;
  const { data } = await canesDb()
    .from("invoices")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();
  return (data as Invoice | null) ?? null;
}

// By the Square invoice id — the reconciliation key the webhook keys off.
export async function getInvoiceBySquareId(squareInvoiceId: string): Promise<Invoice | null> {
  if (isDemo()) return DEMO_INVOICES.find((i) => i.square_invoice_id === squareInvoiceId) ?? null;
  const { data } = await canesDb()
    .from("invoices")
    .select("*")
    .eq("square_invoice_id", squareInvoiceId)
    .maybeSingle();
  return (data as Invoice | null) ?? null;
}

export async function getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  if (isDemo()) {
    return DEMO_INVOICE_ITEMS.filter((i) => i.invoice_id === invoiceId).sort(
      (a, b) => a.position - b.position,
    );
  }
  const { data, error } = await canesDb()
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("position", { ascending: true })
    .limit(200);
  if (error) throw new Error(`getInvoiceItems: ${error.message}`);
  return (data ?? []) as InvoiceItem[];
}

export async function getInvoicePayments(invoiceId: string): Promise<Payment[]> {
  if (isDemo()) {
    return DEMO_PAYMENTS.filter((p) => p.invoice_id === invoiceId).sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  }
  const { data, error } = await canesDb()
    .from("payments")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`getInvoicePayments: ${error.message}`);
  return (data ?? []) as Payment[];
}

export async function getInvoiceWithItems(id: string): Promise<InvoiceWithItems | null> {
  const invoice = await getInvoice(id);
  if (!invoice) return null;
  const [items, payments] = await Promise.all([getInvoiceItems(id), getInvoicePayments(id)]);
  return { ...invoice, items, payments };
}

// Atomic-ish invoice numbering via the shared estimate_counters row ('invoice').
// The unique constraint on invoices.number is the real backstop; this reads and
// advances the counter, formatting INV-000001. Single-operator: contention nil.
export async function nextInvoiceNumber(): Promise<string> {
  if (isDemo()) return `INV-${String(DEMO_INVOICES.length + 1).padStart(6, "0")}`;
  const db = canesDb();
  const { data, error } = await db
    .from("estimate_counters")
    .select("next_value")
    .eq("id", "invoice")
    .maybeSingle();
  if (error || !data) throw new Error(`nextInvoiceNumber: ${error?.message ?? "counter missing"}`);
  const n = Number(data.next_value);
  const { error: updErr } = await db
    .from("estimate_counters")
    .update({ next_value: n + 1 })
    .eq("id", "invoice");
  if (updErr) throw new Error(`nextInvoiceNumber advance: ${updErr.message}`);
  return `INV-${String(n).padStart(6, "0")}`;
}

// The link the customer taps to view + pay their invoice. Always our own branded
// page; that page deep-links to Square's hosted pay URL when one exists.
export function invoicePublicUrl(invoice: Pick<Invoice, "public_token">): string {
  return `${APP_URL}/CanesPressure/i/${invoice.public_token}`;
}

// Queue the invoice_send SMS task (drained by the cron outbox). Insert-only on
// dedupe_key so a re-send never resurrects a task that already ran.
export async function enqueueInvoiceSend(invoice: Invoice): Promise<boolean> {
  if (!canesConfigured()) return false;
  const { data, error } = await canesDb()
    .from("tasks")
    .upsert(
      {
        lead_id: invoice.lead_id,
        kind: "invoice_send",
        dedupe_key: `invoice_send:${invoice.id}`,
        scheduled_for: new Date().toISOString(),
        status: "pending",
        payload: { invoice_id: invoice.id, token: invoice.public_token },
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    console.error(`[canes] invoice_send enqueue failed for ${invoice.id}: ${error.message}`);
    return false;
  }
  return (data ?? []).length > 0;
}

// Queue the day-3 and day-7 unpaid-invoice reminders. Insert-only on dedupe_key.
export async function enqueueInvoiceReminders(invoice: Invoice): Promise<void> {
  if (!canesConfigured()) return;
  const db = canesDb();
  const now = Date.now();
  const stages = [
    { key: `invoice_reminder:${invoice.id}:d3`, at: now + 3 * 86_400_000 },
    { key: `invoice_reminder:${invoice.id}:d7`, at: now + 7 * 86_400_000 },
  ];
  for (const stage of stages) {
    const { error } = await db.from("tasks").upsert(
      {
        lead_id: invoice.lead_id,
        kind: "invoice_reminder",
        dedupe_key: stage.key,
        scheduled_for: new Date(stage.at).toISOString(),
        status: "pending",
        payload: { invoice_id: invoice.id, token: invoice.public_token },
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
    if (error) {
      console.error(`[canes] invoice_reminder enqueue failed for ${invoice.id}: ${error.message}`);
    }
  }
}
