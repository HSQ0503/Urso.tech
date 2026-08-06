import * as SecureStore from "expo-secure-store";
import { API_BASE } from "@/api";
import {
  authConfigured,
  clearCanesCrewSession,
  getAccessToken,
} from "@/auth";
import { clearAdminSession, getAdminProfile, getAdminToken } from "@/session";
import { clearWgSession, wgAuthConfigured, wgSupabase } from "@/wg-auth";
import { invalidateCanesPushAfterSessionSelection } from "@/push-notifications";
import { lockSupportMode } from "@/platform/support-lock";
import type { Workspace, WorkspaceSession } from "@/platform/types";

const ACTIVE_WORKSPACE_KEY = "urso_active_workspace";
let recentNoSessionDetectionAt = 0;

type WgMembership = {
  name: string;
  email: string;
  role: "urso_admin" | "owner" | "manager";
  clients: { slug: string; name: string } | null;
};

export function platformConfigured(): boolean {
  return authConfigured() || wgAuthConfigured();
}

export async function rememberWorkspace(workspace: Workspace): Promise<void> {
  await SecureStore.setItemAsync(ACTIVE_WORKSPACE_KEY, workspace);
}

export function consumeRecentNoSessionDetection(): boolean {
  const detectedRecently = Date.now() - recentNoSessionDetectionAt < 5_000;
  recentNoSessionDetectionAt = 0;
  return detectedRecently;
}

export async function signOutPlatform(): Promise<void> {
  lockSupportMode();
  await Promise.allSettled([
    clearAdminSession(),
    clearCanesCrewSession(),
    clearWgSession(),
    SecureStore.deleteItemAsync(ACTIVE_WORKSPACE_KEY),
  ]);
}

async function activeWorkspace(): Promise<Workspace | null> {
  const saved = await SecureStore.getItemAsync(ACTIVE_WORKSPACE_KEY);
  return saved === "admin" || saved === "canes-owner" || saved === "canes-crew" || saved === "woof-gang"
    ? saved
    : null;
}

export async function validateCanesSession(): Promise<WorkspaceSession | null> {
  const [token, profile] = await Promise.all([getAdminToken(), getAdminProfile()]);
  if (!token || !profile) {
    if (token || profile) await clearAdminSession();
    return null;
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/mobile/session`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as {
      ok?: boolean;
      data?: { platformRole?: "admin" | "member" | "crew" };
    };
    if (!response.ok || body.ok !== true) {
      await clearAdminSession();
      return null;
    }
    const workspace: Workspace = body.data?.platformRole === "admin" ? "admin" : "canes-owner";
    return {
      workspace,
      email: profile.email,
      name: profile.name,
    };
  } catch {
    // A network outage cannot prove a stored credential stale. Let the caller
    // remain in the workspace, where API requests retain their normal offline
    // handling rather than making the login gate a false sign-out.
    return {
      workspace: profile.scope === "admin" ? "admin" : "canes-owner",
      email: profile.email,
      name: profile.name,
    };
  }
}

export async function validatePlatformAdminSession(): Promise<WorkspaceSession | null> {
  const session = await validateCanesSession();
  return session?.workspace === "admin" ? session : null;
}

async function validateCanesCrewSession(): Promise<WorkspaceSession | null> {
  if (!authConfigured()) return null;
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(`${API_BASE}/api/v1/canes/crew/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as { ok?: boolean; data?: { email?: string; name?: string } };
    if (!response.ok || body.ok !== true) {
      await clearCanesCrewSession();
      return null;
    }
    return { workspace: "canes-crew", email: body.data?.email ?? null, name: body.data?.name ?? null };
  } catch {
    return { workspace: "canes-crew", email: null, name: null };
  }
}

export async function validateWgSession(): Promise<WorkspaceSession | null> {
  if (!wgAuthConfigured()) return null;
  const {
    data: { user },
    error: userError,
  } = await wgSupabase().auth.getUser();
  if (userError || !user) {
    await clearWgSession();
    return null;
  }

  const { data, error } = await wgSupabase()
    .from("app_users")
    .select("name, email, role, clients(slug, name)")
    .eq("user_id", user.id)
    .maybeSingle();
  const membership = data as WgMembership | null;
  const workspace: Workspace | null =
    membership?.role === "urso_admin"
      ? "admin"
      : membership?.clients?.slug === "woof-gang"
        ? "woof-gang"
        : null;
  if (error || !membership || !workspace) {
    await clearWgSession();
    return null;
  }
  return {
    workspace,
    email: membership.email ?? user.email ?? null,
    name: membership.name ?? null,
  };
}

// Validate each identity directly. In particular, the Canes crew check never
// calls api.me(), whose generic bearer selection could prefer a stale admin
// token over the crew token being tested.
export async function detectWorkspaceSession(): Promise<WorkspaceSession | null> {
  const [admin, crew, woofGang, remembered] = await Promise.all([
    validateCanesSession(),
    validateCanesCrewSession(),
    validateWgSession(),
    activeWorkspace(),
  ]);
  const sessions = [admin, crew, woofGang].filter(
    (session): session is WorkspaceSession => session !== null,
  );
  const selected = sessions.find((session) => session.workspace === remembered) ?? sessions[0] ?? null;

  if (selected) await rememberWorkspace(selected.workspace);
  else await SecureStore.deleteItemAsync(ACTIVE_WORKSPACE_KEY);
  if (
    selected?.workspace !== "canes-owner" &&
    selected?.workspace !== "canes-crew"
  ) {
    await invalidateCanesPushAfterSessionSelection();
  }
  recentNoSessionDetectionAt = selected ? 0 : Date.now();
  return selected;
}
