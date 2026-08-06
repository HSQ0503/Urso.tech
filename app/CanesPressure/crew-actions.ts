"use server";

import { revalidatePath } from "next/cache";
import { canesDb } from "@/lib/canes/supabase";
import {
  requireTechnicianActor,
  requireTechnicianJob,
} from "@/lib/canes/crew-auth";
import {
  CREW_UPLOAD_CATEGORIES,
  createMediaUploadGrant,
  finalizeMediaUpload,
  listJobMedia,
  validateMediaUpload,
  type MediaFinalizeInput,
  type MediaUploadGrant,
} from "@/lib/canes/media";
import type { JobMediaCategory, JobMediaItem } from "@/lib/canes/types";
import { completeJob } from "@/app/CanesPressure/actions";
import { pushChecklistBlocked } from "@/lib/canes/push-events";

export type CrewActionResult = { ok: boolean; notice?: string };

const TERMINAL = ["completed", "invoiced", "paid", "canceled"];

function refresh(jobId: string): void {
  revalidatePath("/CanesPressure/crew");
  revalidatePath(`/CanesPressure/crew/jobs/${jobId}`);
}

async function logActivity(
  jobId: string,
  accountId: string,
  eventType: string,
  detail: Record<string, unknown> = {},
): Promise<string | null> {
  const { data, error } = await canesDb().from("job_activity_events").insert({
    job_id: jobId,
    account_id: accountId,
    event_type: eventType,
    detail,
  }).select("id").single();
  if (error) {
    console.error(`[canes crew] activity ${eventType} failed: ${error.message}`);
    return null;
  }
  return typeof data?.id === "string" ? data.id : null;
}

export async function checkInToJob(jobId: string): Promise<CrewActionResult> {
  const actor = await requireTechnicianActor();
  await requireTechnicianJob(actor, jobId);
  const db = canesDb();
  const checkedInAt = new Date().toISOString();
  const { data, error } = await db.rpc("check_in_job_locked", {
    p_job_id: jobId,
    p_account_id: actor.accountId,
    p_checked_in_at: checkedInAt,
  });
  if (error) return { ok: false, notice: error.message };
  const result = (data?.[0] ?? null) as {
    outcome: "checked_in" | "already_here" | "open_elsewhere" | "closed" | "not_found";
    open_job_id: string | null;
  } | null;
  if (result?.outcome === "already_here") return { ok: true, notice: "You are already checked in." };
  if (result?.outcome === "open_elsewhere") return { ok: false, notice: "Check out of your other job first." };
  if (result?.outcome !== "checked_in") return { ok: false, notice: "This job can no longer be started." };
  await logActivity(jobId, actor.accountId, "checked_in", { checkedInAt });
  refresh(jobId);
  return { ok: true, notice: "Checked in." };
}

export async function checkOutFromJob(jobId: string): Promise<CrewActionResult> {
  const actor = await requireTechnicianActor();
  await requireTechnicianJob(actor, jobId);
  const db = canesDb();
  const checkedOutAt = new Date().toISOString();
  const { data, error } = await db
    .from("job_time_entries")
    .update({ checked_out_at: checkedOutAt })
    .eq("job_id", jobId)
    .eq("account_id", actor.accountId)
    .is("checked_out_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, notice: error.message };
  if (!data) return { ok: false, notice: "You are not checked in to this job." };
  await logActivity(jobId, actor.accountId, "checked_out", { checkedOutAt });
  refresh(jobId);
  return { ok: true, notice: "Checked out." };
}

async function checklistItemJob(itemId: string): Promise<string | null> {
  const { data } = await canesDb()
    .from("job_items")
    .select("job_id")
    .eq("id", itemId)
    .maybeSingle();
  return (data?.job_id as string | undefined) ?? null;
}

async function alertRequiredChecklistBlock(input: {
  itemId: string;
  blockedAt: string;
  jobId: string;
  stepName: string;
  technicianName: string;
}): Promise<void> {
  try {
    const { data: job } = await canesDb()
      .from("jobs")
      .select("customer_name")
      .eq("id", input.jobId)
      .maybeSingle();
    await pushChecklistBlocked({
      eventId: `${input.itemId}:${input.blockedAt}`,
      jobId: input.jobId,
      customerName: typeof job?.customer_name === "string" ? job.customer_name : null,
      stepName: input.stepName,
      technicianName: input.technicianName,
      itemId: input.itemId,
      blockedAt: input.blockedAt,
    });
  } catch (error) {
    // The block itself has committed. Cron rebuilds this exact alert from the
    // persisted blocked_at snapshot, so the technician must not be told the
    // action failed and retry a successful mutation.
    console.error(`[canes crew] checklist block push persistence failed for ${input.itemId}:`, error);
  }
}

export async function setChecklistItemDone(
  itemId: string,
  done: boolean,
): Promise<CrewActionResult> {
  const actor = await requireTechnicianActor();
  const jobId = await checklistItemJob(itemId);
  if (!jobId) return { ok: false, notice: "Checklist item not found." };
  await requireTechnicianJob(actor, jobId);
  const now = new Date().toISOString();
  const { error } = await canesDb()
    .from("job_items")
    .update({
      done,
      blocked: done ? false : undefined,
      blocked_at: done ? null : undefined,
      blocked_by: done ? null : undefined,
      completed_at: done ? now : null,
      completed_by: done ? actor.accountId : null,
    })
    .eq("id", itemId)
    .eq("job_id", jobId);
  if (error) return { ok: false, notice: error.message };
  await logActivity(jobId, actor.accountId, done ? "checklist_completed" : "checklist_reopened", {
    itemId,
  });
  refresh(jobId);
  return { ok: true };
}

export async function saveChecklistItemNote(
  itemId: string,
  note: string,
): Promise<CrewActionResult> {
  const actor = await requireTechnicianActor();
  const jobId = await checklistItemJob(itemId);
  if (!jobId) return { ok: false, notice: "Checklist item not found." };
  await requireTechnicianJob(actor, jobId);
  const technicianNote = note.trim().slice(0, 1000) || null;
  const { error } = await canesDb()
    .from("job_items")
    .update({ technician_note: technicianNote })
    .eq("id", itemId)
    .eq("job_id", jobId);
  if (error) return { ok: false, notice: error.message };
  await logActivity(jobId, actor.accountId, "checklist_note", { itemId });
  refresh(jobId);
  return { ok: true, notice: "Note saved." };
}

export async function setChecklistItemBlocked(
  itemId: string,
  blocked: boolean,
): Promise<CrewActionResult> {
  const actor = await requireTechnicianActor();
  const { data: item } = await canesDb()
    .from("job_items")
    .select("job_id, name, required, blocked, blocked_at")
    .eq("id", itemId)
    .maybeSingle();
  if (!item || typeof item.job_id !== "string") {
    return { ok: false, notice: "Checklist item not found." };
  }
  const jobId = item.job_id;
  await requireTechnicianJob(actor, jobId);
  if (Boolean(item.blocked) === blocked) {
    if (blocked && item.required && typeof item.blocked_at === "string") {
      await alertRequiredChecklistBlock({
        itemId,
        blockedAt: item.blocked_at,
        jobId,
        stepName: typeof item.name === "string" ? item.name : "Required step",
        technicianName: actor.name,
      });
    }
    return { ok: true, notice: blocked ? "This step is already blocked." : undefined };
  }
  const now = new Date().toISOString();
  const { data: changed, error } = await canesDb()
    .from("job_items")
    .update({
      blocked,
      blocked_at: blocked ? now : null,
      blocked_by: blocked ? actor.accountId : null,
      done: blocked ? false : undefined,
      completed_at: blocked ? null : undefined,
      completed_by: blocked ? null : undefined,
    })
    .eq("id", itemId)
    .eq("job_id", jobId)
    .eq("blocked", !blocked)
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!changed || changed.length === 0) {
    if (blocked) {
      const { data: current } = await canesDb()
        .from("job_items")
        .select("name, required, blocked, blocked_at")
        .eq("id", itemId)
        .eq("job_id", jobId)
        .maybeSingle();
      if (current?.required && current.blocked && typeof current.blocked_at === "string") {
        await alertRequiredChecklistBlock({
          itemId,
          blockedAt: current.blocked_at,
          jobId,
          stepName: typeof current.name === "string" ? current.name : "Required step",
          technicianName: actor.name,
        });
      }
    }
    return { ok: true, notice: blocked ? "This step is already blocked." : undefined };
  }
  if (blocked && item.required) {
    // The persisted CAS timestamp owns notification dedupe. Audit insertion is
    // best effort and must never suppress an urgent blocked-step alert.
    await alertRequiredChecklistBlock({
      itemId,
      blockedAt: now,
      jobId,
      stepName: typeof item.name === "string" ? item.name : "Required step",
      technicianName: actor.name,
    });
  }
  await logActivity(jobId, actor.accountId, blocked ? "checklist_blocked" : "checklist_unblocked", {
    itemId,
  });
  refresh(jobId);
  return { ok: true };
}

export async function completeTechnicianJob(jobId: string): Promise<CrewActionResult> {
  const actor = await requireTechnicianActor();
  await requireTechnicianJob(actor, jobId);
  const db = canesDb();
  const [{ data: job }, { data: items, error: itemError }] = await Promise.all([
    db.from("jobs").select("status").eq("id", jobId).single(),
    db.from("job_items").select("required, done, blocked").eq("job_id", jobId),
  ]);
  if (!job || TERMINAL.includes(job.status)) {
    return job?.status === "completed"
      ? { ok: true, notice: "Job is already complete." }
      : { ok: false, notice: "This job can no longer be completed." };
  }
  if (itemError) return { ok: false, notice: itemError.message };
  const required = (items ?? []).filter((item) => item.required);
  if (required.some((item) => !item.done || item.blocked)) {
    return { ok: false, notice: "Finish every required checklist item first." };
  }

  const completedAt = new Date().toISOString();
  await db
    .from("job_time_entries")
    .update({ checked_out_at: completedAt })
    .eq("job_id", jobId)
    .eq("account_id", actor.accountId)
    .is("checked_out_at", null);
  // Keep completion on the CRM's existing path so the owner receives the same
  // draft invoice/workflow as an owner-completed job. The invoice ID and every
  // financial field stay server-side and are never returned to the technician.
  const completion = await completeJob(jobId);
  const { data: completedJob } = await db
    .from("jobs")
    .select("status")
    .eq("id", jobId)
    .in("crew_id", actor.crewIds)
    .maybeSingle();
  if (!completedJob || !["completed", "invoiced", "paid"].includes(completedJob.status)) {
    return { ok: false, notice: completion.notice ?? "The job could not be completed." };
  }
  await db
    .from("jobs")
    .update({
      technician_completed_at: completedAt,
      technician_completed_by: actor.accountId,
    })
    .eq("id", jobId)
    .in("crew_id", actor.crewIds);
  await logActivity(jobId, actor.accountId, "job_completed", { completedAt });
  refresh(jobId);
  return {
    ok: true,
    notice: completion.ok ? "Job marked complete." : "Job complete. Owner follow-up is required.",
  };
}

// ── Job photos (Crew Phase C) ─────────────────────────────────────────────────
// Uploads never pass through these actions: the browser asks for a signed
// upload grant, PUTs straight to the private Storage bucket, then finalizes.
// Category and job access are re-verified on every call.

export async function requestJobPhotoUpload(
  jobId: string,
  input: { mimeType: string; sizeBytes: number; category: JobMediaCategory },
): Promise<CrewActionResult & { grant?: MediaUploadGrant }> {
  const actor = await requireTechnicianActor();
  await requireTechnicianJob(actor, jobId);
  if (!CREW_UPLOAD_CATEGORIES.includes(input.category)) {
    return { ok: false, notice: "Choose Before, After, or Issue." };
  }
  const invalid = validateMediaUpload(input);
  if (invalid) return { ok: false, notice: invalid };
  const { data: job } = await canesDb().from("jobs").select("status").eq("id", jobId).single();
  if (!job || job.status === "canceled") {
    return { ok: false, notice: "Photos cannot be added to a canceled job." };
  }
  try {
    return { ok: true, grant: await createMediaUploadGrant(jobId, input) };
  } catch (error) {
    return {
      ok: false,
      notice: error instanceof Error ? error.message : "Upload authorization failed.",
    };
  }
}

export async function finalizeJobPhotoUpload(
  input: MediaFinalizeInput,
): Promise<CrewActionResult> {
  const actor = await requireTechnicianActor();
  await requireTechnicianJob(actor, input.jobId);
  if (!CREW_UPLOAD_CATEGORIES.includes(input.category)) {
    return { ok: false, notice: "Choose Before, After, or Issue." };
  }
  const { row, notice } = await finalizeMediaUpload(input, actor.accountId);
  if (!row) return { ok: false, notice: notice ?? "The upload could not be saved." };
  await logActivity(input.jobId, actor.accountId, "media_uploaded", {
    mediaId: row.id,
    category: row.category,
  });
  refresh(input.jobId);
  return { ok: true, notice: "Photo added." };
}

export async function listJobPhotos(
  jobId: string,
): Promise<CrewActionResult & { items?: JobMediaItem[] }> {
  const actor = await requireTechnicianActor();
  await requireTechnicianJob(actor, jobId);
  try {
    return { ok: true, items: await listJobMedia(jobId, "technician") };
  } catch (error) {
    return {
      ok: false,
      notice: error instanceof Error ? error.message : "Photos failed to load.",
    };
  }
}
