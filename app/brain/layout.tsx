// Urso Brain shell — its own product surface on its OWN Supabase project
// (Urso HQ; see lib/brain/supabase.ts). Access = signed in to that project.
//
// The chrome is Obsidian's (components/brain/shell.tsx): the brain IS a vault,
// so it wears a vault's UI rather than the dashboard's. This layout's only job
// is to hand the shell the file list for its explorer.

import { Suspense } from "react";
import type { Metadata } from "next";
import { getBrainUser } from "@/lib/brain/access";
import {
  canEditBrainTruth,
  getAuthorizedDocManifest,
  resolveBrainPrincipal,
} from "@/lib/brain/authorization";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { BrainShell } from "@/components/brain/shell";

export const metadata: Metadata = {
  title: "Urso Brain",
  description: "The company brain — identity-aware AI over the whole company's knowledge.",
};

export default async function BrainLayout({ children }: { children: React.ReactNode }) {
  // No redirect here: /brain/login renders inside this layout, and the proxy +
  // each protected page enforce auth. The explorer is only populated for a
  // signed-in user, so the vault's shape never leaks to the login screen.
  const user = await getBrainUser();
  const admin = user ? ursoDbSafe() : null;
  const principal = admin && user ? await resolveBrainPrincipal(admin, user).catch(() => null) : null;
  const manifest =
    admin && principal ? await getAuthorizedDocManifest(admin, principal, null).catch(() => []) : [];
  const files = manifest.map((d) => ({ path: d.path, title: d.title }));

  return (
    <div className="theme-scope">
      {/* The shell reads ?path= to know which doc is open, and Next requires a
          boundary around useSearchParams. */}
      <Suspense fallback={<div className="ob-app" />}>
        <BrainShell files={files} canEdit={principal ? canEditBrainTruth(principal) : false}>
          {children}
        </BrainShell>
      </Suspense>
    </div>
  );
}
