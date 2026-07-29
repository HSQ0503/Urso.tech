import * as SecureStore from "expo-secure-store";

// The ADMIN half of identity. Technicians authenticate through Supabase (auth.ts);
// admins are the provisioned ADMINS map on the server and carry a k:"mobile"
// bearer token instead, which lives in the Keychain.
//
// Kept separate from auth.ts on purpose: two genuinely different credentials,
// and letting them share a module invites code that half-handles both.

const TOKEN_KEY = "urso_admin_token";
const PROFILE_KEY = "urso_admin_profile";

export type AdminProfile = { email: string; name: string; scope: "canes" | "admin" };

export async function saveAdminSession(token: string, profile: AdminProfile): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
}

export async function getAdminToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getAdminProfile(): Promise<AdminProfile | null> {
  const raw = await SecureStore.getItemAsync(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminProfile;
  } catch {
    return null;
  }
}

export async function clearAdminSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(PROFILE_KEY);
}
