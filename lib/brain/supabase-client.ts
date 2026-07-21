"use client";

// Browser client for the Urso HQ project — used only by the brain's sign-in /
// sign-out UI. Cookie config must match lib/brain/supabase.ts + middleware.ts.

import { createBrowserClient } from "@supabase/ssr";

export function ursoBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_URSO_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_URSO_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        name: "urso-brain-auth",
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  );
}
