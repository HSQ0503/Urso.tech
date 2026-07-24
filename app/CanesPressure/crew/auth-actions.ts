"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { Resend } from "resend";
import { canesDb } from "@/lib/canes/supabase";
import { createCanesAuthClient } from "@/lib/canes/crew-auth-client";

export type TechnicianLoginResult = { ok: boolean; notice?: string };

type ApprovedMember = {
  id: string;
  email: string;
  crew_id: string | null;
  active: boolean;
  role: string;
};

type CrewAccount = {
  id: string;
  auth_user_id: string;
  active: boolean;
};

function normalizedEmail(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().toLowerCase();
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

function technicianSignInHtml(url: string): string {
  const safeUrl = escapeHtml(url);
  return `<!doctype html><html><body style="margin:0;background:#0b0b0c;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;background:#141416;border:1px solid #24242a;border-radius:14px;padding:32px;">
      <tr><td style="font-size:20px;font-weight:700;color:#f4f5f6;letter-spacing:-0.02em;">Canes Pressure Washing <span style="color:#f97316;">&bull;</span></td></tr>
      <tr><td style="padding-top:20px;font-size:16px;font-weight:600;color:#f4f5f6;">Sign in to your crew portal</td></tr>
      <tr><td style="padding-top:8px;font-size:13.5px;line-height:1.55;color:#a2a3a8;">Open your assigned jobs, schedule, job details, and checklists. This secure link expires shortly and can only be used once.</td></tr>
      <tr><td style="padding-top:24px;"><a href="${safeUrl}" style="display:inline-block;background:#f97316;color:#111111;text-decoration:none;font-size:14px;font-weight:700;padding:13px 22px;border-radius:11px;">Sign in &rarr;</a></td></tr>
      <tr><td style="padding-top:24px;font-size:11px;line-height:1.5;color:#6b6c72;font-family:ui-monospace,Menlo,monospace;">If the button does not work, paste this link into your browser:<br>${safeUrl}</td></tr>
      <tr><td style="padding-top:18px;font-size:11px;line-height:1.5;color:#6b6c72;">If you did not request this email, you can ignore it.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function technicianSignInText(url: string): string {
  return `Sign in to your Canes Pressure Washing crew portal

Open your assigned jobs, schedule, job details, and checklists:
${url}

This secure link expires shortly and can only be used once. If you did not request it, you can ignore this email.`;
}

async function ensureApprovedTechnicianAccount(
  email: string,
): Promise<CrewAccount | null> {
  const db = canesDb();
  // Workers and ops managers may sign in (0015). A worker still needs a crew;
  // an ops manager runs every crew, so crew_id is optional for them.
  const { data: rawMember, error: memberError } = await db
    .from("team_members")
    .select("id, email, crew_id, active, role")
    .eq("email", email)
    .in("role", ["worker", "ops_manager"])
    .maybeSingle();
  if (memberError) throw new Error(memberError.message);
  const member = rawMember as ApprovedMember | null;
  if (!member?.active) return null;
  const isOps = member.role === "ops_manager";
  if (!isOps && !member.crew_id) return null;

  const { data: rawExisting } = await db
    .from("crew_accounts")
    .select("id, auth_user_id, active")
    .eq("team_member_id", member.id)
    .maybeSingle();
  const existing = rawExisting as CrewAccount | null;
  if (existing) {
    if (!existing.active) return null;
    // Keep the account's role in sync with the roster: promoting/demoting on
    // the roster takes effect at the next sign-in. Metadata — a failed update
    // (0015 not yet migrated) must not block login.
    const { error: roleErr } = await db
      .from("crew_accounts")
      .update({ account_role: isOps ? "ops_manager" : "technician" })
      .eq("id", existing.id);
    if (roleErr) console.error(`[canes crew auth] account_role sync failed: ${roleErr.message}`);
    if (!isOps && member.crew_id) {
      await db
        .from("crew_account_access")
        .delete()
        .eq("account_id", existing.id)
        .neq("crew_id", member.crew_id);
      await db.from("crew_account_access").upsert(
        { account_id: existing.id, crew_id: member.crew_id },
        { onConflict: "account_id,crew_id", ignoreDuplicates: true },
      );
    }
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
      // account_role only when ops: the column default covers technicians, and
      // omitting it keeps worker logins working before 0015 widens the check.
      ...(isOps ? { account_role: "ops_manager" } : {}),
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
  if (!isOps && member.crew_id) {
    await db.from("crew_account_access").upsert(
      { account_id: created.id, crew_id: member.crew_id },
      { onConflict: "account_id,crew_id", ignoreDuplicates: true },
    );
  }
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

    const resendKey = process.env.RESEND_API;
    if (!resendKey) throw new Error("RESEND_API is not configured.");

    const db = canesDb();
    const { data: linkData, error: linkError } =
      await db.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !linkData.properties) {
      throw new Error(linkError?.message ?? "Could not generate a sign-in link.");
    }

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";
    const callback = new URL("/CanesPressure/auth/callback", base);
    callback.searchParams.set("token_hash", linkData.properties.hashed_token);
    callback.searchParams.set("type", "magiclink");

    const tokenId = createHash("sha256")
      .update(linkData.properties.hashed_token)
      .digest("hex")
      .slice(0, 32);
    const resend = new Resend(resendKey);
    const { error: sendError } = await resend.emails.send(
      {
        from:
          process.env.CANES_LOGIN_FROM ??
          process.env.URSO_LOGIN_FROM ??
          "Canes Pressure Washing <hello@urso.ws>",
        to: email,
        subject: "Sign in to your Canes crew portal",
        html: technicianSignInHtml(callback.toString()),
        text: technicianSignInText(callback.toString()),
        tags: [{ name: "email_type", value: "canes_technician_login" }],
      },
      { idempotencyKey: `canes-login/${account.id}/${tokenId}` },
    );
    if (sendError) throw new Error(sendError.message);
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
