import { API_BASE } from "@/api";
import { clearCanesCrewSession, clearCanesSessions, sendLoginCode, verifyLoginCode } from "@/auth";
import { getAdminProfile, saveAdminSession } from "@/session";
import {
  clearWgSession,
  getWgAccessToken,
  sendWgLoginCode,
  signInWgWithPassword,
  verifyWgLoginCode,
  wgAuthConfigured,
} from "@/wg-auth";
import { rememberWorkspace, validateWgSession } from "@/platform/session";
import type { Workspace } from "@/platform/types";

export type WorkspaceLoginResult = { ok: boolean; workspace?: Workspace; notice?: string };

function genericLoginFailure(): WorkspaceLoginResult {
  return { ok: false, notice: "Those details didn’t work. Try again or use an email code." };
}

type AdminExchangeBody = {
  ok?: boolean;
  notice?: string;
  data?: { token: string; email: string; name: string; scope: "admin" };
};

async function exchangeWgAdminSession(): Promise<WorkspaceLoginResult> {
  const accessToken = await getWgAccessToken();
  if (!accessToken) return genericLoginFailure();

  try {
    const response = await fetch(`${API_BASE}/api/v1/mobile/admin/exchange`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const body = (await response.json()) as AdminExchangeBody;
    if (!response.ok || body.ok !== true || !body.data) {
      return { ok: false, notice: body.notice ?? "Urso Control could not be unlocked." };
    }
    const { token, ...profile } = body.data;
    await saveAdminSession(token, profile);
    await clearCanesCrewSession();
    await rememberWorkspace("admin");
    return { ok: true, workspace: "admin" };
  } catch {
    return { ok: false, notice: "Urso Control could not be reached. Try again." };
  }
}

export async function sendWorkspaceCode(email: string): Promise<WorkspaceLoginResult> {
  const attempts = await Promise.all([
    sendLoginCode(email),
    wgAuthConfigured() ? sendWgLoginCode(email) : Promise.resolve({ ok: false }),
  ]);
  if (attempts.some((attempt) => attempt.ok)) return { ok: true };
  return { ok: false, notice: "The app is not configured yet." };
}

export async function verifyWorkspaceCode(
  email: string,
  code: string,
): Promise<WorkspaceLoginResult> {
  const entered = code.trim();

  // Canes owns both six-digit owner codes and Supabase technician OTPs. Its
  // verifier safely skips the owner endpoint for non-six-digit challenges, so
  // technicians are checked before an equally long Woof Gang OTP.
  const canes = await verifyLoginCode(email, entered);
  if (canes.ok) {
    const profile = await getAdminProfile();
    if (canes.identity === "owner" && profile) {
      const workspace: Workspace = profile.scope === "admin" ? "admin" : "canes-owner";
      await clearWgSession();
      await rememberWorkspace(workspace);
      return { ok: true, workspace };
    }
    if (canes.identity === "crew") {
      await clearWgSession();
      await rememberWorkspace("canes-crew");
      return { ok: true, workspace: "canes-crew" };
    }
  }

  const woofGang = await verifyWgLoginCode(email, entered);
  const session = woofGang.ok ? await validateWgSession() : null;
  if (!session) return genericLoginFailure();

  if (session.workspace === "admin") return exchangeWgAdminSession();

  await clearCanesSessions();
  await rememberWorkspace(session.workspace);
  return { ok: true, workspace: session.workspace };
}

export async function signInWorkspaceWithPassword(
  email: string,
  password: string,
): Promise<WorkspaceLoginResult> {
  const result = await signInWgWithPassword(email, password);
  const session = result.ok ? await validateWgSession() : null;
  if (!session) return genericLoginFailure();

  if (session.workspace === "admin") return exchangeWgAdminSession();

  await clearCanesSessions();
  await rememberWorkspace(session.workspace);
  return { ok: true, workspace: session.workspace };
}
