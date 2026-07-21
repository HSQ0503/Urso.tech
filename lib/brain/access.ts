// Brain access = a signed-in user of the URSO HQ Supabase project (its own auth,
// fully separate from the Woof Gang dashboard). Accounts are provisioned by hand
// in the Urso project's Auth dashboard — everyone in that project is Urso.

import { cache } from "react";
import { ursoAuthClient } from "./supabase";

export type BrainUser = {
  id: string;
  email: string;
  name: string;
};

// Cached per request — layout and pages can both call it without repeating the
// auth round-trip. Returns null when signed out OR when the Urso project env
// isn't configured (callers treat both as "no access").
export const getBrainUser = cache(async (): Promise<BrainUser | null> => {
  let supabase;
  try {
    supabase = await ursoAuthClient();
  } catch {
    return null; // URSO_* env absent — surface stays closed, never crashes
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
  const email = user.email ?? "";
  return {
    id: user.id,
    email,
    name: meta.full_name ?? meta.name ?? (email ? email.split("@")[0] : "there"),
  };
});
