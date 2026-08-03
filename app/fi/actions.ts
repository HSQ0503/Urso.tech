"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getFinanceAdmin, type FinanceEntryType, type FinanceFounder } from "@/lib/finance";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const entryTypes = ["income", "expense", "founder_draw", "founder_contribution", "refund"] as const;
const founders = ["han", "guga"] as const;

function cents(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN;
}

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

async function financeContext() {
  const session = await getFinanceAdmin();
  if (!session) redirect("/login");
  const admin = ursoDbSafe();
  if (!admin) redirect("/fi?error=store");
  return { session, admin };
}

const dealSchema = z.object({
  clientName: z.string().min(1).max(120),
  dealName: z.string().min(1).max(160),
  contractedCents: z.number().int().positive().max(10_000_000_000),
  plannedHanDrawCents: z.number().int().nonnegative().max(10_000_000_000),
  plannedGugaDrawCents: z.number().int().nonnegative().max(10_000_000_000),
  signedOn: z.union([z.literal(""), z.string().regex(datePattern)]),
  notes: z.string().max(2000),
});

export async function createFinanceDeal(formData: FormData) {
  const parsed = dealSchema.safeParse({
    clientName: text(formData.get("clientName")),
    dealName: text(formData.get("dealName")),
    contractedCents: cents(formData.get("contracted")),
    plannedHanDrawCents: cents(formData.get("hanDraw")),
    plannedGugaDrawCents: cents(formData.get("gugaDraw")),
    signedOn: text(formData.get("signedOn")),
    notes: text(formData.get("notes")),
  });
  if (!parsed.success) redirect("/fi?error=deal-fields#record");
  const values = parsed.data;
  if (values.plannedHanDrawCents + values.plannedGugaDrawCents > values.contractedCents) {
    redirect("/fi?error=deal-allocation#record");
  }

  const { session, admin } = await financeContext();
  const { error } = await admin.from("urso_finance_deals").insert({
    client_name: values.clientName,
    deal_name: values.dealName,
    contracted_cents: values.contractedCents,
    planned_han_draw_cents: values.plannedHanDrawCents,
    planned_guga_draw_cents: values.plannedGugaDrawCents,
    signed_on: values.signedOn || null,
    notes: values.notes,
    created_by: session.email,
  });
  if (error) {
    console.error("[finance] create deal failed:", error.message);
    redirect("/fi?error=save#record");
  }
  revalidatePath("/fi");
  redirect("/fi?notice=deal-added#deals");
}

const entrySchema = z.object({
  entryType: z.enum(entryTypes),
  amountCents: z.number().int().positive().max(10_000_000_000),
  occurredOn: z.string().regex(datePattern),
  dealId: z.union([z.literal(""), z.string().uuid()]),
  category: z.string().min(1).max(80),
  counterparty: z.string().max(160),
  founder: z.union([z.literal(""), z.enum(founders)]),
  notes: z.string().max(2000),
});

export async function createFinanceEntry(formData: FormData) {
  const parsed = entrySchema.safeParse({
    entryType: text(formData.get("entryType")),
    amountCents: cents(formData.get("amount")),
    occurredOn: text(formData.get("occurredOn")),
    dealId: text(formData.get("dealId")),
    category: text(formData.get("category")),
    counterparty: text(formData.get("counterparty")),
    founder: text(formData.get("founder")),
    notes: text(formData.get("notes")),
  });
  if (!parsed.success) redirect("/fi?error=entry-fields#record");
  const values = parsed.data;
  const founderEntry = values.entryType === "founder_draw" || values.entryType === "founder_contribution";
  const clientEntry = values.entryType === "income" || values.entryType === "refund";
  if (founderEntry !== Boolean(values.founder)) redirect("/fi?error=entry-founder#record");
  if (clientEntry && !values.dealId) redirect("/fi?error=entry-deal#record");
  if (values.entryType === "expense" && !values.counterparty) redirect("/fi?error=entry-counterparty#record");

  const { session, admin } = await financeContext();
  const { error } = await admin.from("urso_finance_entries").insert({
    deal_id: values.dealId || null,
    entry_type: values.entryType satisfies FinanceEntryType,
    amount_cents: values.amountCents,
    occurred_on: values.occurredOn,
    category: values.category,
    counterparty: values.counterparty,
    founder: (values.founder || null) as FinanceFounder | null,
    notes: values.notes,
    created_by: session.email,
  });
  if (error) {
    console.error("[finance] create entry failed:", error.message);
    redirect("/fi?error=save#record");
  }
  revalidatePath("/fi");
  redirect("/fi?notice=entry-added#ledger");
}

export async function voidFinanceEntry(entryId: string) {
  const id = z.string().uuid().safeParse(entryId);
  if (!id.success) redirect("/fi?error=entry-id#ledger");
  const { session, admin } = await financeContext();
  const { error } = await admin
    .from("urso_finance_entries")
    .update({ voided_at: new Date().toISOString(), voided_by: session.email })
    .eq("id", id.data)
    .is("voided_at", null);
  if (error) {
    console.error("[finance] void entry failed:", error.message);
    redirect("/fi?error=save#ledger");
  }
  revalidatePath("/fi");
  redirect("/fi?notice=entry-voided#ledger");
}
