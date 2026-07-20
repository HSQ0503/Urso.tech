// v1 access gate for Urso Brain: the urso_admin role (Han + Guga). Demo personas
// are played by switching your own profile's department in settings — no extra
// users needed. Widen to org membership at multi-tenant.

import { getSession, type SessionUser } from "@/lib/auth";

export async function getBrainUser(): Promise<SessionUser | null> {
  const user = await getSession();
  if (!user || user.role !== "urso_admin") return null;
  return user;
}
