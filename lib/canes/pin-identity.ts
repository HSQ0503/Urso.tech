import { getAdminSession } from "@/lib/urso-auth";
import { getTechnicianActor } from "@/lib/canes/crew-auth";
import { adminPinKey, crewPinKey } from "@/lib/canes/pin";

// Which identity a PIN action/screen operates on. Surface-aware: the identity
// is chosen by the surface being returned to, NOT a fixed admin-first order —
// a browser holding BOTH an admin and a crew session must resolve to the CREW
// identity when returning to /CanesPressure/crew, or the crew layout (which
// gates on the crew PIN) and the pin page (which would otherwise pick admin)
// ping-pong forever. Shared by the pin page and the pin server actions so the
// two never disagree.

export type PinKind = "admin" | "crew";
export type PinIdentity = { key: string; home: string; kind: PinKind; firstName: string };

const firstNameForAdmin = (email: string) =>
  email === "canespressurewashing@gmail.com" ? "Sebastian" : "Han";

export async function resolvePinIdentity(returnTo?: string): Promise<PinIdentity | null> {
  const wantsCrew = Boolean(returnTo && returnTo.startsWith("/CanesPressure/crew"));
  const [admin, tech] = await Promise.all([
    getAdminSession(),
    getTechnicianActor().catch(() => null),
  ]);

  // Returning to the crew portal → crew identity wins even if an admin session
  // is also present (this is what breaks the dual-session loop).
  if (wantsCrew && tech) {
    return {
      key: crewPinKey(tech.accountId),
      home: "/CanesPressure/crew",
      kind: "crew",
      firstName: tech.name.split(" ")[0] || tech.name,
    };
  }
  if (admin) {
    return {
      key: adminPinKey(admin.email),
      home: "/CanesPressure",
      kind: "admin",
      firstName: firstNameForAdmin(admin.email),
    };
  }
  if (tech) {
    return {
      key: crewPinKey(tech.accountId),
      home: "/CanesPressure/crew",
      kind: "crew",
      firstName: tech.name.split(" ")[0] || tech.name,
    };
  }
  return null;
}
