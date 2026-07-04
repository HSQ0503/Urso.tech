import { createHmac } from "node:crypto";
import { cookies } from "next/headers";

// Lightweight passcode gate for /CanesPressure until Phase 2 brings real
// role-based auth. When CANES_ACCESS_CODE is unset the area is open (demo
// mode). The cookie stores an HMAC of the code so rotating the code revokes
// every session.

const COOKIE = "canes_access";

// HMAC key for the access cookie. Set CANES_COOKIE_SECRET (any long random
// string) so a leaked cookie cannot be brute-forced offline back to the
// passcode; the fallbacks keep the gate working before that's configured.
function cookieSecret(): string {
  return process.env.CANES_COOKIE_SECRET ?? process.env.CANES_TWILIO_AUTH_TOKEN ?? "canes-gate-v1";
}

function tokenFor(code: string): string {
  return createHmac("sha256", cookieSecret()).update(code).digest("hex");
}

export function gateEnabled(): boolean {
  return Boolean(process.env.CANES_ACCESS_CODE);
}

export async function hasAccess(): Promise<boolean> {
  const code = process.env.CANES_ACCESS_CODE;
  if (!code) return true;
  const store = await cookies();
  return store.get(COOKIE)?.value === tokenFor(code);
}

export async function grantAccess(attempt: string): Promise<boolean> {
  const code = process.env.CANES_ACCESS_CODE;
  if (!code) return true;
  if (attempt !== code) return false;
  const store = await cookies();
  store.set(COOKIE, tokenFor(code), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/CanesPressure",
  });
  return true;
}
