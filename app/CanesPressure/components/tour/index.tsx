import { getAdminSession } from "@/lib/urso-auth";
import { getTourDone } from "@/lib/canes/tour";
import { sweepStalePractice } from "./practice";
import { CHAPTERS } from "./chapters";
import { TourShell } from "./tour-shell";

// Server entry for the onboarding tour. Auto-opens exactly once per admin
// email (Sebastian, Han) — the first time they're signed in and haven't seen
// it. Always mounts the shell so the Settings "replay" button (a window event)
// works for everyone, including the legacy passcode gate.
//
// CHAPTERS is imported HERE, not in the client shell, so the tour copy ships
// in the gated RSC payload — never in the public JS bundle.
export async function CanesTour() {
  const session = await getAdminSession();
  const email = session?.email ?? null;
  const done = await getTourDone(email);
  // Abandonment backstop for the practice sandbox: one cheap read per load,
  // purge only when a practice run has sat stale for 24h.
  await sweepStalePractice();
  return <TourShell autoOpen={Boolean(email) && !done} chapters={CHAPTERS} />;
}
