"use server";

import { redirect } from "next/navigation";
import { canesDb } from "@/lib/canes/supabase";
import { createCanesAuthClient } from "@/lib/canes/crew-auth-client";

export type TechnicianLoginResult = { ok: boolean; notice?: string };

type ApprovedMember = {
  id: string;
  email: string;
  crew_id: string;
  active: boolean;
};

type CrewAccount = {
  id: string;
  auth_user_id: string;
  active: boolean;
};

function normalizedEmail(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().toLowerCase();
}

async function ensureApprovedTechnicianAccount(
  email: string,
): Promise<CrewAccount | null> {
  const db = canesDb();
  const { data: rawMember, error: memberError } = await db
    .from("team_members")
    .select("id, email, crew_id, active")
    .eq("email", email)
    .eq("role", "worker")
    .maybeSingle();
  if (memberError) throw new Error(memberError.message);
  const member = rawMember as ApprovedMember | null;
  if (!member?.active || !member.crew_id) return null;

  const { data: rawExisting } = await db
    .from("crew_accounts")
    .select("id, auth_user_id, active")
    .eq("team_member_id", member.id)
    .maybeSingle();
  const existing = rawExisting as CrewAccount | null;
  if (existing) {
    if (!existing.active) return null;
    await db
      .from("crew_account_access")
      .delete()
      .eq("account_id", existing.id)
      .neq("crew_id", member.crew_id);
    await db.from("crew_account_access").upsert(
      { account_id: existing.id, crew_id: member.crew_id },
      { onConflict: "account_id,crew_id", ignoreDuplicates: true },
    );
    return existing;
  }

  const { data: usersData, error: listError } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw new Error(listError.message);
  let user = usersData.users.find(
    (candidate) => candidate.email?.toLowerCase() === email,
  );
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { canes_role: "technician" },
    });
    if (error) throw new Error(error.message);
    user = data.user;
  }
  if (!user) throw new Error("Could not provision the technician Auth user.");

  const { data: rawCreated, error: accountError } = await db
    .from("crew_accounts")
    .insert({
      auth_user_id: user.id,
      team_member_id: member.id,
      email,
      active: true,
    })
    .select("id, auth_user_id, active")
    .single();
  if (accountError) {
    // A simultaneous first-login request may have won the unique insert.
    const { data: raced } = await db
      .from("crew_accounts")
      .select("id, auth_user_id, active")
      .eq("team_member_id", member.id)
      .maybeSingle();
    if (!raced) throw new Error(accountError.message);
    return raced as CrewAccount;
  }
  const created = rawCreated as CrewAccount;
  await db.from("crew_account_access").upsert(
    { account_id: created.id, crew_id: member.crew_id },
    { onConflict: "account_id,crew_id", ignoreDuplicates: true },
  );
  return created;
}

export async function sendTechnicianSignInLink(
  _previous: TechnicianLoginResult,
  formData: FormData,
): Promise<TechnicianLoginResult> {
  const email = normalizedEmail(formData.get("email"));
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { ok: false, notice: "Enter a valid email address." };
  }

  try {
    const account = await ensureApprovedTechnicianAccount(email);
    // Do not reveal whether an address is on the employee allowlist.
    if (!account) return { ok: true };

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";
    const callback = new URL("/CanesPressure/auth/callback", base).toString();
    const auth = await createCanesAuthClient();
    const { error } = await auth.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: callback },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (error) {
    console.error("[canes crew auth] sign-in link failed", error);
    return {
      ok: false,
      notice: "We could not send the sign-in link. Try again in a minute.",
    };
  }
}

export async function signOutTechnician(): Promise<void> {
  const auth = await createCanesAuthClient();
  await auth.auth.signOut();
  redirect("/CanesPressure/crew/login");
}
