"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/urso-auth";
import { canesDb } from "@/lib/canes/supabase";
import { toE164 } from "@/lib/canes/types";

export type CrewOwnerActionResult = { ok: boolean; notice?: string };

const TERMINAL_JOB_STATUSES = ["completed", "invoiced", "paid", "canceled"];

async function requireOwner(): Promise<boolean> {
  return Boolean(await getAdminSession());
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
  input: { name: string; email: string; phone: string; crewId: string },
): Promise<CrewOwnerActionResult> {
  if (!(await requireOwner())) return { ok: false, notice: "Owner sign-in required." };
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = toE164(input.phone);
  if (!name) return { ok: false, notice: "Name is required." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, notice: "Enter a valid email." };
  if (!phone) return { ok: false, notice: "Enter a valid US phone number." };

  const db = canesDb();
  const { data: crew } = await db
    .from("crews")
    .select("id")
    .eq("id", input.crewId)
    .eq("active", true)
    .maybeSingle();
  if (!crew) return { ok: false, notice: "Choose an active crew." };

  const { error } = await db.from("team_members").insert({
    name,
    email,
    phone,
    crew_id: input.crewId,
    role: "worker",
    comp_type: "hourly",
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
    .eq("role", "worker");
  if (error) return { ok: false, notice: error.message };
  await db.from("crew_accounts").update({ active }).eq("team_member_id", teamMemberId);
  revalidatePath("/CanesPressure/settings");
  return { ok: true };
}

export async function addJobChecklistItem(input: {
  jobId: string;
  name: string;
  required: boolean;
}): Promise<CrewOwnerActionResult> {
  if (!(await requireOwner())) return { ok: false, notice: "Owner sign-in required." };
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
  if (!(await requireOwner())) return { ok: false, notice: "Owner sign-in required." };
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
