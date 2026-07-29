import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clearAdminSession, saveAdminSession } from "./session";

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

// Passwordless: a code, not a magic link. A link has to survive the mail app,
// Safari, and a universal-link association, and any break in that chain strands
// the user outside the app.
//
// ── One email field for two different identity systems ──────────────────────
//
// Owners are the server's provisioned ADMINS map; technicians are Supabase Auth
// accounts. Different backends, different credentials. The obvious solution —
// ask "are you an owner or crew?" — is a bad question: nobody should have to
// know which authentication system their employer uses.
//
// We also cannot detect it from the response, and that is deliberate: the admin
// endpoint answers identically for provisioned and unknown addresses so it can't
// be used to discover who has owner access. That anti-enumeration property is
// worth keeping, so the client works around it rather than weakening it.
//
// So both are asked. Exactly one will actually deliver an email, because each
// backend silently ignores an address it doesn't own. The user types the code
// they received and the verify step figures out which system issued it.

const API_BASE: string = process.env.EXPO_PUBLIC_API_BASE ?? "https://urso.ws";

export type LoginResult = { ok: boolean; notice?: string };

async function requestAdminCode(email: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/v1/auth/request-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
  } catch {
    // A network failure here must not block the crew path below.
  }
}

export async function sendLoginCode(email: string): Promise<LoginResult> {
  if (!authConfigured()) return { ok: false, notice: "The app is not configured yet." };
  const address = email.trim().toLowerCase();

  const [, crew] = await Promise.all([
    requestAdminCode(address),
    supabase()
      .auth.signInWithOtp({
        email: address,
        // Provisioning stays allowlist-only and server-side: the crew_accounts
        // row must already exist. Never let a login create an account.
        options: { shouldCreateUser: false },
      })
      .then((r) => r.error),
  ]);

  // "Signups not allowed" just means this address is not a technician — it may
  // still be an owner, whose code went out through the admin path. Surfacing
  // Supabase's wording here would tell an owner their own email is invalid.
  if (crew && !/signup|not allowed|not found/i.test(crew.message)) {
    // A real fault (rate limit, outage) is worth showing.
    return { ok: false, notice: crew.message };
  }
  return { ok: true };
}

export type VerifiedIdentity = "owner" | "crew";

// Try the admin exchange first, then Supabase. Order is a cost choice, not a
// security one — both verify cryptographically and neither can be satisfied by
// a code the other issued.
export async function verifyLoginCode(
  email: string,
  token: string,
): Promise<LoginResult & { identity?: VerifiedIdentity }> {
  if (!authConfigured()) return { ok: false, notice: "The app is not configured yet." };
  const address = email.trim().toLowerCase();
  const code = token.trim();

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
    // A lockout is about this person's own behaviour and worth showing straight
    // away rather than falling through to a second, confusing failure.
    if (res.status === 429) return { ok: false, notice: body.notice ?? "Too many tries." };
  } catch {
    // Fall through to the crew path — the device may be offline for our API but
    // still reach Supabase, and vice versa.
  }

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
  if (!authConfigured()) return;
  // Revokes server-side too, unlike the stateless admin token.
  await supabase().auth.signOut();
}
