"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/urso-auth";
import { canesDb } from "@/lib/canes/supabase";
import { toE164 } from "@/lib/canes/types";

export type CrewOwnerActionResult = { ok: boolean; notice?: string };

async function requireOwner(): Promise<boolean> {
  return Boolean(await getAdminSession());
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
