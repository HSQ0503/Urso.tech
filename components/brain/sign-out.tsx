"use client";

// Sign out of the Urso HQ project (brain session only — the Woof Gang dashboard
// and Canes sessions are separate cookies and untouched). supabase-js RETURNS
// sign-out errors rather than throwing, and keeps the local session on network
// failures — so only navigate away once sign-out actually succeeded, else the
// middleware bounces the still-authed user straight back here with the button
// stuck busy.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ursoBrowserClient } from "@/lib/brain/supabase-client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <button
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        setFailed(false);
        try {
          const { error } = await ursoBrowserClient().auth.signOut();
          if (error) {
            setFailed(true);
            setBusy(false);
            return;
          }
          router.push("/brain/login");
          router.refresh();
        } catch {
          setFailed(true);
          setBusy(false);
        }
      }}
      className="ml-1 cursor-pointer rounded-lg border border-edge px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:border-edge-strong hover:text-ink disabled:opacity-50"
      disabled={busy}
      title={failed ? "Sign-out failed — check your connection and try again" : undefined}
    >
      {busy ? "…" : failed ? "Retry sign out" : "Sign out"}
    </button>
  );
}
