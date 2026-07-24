"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/urso-auth";
import { getTechnicianActor } from "@/lib/canes/crew-auth";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import {
  OWNER_UPLOAD_CATEGORIES,
  createMediaUploadGrant,
  finalizeMediaUpload,
  getJobMediaRow,
  listJobMedia,
  recordJobMediaActivity,
  validateMediaUpload,
  type MediaFinalizeInput,
  type MediaUploadGrant,
} from "@/lib/canes/media";
import { toE164, type JobMediaCategory, type JobMediaItem } from "@/lib/canes/types";
import {
  CREW_PERMISSION_KEYS,
  type CrewAccountRole,
  type CrewPermissionKey,
} from "@/lib/canes/crew-types";

export type CrewOwnerActionResult = { ok: boolean; notice?: string };

const TERMINAL_JOB_STATUSES = ["completed", "invoiced", "paid", "canceled"];

async function requireOwner(): Promise<boolean> {
  return Boolean(await getAdminSession());
}

// Owner OR an ops-manager account with the schedule permission (0015) — the
// job-sheet checklist and photo review are day-to-day dispatch work DJ runs.
// Roster/role/permission management above stays strictly requireOwner.
async function requireDispatcher(): Promise<boolean> {
  if (await getAdminSession()) return true;
  const actor = await getTechnicianActor();
  return actor?.role === "ops_manager" && actor.permissions.schedule;
}

function refreshJobChecklist(jobId: string): void {
  revalidatePath("/CanesPressure/schedule");
  revalidatePath("/CanesPressure/crew");
  revalidatePath(`/CanesPressure/crew/jobs/${jobId}`);
}

export async function addCrew(input: {
  name: string;
  color: string;
}): Promise<CrewOwnerActionResult> {
  if (!(await requireOwner())) return { ok: false, notice: "Owner sign-in required." };
  const name = input.name.trim();
  const color = input.color.trim().toLowerCase();
  if (!name) return { ok: false, notice: "Crew name is required." };
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    return { ok: false, notice: "Choose a valid crew color." };
  }

  const db = canesDb();
  const { data: existing } = await db
    .from("crews")
    .select("id")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (existing) return { ok: false, notice: "A crew with that name already exists." };

  const { data: lastCrew } = await db
    .from("crews")
    .select("sort")
    .order("sort", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await db.from("crews").insert({
    name,
    color,
    active: true,
    sort: Number(lastCrew?.sort ?? -1) + 1,
  });
  if (error) return { ok: false, notice: error.message };
  revalidatePath("/CanesPressure/settings");
  revalidatePath("/CanesPressure/schedule");
  return { ok: true, notice: `${name} added.` };
}

export async function addApprovedTechnician(
  input: { name: string; email: string; phone: string; crewId: string; role?: CrewAccountRole },
): Promise<CrewOwnerActionResult> {
  if (!(await requireOwner())) return { ok: false, notice: "Owner sign-in required." };
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = toE164(input.phone);
  const isOps = input.role === "ops_manager";
  if (!name) return { ok: false, notice: "Name is required." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, notice: "Enter a valid email." };
  if (!phone) return { ok: false, notice: "Enter a valid US phone number." };

  const db = canesDb();
  // An ops manager runs every crew, so the crew pick is optional for them.
  let crewId: string | null = null;
  if (input.crewId) {
    const { data: crew } = await db
      .from("crews")
      .select("id")
      .eq("id", input.crewId)
      .eq("active", true)
      .maybeSingle();
    if (!crew && !isOps) return { ok: false, notice: "Choose an active crew." };
    crewId = crew ? input.crewId : null;
  } else if (!isOps) {
    return { ok: false, notice: "Choose an active crew." };
  }

  const { error } = await db.from("team_members").insert({
    name,
    email,
    phone,
    crew_id: crewId,
    // Ops managers default to the 20% profit share the comp plan describes;
    // the amount stays editable on the Payouts team manager.
    role: isOps ? "ops_manager" : "worker",
    comp_type: isOps ? "profit_share" : "hourly",
    comp_bps: isOps ? 2000 : 0,
    hourly_cents: 0,
    active: true,
    sort: 100,
  });
  if (error) {
    return {
      ok: false,
      notice: error.code === "23505" ? "That email already has an account." : error.message,
    };
  }
  revalidatePath("/CanesPressure/settings");
  return { ok: true };
}

export async function setTechnicianActive(
  teamMemberId: string,
  active: boolean,
): Promise<CrewOwnerActionResult> {
  if (!(await requireOwner())) return { ok: false, notice: "Owner sign-in required." };
  const db = canesDb();
  const { error } = await db
    .from("team_members")
    .update({ active })
    .eq("id", teamMemberId)
    .in("role", ["worker", "ops_manager"]);
  if (error) return { ok: false, notice: error.message };
  await db.from("crew_accounts").update({ active }).eq("team_member_id", teamMemberId);
  revalidatePath("/CanesPressure/settings");
  return { ok: true };
}

// ── 0015: roles + permission flags ───────────────────────────────────────────

// Promote/demote between technician and ops manager. Updates the roster row
// and, when an account already exists, the account itself — so the change
// takes effect on the next page load, not just the next sign-in.
export async function setCrewMemberRole(
  teamMemberId: string,
  role: CrewAccountRole,
): Promise<CrewOwnerActionResult> {
  if (!(await requireOwner())) return { ok: false, notice: "Owner sign-in required." };
  if (role !== "technician" && role !== "ops_manager") {
    return { ok: false, notice: "Invalid role." };
  }
  const db = canesDb();
  const teamRole = role === "ops_manager" ? "ops_manager" : "worker";
  const { error } = await db
    .from("team_members")
    .update({ role: teamRole })
    .eq("id", teamMemberId)
    .in("role", ["worker", "ops_manager"]);
  if (error) return { ok: false, notice: error.message };
  const { error: accErr } = await db
    .from("crew_accounts")
    .update({ account_role: role })
    .eq("team_member_id", teamMemberId);
  if (accErr) return { ok: false, notice: `Run migration 0015 first: ${accErr.message}` };
  revalidatePath("/CanesPressure/settings");
  return { ok: true, notice: role === "ops_manager" ? "Promoted to ops manager." : "Set to technician." };
}

// Flip one permission flag on an account. Merges into the stored jsonb so the
// other flags keep their explicit values (unset keys fall back to role defaults).
export async function setCrewAccountPermission(
  teamMemberId: string,
  key: CrewPermissionKey,
  value: boolean,
): Promise<CrewOwnerActionResult> {
  if (!(await requireOwner())) return { ok: false, notice: "Owner sign-in required." };
  if (!CREW_PERMISSION_KEYS.includes(key)) return { ok: false, notice: "Unknown permission." };
  const db = canesDb();
  const { data: account, error: readErr } = await db
    .from("crew_accounts")
    .select("id, permissions")
    .eq("team_member_id", teamMemberId)
    .maybeSingle();
  if (readErr) return { ok: false, notice: readErr.message };
  if (!account) {
    return { ok: false, notice: "They need to sign in to the portal once before permissions can be set." };
  }
  const stored = (account.permissions ?? {}) as Record<string, boolean>;
  const { error } = await db
    .from("crew_accounts")
    .update({ permissions: { ...stored, [key]: value } })
    .eq("id", account.id);
  if (error) return { ok: false, notice: `Run migration 0015 first: ${error.message}` };
  revalidatePath("/CanesPressure/settings");
  return { ok: true };
}

export async function addJobChecklistItem(input: {
  jobId: string;
  name: string;
  required: boolean;
}): Promise<CrewOwnerActionResult> {
  if (!(await requireDispatcher())) return { ok: false, notice: "Owner sign-in required." };
  const name = input.name.trim();
  if (!name) return { ok: false, notice: "Checklist step is required." };

  const db = canesDb();
  const { data: job } = await db
    .from("jobs")
    .select("status")
    .eq("id", input.jobId)
    .maybeSingle();
  if (!job) return { ok: false, notice: "Job not found." };
  if (TERMINAL_JOB_STATUSES.includes(job.status)) {
    return { ok: false, notice: "A finished job's checklist cannot be changed." };
  }

  const { data: lastItem } = await db
    .from("job_items")
    .select("position")
    .eq("job_id", input.jobId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await db.from("job_items").insert({
    job_id: input.jobId,
    estimate_item_id: null,
    position: Number(lastItem?.position ?? -1) + 1,
    name,
    quantity: 1,
    line_total_cents: 0,
    done: false,
    required: input.required,
    checklist_only: true,
  });
  if (error) return { ok: false, notice: error.message };
  refreshJobChecklist(input.jobId);
  return { ok: true };
}

export async function removeJobChecklistItem(
  itemId: string,
): Promise<CrewOwnerActionResult> {
  if (!(await requireDispatcher())) return { ok: false, notice: "Owner sign-in required." };
  const db = canesDb();
  const { data: item } = await db
    .from("job_items")
    .select("job_id, checklist_only")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { ok: false, notice: "Checklist step not found." };
  if (!item.checklist_only) {
    return { ok: false, notice: "Sold service items cannot be removed from the checklist." };
  }
  const { data: job } = await db
    .from("jobs")
    .select("status")
    .eq("id", item.job_id)
    .maybeSingle();
  if (job && TERMINAL_JOB_STATUSES.includes(job.status)) {
    return { ok: false, notice: "A finished job's checklist cannot be changed." };
  }

  const { error } = await db
    .from("job_items")
    .delete()
    .eq("id", itemId)
    .eq("checklist_only", true);
  if (error) return { ok: false, notice: error.message };
  refreshJobChecklist(item.job_id);
  return { ok: true };
}

// ── Job photos, owner side (Crew Phase C) ─────────────────────────────────────
// The owner uploads through the same grant → direct-to-Storage → finalize flow
// as technicians, and additionally reviews: recategorize, caption, approve for
// the future customer gallery, and soft-delete. Owner uploads/approvals carry a
// null account id; the activity detail records that the office acted.

const MEDIA_DEMO_NOTICE = "Photos are disabled in the demo.";

function refreshJobMedia(jobId: string): void {
  revalidatePath("/CanesPressure/schedule");
  revalidatePath("/CanesPressure/crew");
  revalidatePath(`/CanesPressure/crew/jobs/${jobId}`);
}

export async function ownerListJobMedia(
  jobId: string,
): Promise<CrewOwnerActionResult & { items?: JobMediaItem[] }> {
  if (!(await requireDispatcher())) return { ok: false, notice: "Owner sign-in required." };
  if (!canesConfigured()) return { ok: true, items: [] };
  try {
    return { ok: true, items: await listJobMedia(jobId, "owner") };
  } catch (error) {
    return {
      ok: false,
      notice: error instanceof Error ? error.message : "Photos failed to load.",
    };
  }
}

export async function ownerRequestJobPhotoUpload(
  jobId: string,
  input: { mimeType: string; sizeBytes: number; category: JobMediaCategory },
): Promise<CrewOwnerActionResult & { grant?: MediaUploadGrant }> {
  if (!(await requireDispatcher())) return { ok: false, notice: "Owner sign-in required." };
  if (!canesConfigured()) return { ok: false, notice: MEDIA_DEMO_NOTICE };
  if (!OWNER_UPLOAD_CATEGORIES.includes(input.category)) {
    return { ok: false, notice: "Choose a photo category." };
  }
  const invalid = validateMediaUpload(input);
  if (invalid) return { ok: false, notice: invalid };
  const { data: job } = await canesDb().from("jobs").select("status").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, notice: "Job not found." };
  if (job.status === "canceled") {
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

export async function ownerFinalizeJobPhotoUpload(
  input: MediaFinalizeInput,
): Promise<CrewOwnerActionResult> {
  if (!(await requireDispatcher())) return { ok: false, notice: "Owner sign-in required." };
  if (!canesConfigured()) return { ok: false, notice: MEDIA_DEMO_NOTICE };
  if (!OWNER_UPLOAD_CATEGORIES.includes(input.category)) {
    return { ok: false, notice: "Choose a photo category." };
  }
  const { row, notice } = await finalizeMediaUpload(input, null);
  if (!row) return { ok: false, notice: notice ?? "The upload could not be saved." };
  await recordJobMediaActivity(input.jobId, null, "media_uploaded", {
    mediaId: row.id,
    category: row.category,
    by: "owner",
  });
  refreshJobMedia(input.jobId);
  return { ok: true, notice: "Photo added." };
}

export async function updateJobMediaDetails(
  mediaId: string,
  input: { category: JobMediaCategory; caption: string },
): Promise<CrewOwnerActionResult> {
  if (!(await requireDispatcher())) return { ok: false, notice: "Owner sign-in required." };
  if (!canesConfigured()) return { ok: false, notice: MEDIA_DEMO_NOTICE };
  if (!OWNER_UPLOAD_CATEGORIES.includes(input.category)) {
    return { ok: false, notice: "Choose a photo category." };
  }
  const row = await getJobMediaRow(mediaId);
  if (!row || row.deleted_at) return { ok: false, notice: "Photo not found." };
  const { error } = await canesDb()
    .from("job_media")
    .update({
      category: input.category,
      caption: input.caption.trim().slice(0, 500) || null,
    })
    .eq("id", mediaId);
  if (error) return { ok: false, notice: error.message };
  await recordJobMediaActivity(row.job_id, null, "media_updated", {
    mediaId,
    category: input.category,
    by: "owner",
  });
  refreshJobMedia(row.job_id);
  return { ok: true, notice: "Photo updated." };
}

export async function setJobMediaCustomerVisible(
  mediaId: string,
  visible: boolean,
): Promise<CrewOwnerActionResult> {
  if (!(await requireDispatcher())) return { ok: false, notice: "Owner sign-in required." };
  if (!canesConfigured()) return { ok: false, notice: MEDIA_DEMO_NOTICE };
  const row = await getJobMediaRow(mediaId);
  if (!row || row.deleted_at) return { ok: false, notice: "Photo not found." };
  const { error } = await canesDb()
    .from("job_media")
    .update(
      visible
        ? { visibility: "customer", approved_at: new Date().toISOString() }
        : { visibility: "assigned_crew", approved_at: null, approved_by_account_id: null },
    )
    .eq("id", mediaId);
  if (error) return { ok: false, notice: error.message };
  await recordJobMediaActivity(row.job_id, null, visible ? "media_approved" : "media_unapproved", {
    mediaId,
    by: "owner",
  });
  refreshJobMedia(row.job_id);
  return { ok: true, notice: visible ? "Approved for the customer." : "Hidden from the customer." };
}

export async function deleteJobMedia(mediaId: string): Promise<CrewOwnerActionResult> {
  if (!(await requireDispatcher())) return { ok: false, notice: "Owner sign-in required." };
  if (!canesConfigured()) return { ok: false, notice: MEDIA_DEMO_NOTICE };
  const row = await getJobMediaRow(mediaId);
  if (!row || row.deleted_at) return { ok: false, notice: "Photo not found." };
  const { error } = await canesDb()
    .from("job_media")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", mediaId)
    .is("deleted_at", null);
  if (error) return { ok: false, notice: error.message };
  await recordJobMediaActivity(row.job_id, null, "media_deleted", { mediaId, by: "owner" });
  refreshJobMedia(row.job_id);
  return { ok: true, notice: "Photo removed." };
}
