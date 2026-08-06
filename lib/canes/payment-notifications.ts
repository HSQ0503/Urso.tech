import { getEstimate } from "@/lib/canes/estimates";
import { getInvoice } from "@/lib/canes/invoices";
import {
  notifyDepositPaid,
  notifyInvoiceSent,
  notifyInvoicePaid,
  notifyInvoiceReceipt,
  type CustomerEmailResult,
} from "@/lib/canes/notify";
import { canesDb } from "@/lib/canes/supabase";
import type { AutomationTask, PaymentMethod } from "@/lib/canes/types";

const PAYMENT_EMAIL_KINDS = [
  "invoice_customer_email",
  "payment_owner_receipt",
  "payment_customer_receipt",
  "deposit_owner_receipt",
] as const;

type PaymentEmailKind = (typeof PAYMENT_EMAIL_KINDS)[number];
type PaymentEmailTask = AutomationTask & { kind: PaymentEmailKind };

function retryAt(attempts: number): string {
  const delay = Math.min(6 * 60 * 60_000, 5 * 60_000 * (2 ** Math.min(attempts, 6)));
  return new Date(Date.now() + delay).toISOString();
}

function payloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function payloadMethod(payload: Record<string, unknown>): PaymentMethod | null {
  const value = payload.method;
  return value === "cash" || value === "card" || value === "other" ? value : null;
}

function payloadCents(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function requireWrite(label: string, write: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await write;
  if (error) throw new Error(`${label}: ${error.message}`);
}

export async function enqueueInvoicePaymentEmails(input: {
  eventId: string;
  invoiceId: string;
  method: PaymentMethod;
}): Promise<void> {
  const now = new Date().toISOString();
  const rows = [
    {
      lead_id: null,
      kind: "payment_owner_receipt",
      dedupe_key: `payment-email:owner:${input.eventId}`,
      scheduled_for: now,
      status: "pending",
      payload: { event_id: input.eventId, invoice_id: input.invoiceId, method: input.method, attempts: 0 },
    },
    {
      lead_id: null,
      kind: "payment_customer_receipt",
      dedupe_key: `payment-email:customer:${input.eventId}`,
      scheduled_for: now,
      status: "pending",
      payload: { event_id: input.eventId, invoice_id: input.invoiceId, method: input.method, attempts: 0 },
    },
  ];
  const { error } = await canesDb().from("tasks").upsert(rows, {
    onConflict: "dedupe_key",
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`enqueue invoice payment emails: ${error.message}`);
}

export async function enqueueDepositPaymentEmail(input: {
  eventId: string;
  estimateId: string;
  amountCents: number;
}): Promise<void> {
  const { error } = await canesDb().from("tasks").upsert({
    lead_id: null,
    kind: "deposit_owner_receipt",
    dedupe_key: `payment-email:deposit:${input.eventId}`,
    scheduled_for: new Date().toISOString(),
    status: "pending",
    payload: {
      event_id: input.eventId,
      estimate_id: input.estimateId,
      amount_cents: input.amountCents,
      attempts: 0,
    },
  }, {
    onConflict: "dedupe_key",
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`enqueue deposit payment email: ${error.message}`);
}

async function sendPaymentEmailTask(task: PaymentEmailTask): Promise<CustomerEmailResult> {
  if (task.kind === "invoice_customer_email") {
    const invoiceId = payloadString(task.payload, "invoice_id");
    const toEmail = payloadString(task.payload, "to_email");
    const deliveryId = payloadString(task.payload, "delivery_id");
    if (!invoiceId || !toEmail || !deliveryId) {
      return { ok: false, skipped: "Malformed invoice delivery notification." };
    }
    const { data: invoiceRow, error } = await canesDb()
      .from("invoices")
      .select("*, delivery_generation")
      .eq("id", invoiceId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    const invoice = invoiceRow as (Awaited<ReturnType<typeof getInvoice>> & {
      delivery_generation?: number;
    }) | null;
    if (!invoice) return { ok: false, skipped: "Invoice no longer exists." };
    if (invoice.status !== "sent" && invoice.status !== "viewed") {
      return { ok: false, skipped: "Invoice is no longer awaiting payment." };
    }
    if (`send-g${invoice.delivery_generation ?? 0}` !== deliveryId) {
      return { ok: false, skipped: "Invoice delivery was superseded." };
    }
    return notifyInvoiceSent({ ...invoice, customer_email: toEmail }, deliveryId);
  }

  if (task.kind === "deposit_owner_receipt") {
    const estimateId = payloadString(task.payload, "estimate_id");
    const amountCents = payloadCents(task.payload, "amount_cents");
    if (!estimateId || amountCents === null) return { ok: false, skipped: "Malformed deposit notification." };
    const estimate = await getEstimate(estimateId);
    if (!estimate) return { ok: false, skipped: "Estimate no longer exists." };
    return notifyDepositPaid(estimate, amountCents, task.id);
  }

  const invoiceId = payloadString(task.payload, "invoice_id");
  const method = payloadMethod(task.payload);
  if (!invoiceId || !method) return { ok: false, skipped: "Malformed invoice notification." };
  const invoice = await getInvoice(invoiceId);
  if (!invoice) return { ok: false, skipped: "Invoice no longer exists." };
  return task.kind === "payment_owner_receipt"
    ? notifyInvoicePaid(invoice, method, task.id)
    : notifyInvoiceReceipt(invoice, method, task.id);
}

export async function drainPaymentEmailTasks(options: {
  eventId?: string;
  deadlineAt?: number;
  limit?: number;
} = {}): Promise<{ due: number; sent: number; deferred: number; canceled: number; contested: number }> {
  const db = canesDb();
  let query = db
    .from("tasks")
    .select("*")
    .in("kind", [...PAYMENT_EMAIL_KINDS])
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(options.limit ?? 20);
  if (options.eventId) query = query.contains("payload", { event_id: options.eventId });
  const { data, error } = await query;
  if (error) throw new Error(`load payment email tasks: ${error.message}`);
  const tasks = (data ?? []) as PaymentEmailTask[];
  let sent = 0;
  let deferred = 0;
  let canceled = 0;
  let contested = 0;

  for (const task of tasks) {
    if (options.deadlineAt && Date.now() + 5_000 >= options.deadlineAt) break;
    const { data: claimed, error: claimError } = await db
      .from("tasks")
      .update({ status: "sending", scheduled_for: new Date().toISOString() })
      .eq("id", task.id)
      .eq("status", "pending")
      .select("id");
    if (claimError) throw new Error(`claim payment email task ${task.id}: ${claimError.message}`);
    if (!claimed?.length) {
      contested++;
      continue;
    }

    try {
      const result = await sendPaymentEmailTask(task);
      if (result.ok) {
        await requireWrite(
          `complete payment email task ${task.id}`,
          db.from("tasks").update({
            status: "sent",
            sent_at: new Date().toISOString(),
            payload: { ...task.payload, provider_id: result.id },
          }).eq("id", task.id).eq("status", "sending"),
        );
        sent++;
        continue;
      }
      if (result.skipped && result.skipped !== "Email delivery is not configured.") {
        await requireWrite(
          `cancel payment email task ${task.id}`,
          db.from("tasks").update({
            status: "canceled",
            payload: { ...task.payload, skipped: result.skipped },
          }).eq("id", task.id).eq("status", "sending"),
        );
        canceled++;
        continue;
      }
      const attempts = Number(task.payload.attempts ?? 0) + 1;
      await requireWrite(
        `defer payment email task ${task.id}`,
        db.from("tasks").update({
          status: "pending",
          scheduled_for: retryAt(attempts),
          payload: { ...task.payload, attempts, error: result.error ?? result.skipped ?? "Email send failed" },
        }).eq("id", task.id).eq("status", "sending"),
      );
      deferred++;
    } catch (caught) {
      const attempts = Number(task.payload.attempts ?? 0) + 1;
      const message = caught instanceof Error ? caught.message : String(caught);
      await requireWrite(
        `recover payment email task ${task.id}`,
        db.from("tasks").update({
          status: "pending",
          scheduled_for: retryAt(attempts),
          payload: { ...task.payload, attempts, error: message.slice(0, 500) },
        }).eq("id", task.id).eq("status", "sending"),
      );
      deferred++;
    }
  }

  return { due: tasks.length, sent, deferred, canceled, contested };
}
