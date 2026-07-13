import { cache } from "react";
import { redirect } from "next/navigation";
import { canesDb } from "@/lib/canes/supabase";
import { createCanesAuthClient } from "@/lib/canes/crew-auth-client";
import type { TechnicianActor } from "@/lib/canes/crew-types";

type AccountRow = {
  id: string;
  auth_user_id: string;
  team_member_id: string;
  email: string;
  active: boolean;
};

type TeamMemberRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  crew_id: string | null;
  active: boolean;
};

export const getTechnicianActor = cache(async (): Promise<TechnicianActor | null> => {
  const auth = await createCanesAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = canesDb();
  const { data: rawAccount } = await db
    .from("crew_accounts")
    .select("id, auth_user_id, team_member_id, email, active")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const account = rawAccount as AccountRow | null;
  if (!account?.active) return null;

  const { data: rawMember } = await db
    .from("team_members")
    .select("id, name, phone, email, crew_id, active")
    .eq("id", account.team_member_id)
    .maybeSingle();
  const member = rawMember as TeamMemberRow | null;
  if (!member?.active) return null;

  // The current permission contract is exactly one roster-assigned crew. Use
  // team_members.crew_id as the authority so moving an employee immediately
  // revokes the old crew; access rows become authoritative only when a real
  // multi-crew manager role and its removal UI are implemented.
  if (!member.crew_id) return null;
  const crewIds = [member.crew_id];

  const { data: rawCrews } = await db
    .from("crews")
    .select("id, name")
    .in("id", crewIds)
    .eq("active", true);
  const crews = (rawCrews ?? []) as { id: string; name: string }[];
  const activeIds = crews.map((crew) => crew.id);
  if (activeIds.length === 0) return null;

  return {
    kind: "technician",
    accountId: account.id,
    authUserId: user.id,
    teamMemberId: member.id,
    email: account.email,
    name: member.name,
    phone: member.phone,
    crewIds: activeIds,
    crewNames: crews.map((crew) => crew.name),
  };
});

export async function requireTechnicianActor(): Promise<TechnicianActor> {
  const actor = await getTechnicianActor();
  if (!actor) redirect("/CanesPressure/crew/login");
  return actor;
}

export async function technicianCanAccessJob(
  actor: TechnicianActor,
  jobId: string,
): Promise<boolean> {
  const { data } = await canesDb()
    .from("jobs")
    .select("id")
    .eq("id", jobId)
    .in("crew_id", actor.crewIds)
    .maybeSingle();
  return Boolean(data);
}

export async function requireTechnicianJob(
  actor: TechnicianActor,
  jobId: string,
): Promise<void> {
  if (!(await technicianCanAccessJob(actor, jobId))) {
    throw new Error("You do not have access to this job.");
  }
}
