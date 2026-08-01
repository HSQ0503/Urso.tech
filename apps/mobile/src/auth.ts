import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clearAdminSession, saveAdminSession } from "./session";
import { clearWgSession } from "./wg-auth";

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

// Kept separate from signOut() so a successful login into a different client
// can clear only Canes credentials without creating a dependency cycle.
export async function clearCanesCrewSession(): Promise<void> {
  if (!authConfigured()) return;
  await supabase().auth.signOut();
}

export async function clearCanesSessions(): Promise<void> {
  await clearAdminSession();
  await clearCanesCrewSession();
}

// Passwordless: a code, not a magic link. The Urso API resolves the provisioned
// identity server-side, asks the correct auth system to mint a challenge, and
// delivers exactly one branded email through Resend. The mobile bundle never
// learns which workspace owns an address before the code proves control of it.

const API_BASE: string = process.env.EXPO_PUBLIC_API_BASE ?? "https://urso.ws";

export type LoginResult = { ok: boolean; notice?: string };

export async function sendLoginCode(email: string): Promise<LoginResult> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/auth/request-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    const body = (await response.json()) as { ok?: boolean; notice?: string };
    if (response.ok && body.ok === true) return { ok: true };
    return { ok: false, notice: body.notice ?? "We couldn’t send that email. Try again." };
  } catch {
    return { ok: false, notice: "We couldn’t reach Urso. Check your connection and try again." };
  }
}

export type VerifiedIdentity = "owner" | "crew";

// Canes owner/admin codes are six digits. Supabase OTP length is configured per
// project and is currently eight, so a Supabase code must never be submitted to
// the owner verifier: that verifier correctly counts bad guesses and would lock
// a dual-provisioned Urso operator after repeated technician logins.
export async function verifyLoginCode(
  email: string,
  token: string,
): Promise<LoginResult & { identity?: VerifiedIdentity }> {
  if (!authConfigured()) return { ok: false, notice: "The app is not configured yet." };
  const address = email.trim().toLowerCase();
  const code = token.trim();

  if (code.length === 6) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/verify-code`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, code }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        notice?: string;
        data?: { token: string; email: string; name: string; scope: "canes" | "admin" };
      };
      if (res.ok && body.ok && body.data) {
        await saveAdminSession(body.data.token, {
          email: body.data.email,
          name: body.data.name,
          scope: body.data.scope,
        });
        return { ok: true, identity: "owner" };
      }
      // A lockout is about this person's own behaviour and worth showing
      // immediately rather than falling through to a confusing OTP failure.
      if (res.status === 429) return { ok: false, notice: body.notice ?? "Too many tries." };
    } catch {
      // Fall through to the crew path — the device may reach Supabase even when
      // the Urso API is temporarily unavailable.
    }
  }

  // Always try the Canes Supabase project. This is the technician path and its
  // OTP is currently eight digits, the same length as Woof Gang's. The caller
  // tries Woof Gang only if this project rejects the cryptographic challenge.
  const { error } = await supabase().auth.verifyOtp({
    email: address,
    token: code,
    type: "email",
  });
  if (error) {
    // Both systems rejected it. Say so plainly; naming which one failed would
    // disclose which identity the address belongs to.
    return { ok: false, notice: "That code didn’t work. Ask for a new one." };
  }
  return { ok: true, identity: "crew" };
}

export async function signOut(): Promise<void> {
  // Clear both identities regardless of which one is active: a stale token in
  // the Keychain would otherwise send the launch gate to the wrong surface.
  await clearAdminSession();
  // Revokes server-side too, unlike the stateless admin token. Sign out of
  // Woof Gang at the same time: this is a device-level Urso sign-out, not only
  // a Canes screen exit, so a previous client session cannot reappear later.
  await Promise.all([
    authConfigured() ? supabase().auth.signOut() : Promise.resolve(),
    clearWgSession(),
  ]);
}
