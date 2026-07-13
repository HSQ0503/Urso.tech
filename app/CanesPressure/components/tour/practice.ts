import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { cancelSquareInvoice } from "@/lib/canes/square";
import { PRACTICE_PHONE } from "@/lib/canes/tour";

// The tour's practice sandbox: one fake lead ("Jamie Rivera") seeded into the
// LIVE database so Sebastian can work the real pipeline end to end, then a
// cleanup that removes every trace. Design rules, in order of importance:
//
// 1. SEED SILENTLY — direct inserts, never the app's lead pipeline, so no
//    hold text / owner alert / email fires on creation.
// 2. THE PHONE IS FICTIONAL — +1 561 555-01xx is the reserved fictional range;
//    no automation can ever text a real person, and no real customer can own
//    the number (which also makes phone-scoped cleanup lookups safe).
// 3. MUZZLE THE CRON — pre-insert canceled task rows carrying the exact
//    dedupe keys the cron's insert-first claims would use, so cold-lead
//    escalations and follow-up nudges never page Sebastian about fake data.
//    (The cron only updates/deletes keys IT claimed, so these rows survive.
//    The appointment-keyed alerts — no_reply, confirmation_final — can't be
//    pre-claimed here; the cron guards those by PRACTICE_PHONE instead.)
// 4. CLEAN UP BY IDS, NEVER BY PATTERN — the seeded lead id is recorded in a
//    settings row; cleanup resolves every descendant (estimate → job →
//    invoice → payment) by foreign-key chains from that root and deletes
//    children first. A predicate bug cannot touch real rows because there is
//    no name/date/amount matching anywhere.
// 5. ABANDONMENT-PROOF — sweepStalePractice() purges a practice run older
//    than 2h; the Canes cron and every gated page load both call it, so an
//    abandoned Jamie never survives to the 7am digest.
//
// INVARIANT: no practice step may ever create a calendar_events row — it is
// the one schedule-adjacent table with no FK path back to the practice roots,
// so cleanup could not find it. (Verified: only createCalendarEvent writes it
// and no chapter instructs that flow.)

const PRACTICE_KEY = "tour_practice";
export { PRACTICE_PHONE };
export const PRACTICE_NAME = "Jamie Rivera (Practice)";
const SWEEP_AFTER_MS = 2 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PracticeState = { lead_id: string; phone: string; seeded_at: string };

async function getState(): Promise<{ state: PracticeState | null; error: string | null }> {
  const { data, error } = await canesDb()
    .from("settings")
    .select("value")
    .eq("key", PRACTICE_KEY)
    .maybeSingle();
  if (error) return { state: null, error: error.message };
  const v = data?.value as PracticeState | undefined;
  // The lead id flows into delete filters with the service-role key — treat
  // anything that isn't a UUID as "no state" rather than trusting it.
  if (!v || typeof v.lead_id !== "string" || !UUID_RE.test(v.lead_id)) return { state: null, error: null };
  return { state: v, error: null };
}

async function writeState(leadId: string): Promise<string | null> {
  const state: PracticeState = { lead_id: leadId, phone: PRACTICE_PHONE, seeded_at: new Date().toISOString() };
  const { error } = await canesDb()
    .from("settings")
    .upsert({ key: PRACTICE_KEY, value: state, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return error?.message ?? null;
}

export async function seedPractice(): Promise<{ ok: boolean; notice?: string }> {
  if (!canesConfigured()) return { ok: false, notice: "Demo mode — the practice run needs the live database." };
  const db = canesDb();

  // Idempotent: an existing practice run (or a leftover practice lead from a
  // lost state row) is adopted, never duplicated — leads.phone is UNIQUE.
  // Adoption renews the 2h sweep lease so a paused-but-active tour doesn't
  // get its sandbox swept out from under it.
  const { state: existing, error: stateReadError } = await getState();
  if (stateReadError) return { ok: false, notice: `Practice state read failed: ${stateReadError}` };
  if (existing) {
    const { data } = await db.from("leads").select("id").eq("id", existing.lead_id).maybeSingle();
    if (data) {
      const err = await writeState(existing.lead_id);
      return err ? { ok: false, notice: `Practice lease renewal failed: ${err}` } : { ok: true };
    }
  }
  const { data: leftover } = await db.from("leads").select("id").eq("phone", PRACTICE_PHONE).maybeSingle();
  let leadId = (leftover as { id: string } | null)?.id ?? null;
  let freshlySeeded = false;

  if (!leadId) {
    const { data: lead, error } = await db
      .from("leads")
      .insert({
        type: "cold",
        status: "new",
        name: PRACTICE_NAME,
        phone: PRACTICE_PHONE,
        address: "482 Practice Palm Ln, West Palm Beach",
        service: "Driveway + pool deck cleaning",
        source: "other",
        raw_message:
          "Hi! I found you online - looking for a quote on my driveway and the pool deck. How soon could you come out? - Jamie",
        notes: "Tour practice lead. Created by the walkthrough; removed automatically when it ends.",
      })
      .select("id")
      .single();
    if (error || !lead) return { ok: false, notice: `Practice seed failed: ${error?.message ?? "no row"}` };
    leadId = (lead as { id: string }).id;
    freshlySeeded = true;

    // The inbound text he'll see in the Inbox thread.
    await db.from("messages").insert({
      lead_id: leadId,
      peer_phone: PRACTICE_PHONE,
      direction: "in",
      body:
        "Hi! I found you online - looking for a quote on my driveway and the pool deck. How soon could you come out? - Jamie",
      automated: false,
    });
    await db.from("events").insert({
      lead_id: leadId,
      kind: "created",
      detail: "Practice lead seeded by the tour",
    });
  }

  // Muzzle the cron: claim the escalation/follow-up dedupe keys up front as
  // 'canceled' so the insert-first locks in cron/route.ts can never fire for
  // this lead. lead_id is set so the rows die with the lead (FK cascade).
  // A lead left unmuzzled WILL page Sebastian at 15m — so a muzzle failure
  // aborts the seed (and removes a freshly created lead) rather than
  // reporting success.
  const muzzle = [
    { kind: "cold_escalation", key: `cold_esc:${leadId}:1` },
    { kind: "cold_escalation", key: `cold_esc:${leadId}:2` },
    { kind: "follow_up", key: `follow_up:${leadId}:d1` },
    { kind: "follow_up", key: `follow_up:${leadId}:d3` },
    { kind: "follow_up", key: `follow_up:${leadId}:d7` },
  ];
  for (const m of muzzle) {
    const { error } = await db.from("tasks").upsert(
      {
        lead_id: leadId,
        kind: m.kind,
        dedupe_key: m.key,
        scheduled_for: new Date().toISOString(),
        status: "canceled",
        payload: { practice: true },
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
    if (error) {
      if (freshlySeeded) await db.from("leads").delete().eq("id", leadId); // messages set-null; events/tasks cascade
      return { ok: false, notice: `Practice muzzle failed: ${error.message}` };
    }
  }

  const stateWriteError = await writeState(leadId);
  if (stateWriteError) return { ok: false, notice: `Practice state write failed: ${stateWriteError}` };
  return { ok: true };
}

// Remove every trace of the practice run. Children first; every set of ids is
// resolved via FK chains from the recorded lead (plus the fictional phone,
// which no real customer can own) BEFORE any parent is deleted — the pipeline
// FKs are SET NULL, so deleting the lead first would strand its descendants.
export async function cleanupPractice(): Promise<{ ok: boolean; notice?: string }> {
  if (!canesConfigured()) return { ok: true };
  const db = canesDb();

  // Root resolution must be trustworthy before anything is deleted: a
  // transient read failure here must NOT be mistaken for "nothing seeded"
  // (that would delete the state breadcrumb and orphan the sandbox forever).
  const { state, error: stateReadError } = await getState();
  if (stateReadError) return { ok: false, notice: `Cleanup aborted — state read failed: ${stateReadError}` };
  const { data: byPhone, error: leadReadError } = await db
    .from("leads")
    .select("id")
    .eq("phone", PRACTICE_PHONE)
    .maybeSingle();
  if (leadReadError) return { ok: false, notice: `Cleanup aborted — lead read failed: ${leadReadError.message}` };
  const { data: contacts, error: contactReadError } = await db
    .from("contacts")
    .select("id")
    .eq("phone", PRACTICE_PHONE);
  if (contactReadError) return { ok: false, notice: `Cleanup aborted — contact read failed: ${contactReadError.message}` };

  const leadId = state?.lead_id ?? (byPhone as { id: string } | null)?.id ?? null;
  const ids = (rows: { id: string }[] | null) => (rows ?? []).map((r) => r.id);
  const contactIds = ids(contacts as { id: string }[] | null);

  if (!leadId && contactIds.length === 0) {
    // All three reads succeeded and found nothing — genuinely nothing seeded.
    await db.from("settings").delete().eq("key", PRACTICE_KEY);
    return { ok: true };
  }

  const errors: string[] = [];
  const run = async (label: string, q: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await q;
    if (error) errors.push(`${label}: ${error.message}`);
  };

  // Helper: select ids matching any of the given PostgREST or-conditions.
  const resolve = async (table: string, conds: string[]): Promise<string[]> => {
    if (conds.length === 0) return [];
    const { data, error } = await db.from(table).select("id").or(conds.join(","));
    if (error) {
      errors.push(`resolve ${table}: ${error.message}`);
      return [];
    }
    return ids(data as { id: string }[] | null);
  };
  const roots = (extra: string[] = []): string[] => [
    ...(leadId ? [`lead_id.eq.${leadId}`] : []),
    ...(contactIds.length ? [`contact_id.in.(${contactIds.join(",")})`] : []),
    ...extra,
  ];

  const estIds = await resolve("estimates", roots());
  const jobIds = await resolve("jobs", roots(estIds.length ? [`estimate_id.in.(${estIds.join(",")})`] : []));
  const invIds = await resolve(
    "invoices",
    roots([
      ...(jobIds.length ? [`job_id.in.(${jobIds.join(",")})`] : []),
      ...(estIds.length ? [`estimate_id.in.(${estIds.join(",")})`] : []),
    ]),
  );

  // If any practice invoice reached Square (off-script card path), cancel the
  // hosted invoice there BEFORE deleting our row — otherwise a live pay link
  // would survive with no ledger on our side.
  if (invIds.length) {
    const { data: sq } = await db.from("invoices").select("square_invoice_id").in("id", invIds);
    for (const row of (sq ?? []) as { square_invoice_id: string | null }[]) {
      if (row.square_invoice_id) {
        try {
          await cancelSquareInvoice(row.square_invoice_id);
        } catch (err) {
          errors.push(`square cancel: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  // Delete bottom-up. Items/expenses cascade from their parents; the money
  // ledger and outbox rows are removed explicitly so nothing fake lingers.
  if (invIds.length) await run("payments(inv)", db.from("payments").delete().in("invoice_id", invIds));
  if (jobIds.length) await run("payments(job)", db.from("payments").delete().in("job_id", jobIds));
  if (invIds.length) await run("invoices", db.from("invoices").delete().in("id", invIds));
  if (jobIds.length) await run("jobs", db.from("jobs").delete().in("id", jobIds));
  if (estIds.length) await run("estimates", db.from("estimates").delete().in("id", estIds));

  // Outbox rows: everything in the practice chain carries lead_id, but the
  // estimate/invoice keyed tasks are also killed by their id-anchored dedupe
  // keys in case any row was created without the lead link.
  if (leadId) await run("tasks(lead)", db.from("tasks").delete().eq("lead_id", leadId));
  for (const eid of estIds) {
    await run("tasks(est)", db.from("tasks").delete().like("dedupe_key", `estimate_%:${eid}%`));
  }
  for (const iid of invIds) {
    await run("tasks(inv)", db.from("tasks").delete().like("dedupe_key", `invoice_%:${iid}%`));
  }
  for (const jid of jobIds) {
    await run("tasks(job)", db.from("tasks").delete().like("dedupe_key", `job_confirmation:${jid}%`));
  }

  await run("messages", db.from("messages").delete().eq("peer_phone", PRACTICE_PHONE));
  await run("calls", db.from("calls").delete().eq("peer_phone", PRACTICE_PHONE));
  if (leadId) await run("lead", db.from("leads").delete().eq("id", leadId)); // events/tasks cascade
  if (contactIds.length) await run("contacts", db.from("contacts").delete().in("id", contactIds)); // addresses cascade

  // The state breadcrumb is the sweep's retry handle — it only goes away on a
  // fully clean run. Partial failures keep it so the next sweep retries.
  if (errors.length === 0) {
    await run("state", db.from("settings").delete().eq("key", PRACTICE_KEY));
  }

  if (errors.length) {
    console.error(`[canes] practice cleanup left residue: ${errors.join("; ")}`);
    return { ok: false, notice: `Cleanup incomplete: ${errors.join("; ")}` };
  }
  return { ok: true };
}

// Abandonment backstop: called from the tour's server entry on every gated
// page load AND from the 5-minute cron, so an abandoned practice run dies
// within ~2h even if nobody opens the app. One cheap indexed read in the
// common case; the heavy path only runs when a stale practice row exists.
export async function sweepStalePractice(): Promise<void> {
  if (!canesConfigured()) return;
  try {
    const { state, error } = await getState();
    if (error || !state) return;
    if (Date.now() - new Date(state.seeded_at).getTime() < SWEEP_AFTER_MS) return;
    await cleanupPractice();
  } catch (err) {
    console.error(`[canes] practice sweep failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
