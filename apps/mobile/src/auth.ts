import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Technician authentication.
//
// The crew already uses passwordless Supabase Auth on the web, in the Canes
// project — so mobile reuses that identity wholesale rather than inventing a
// second one. The app holds a Supabase session and sends its access token as a
// Bearer header; the server's getTechnicianActor() accepts that alongside the
// web cookie and resolves the SAME actor, so crew scoping and permission flags
// are literally the same code on both surfaces.
//
// Only the PUBLISHABLE key is ever in this bundle. Everything privileged —
// the secret key, Twilio, Square, Resend — stays behind /api/v1. A mobile
// binary is not a secret store; assume anything shipped here is public.
//
// Sessions live in the iOS Keychain via expo-secure-store, not AsyncStorage,
// so a token survives a reinstall-proof secure enclave rather than sitting in
// readable app storage.

// EXPO_PUBLIC_ vars are inlined at build time and MUST be referenced with
// static dot notation — bracket access or destructuring is not substituted.
const SUPABASE_URL = process.env.EXPO_PUBLIC_CANES_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.EXPO_PUBLIC_CANES_SUPABASE_PUBLISHABLE_KEY ?? "";

export function authConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

// SecureStore caps a value at 2048 bytes. A Supabase session with a large JWT
// can exceed that, so values are chunked; a naive adapter silently fails to
// persist and the user is signed out on every cold start.
const CHUNK_LIMIT = 1800;

const storage = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(key);
    if (head === null) return null;
    if (!head.startsWith("__chunks__:")) return head;
    const count = Number(head.slice("__chunks__:".length));
    if (!Number.isFinite(count) || count <= 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(`${key}__${i}`);
      if (part === null) return null; // torn write — treat as signed out
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    await this.removeItem(key);
    if (value.length <= CHUNK_LIMIT) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const parts: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_LIMIT) {
      parts.push(value.slice(i, i + CHUNK_LIMIT));
    }
    for (let i = 0; i < parts.length; i += 1) {
      await SecureStore.setItemAsync(`${key}__${i}`, parts[i]);
    }
    await SecureStore.setItemAsync(key, `__chunks__:${parts.length}`);
  },

  async removeItem(key: string): Promise<void> {
    const head = await SecureStore.getItemAsync(key);
    if (head?.startsWith("__chunks__:")) {
      const count = Number(head.slice("__chunks__:".length));
      for (let i = 0; i < count; i += 1) {
        await SecureStore.deleteItemAsync(`${key}__${i}`);
      }
    }
    await SecureStore.deleteItemAsync(key);
  },
};

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  if (!authConfigured()) {
    throw new Error(
      "Canes Supabase is not configured — set EXPO_PUBLIC_CANES_SUPABASE_URL and EXPO_PUBLIC_CANES_SUPABASE_PUBLISHABLE_KEY in apps/mobile/.env.local.",
    );
  }
  client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      // There is no URL bar to read a callback from; deep links are handled
      // explicitly by the router instead.
      detectSessionInUrl: false,
    },
  });
  return client;
}

export async function getAccessToken(): Promise<string | null> {
  if (!authConfigured()) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

// Passwordless: the server mails a 6-digit code. A code beats a magic link on
// mobile — a link has to survive the mail app, Safari, and a universal-link
// association, and any break in that chain strands the user outside the app.
export async function sendLoginCode(email: string): Promise<{ ok: boolean; notice?: string }> {
  if (!authConfigured()) return { ok: false, notice: "The app is not configured yet." };
  const { error } = await supabase().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    // Provisioning stays allowlist-only and server-side: the crew_accounts row
    // must already exist. Never let a login create an account.
    options: { shouldCreateUser: false },
  });
  if (error) return { ok: false, notice: error.message };
  return { ok: true };
}

export async function verifyLoginCode(
  email: string,
  token: string,
): Promise<{ ok: boolean; notice?: string }> {
  if (!authConfigured()) return { ok: false, notice: "The app is not configured yet." };
  const { error } = await supabase().auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: "email",
  });
  if (error) return { ok: false, notice: error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  if (!authConfigured()) return;
  // Revokes server-side too, unlike the stateless admin session.
  await supabase().auth.signOut();
}
