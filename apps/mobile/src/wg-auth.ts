import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createNamespacedSecureStore } from "@/platform/secure-store";

// Keep this project physically separate from Canes. The legacy URSO names are
// accepted so existing preview builds do not silently lose their configuration.
const WG_SUPABASE_URL =
  process.env.EXPO_PUBLIC_WG_SUPABASE_URL ?? process.env.EXPO_PUBLIC_URSO_SUPABASE_URL ?? "";
const WG_SUPABASE_KEY =
  process.env.EXPO_PUBLIC_WG_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_URSO_SUPABASE_PUBLISHABLE_KEY ??
  "";

const storage = createNamespacedSecureStore("urso_wg");
let client: SupabaseClient | null = null;

export type WgLoginResult = { ok: boolean; notice?: string };

export function wgAuthConfigured(): boolean {
  return Boolean(WG_SUPABASE_URL && WG_SUPABASE_KEY);
}

export function wgSupabase(): SupabaseClient {
  if (client) return client;
  if (!wgAuthConfigured()) {
    throw new Error(
      "Woof Gang Supabase is not configured — set EXPO_PUBLIC_WG_SUPABASE_URL and EXPO_PUBLIC_WG_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  client = createClient(WG_SUPABASE_URL, WG_SUPABASE_KEY, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

export async function getWgAccessToken(): Promise<string | null> {
  if (!wgAuthConfigured()) return null;
  const { data } = await wgSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function sendWgLoginCode(email: string): Promise<WgLoginResult> {
  if (!wgAuthConfigured()) return { ok: false, notice: "The app is not configured yet." };
  const { error } = await wgSupabase().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false },
  });
  // The screen deliberately uses the same response for an unknown account and
  // a configured password account. Supabase's raw message would be an oracle.
  if (error && !/signup|not allowed|not found/i.test(error.message)) {
    return { ok: false, notice: error.message };
  }
  return { ok: true };
}

export async function verifyWgLoginCode(email: string, token: string): Promise<WgLoginResult> {
  if (!wgAuthConfigured()) return { ok: false, notice: "The app is not configured yet." };
  const { error } = await wgSupabase().auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: "email",
  });
  return error ? { ok: false, notice: "That code didn’t work. Ask for a new one." } : { ok: true };
}

export async function signInWgWithPassword(
  email: string,
  password: string,
): Promise<WgLoginResult> {
  if (!wgAuthConfigured()) return { ok: false, notice: "The app is not configured yet." };
  const { error } = await wgSupabase().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  return error ? { ok: false, notice: "That email or password didn’t work." } : { ok: true };
}

export async function clearWgSession(): Promise<void> {
  if (!wgAuthConfigured()) return;
  await wgSupabase().auth.signOut();
}
