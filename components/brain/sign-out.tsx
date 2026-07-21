"use client";

// Sign out of the Urso HQ project (brain session only — the Woof Gang dashboard
// and Canes sessions are separate cookies and untouched). supabase-js RETURNS
// sign-out errors rather than throwing, and keeps the local session on network
// failures — so only navigate away once sign-out actually succeeded, else the
// middleware bounces the still-authed user straight back here with the button
// stuck busy.

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ursoBrowserClient } from "@/lib/brain/supabase-client";

// `className`/`children` let the Obsidian shell render this as a ribbon icon
// without forking the sign-out logic, which has real failure handling to keep.
export function SignOutButton({ className, children }: { className?: string; children?: ReactNode } = {}) {
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
      className={
        className ??
        "ml-1 cursor-pointer rounded-lg border border-edge px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:border-edge-strong hover:text-ink disabled:opacity-50"
      }
      disabled={busy}
      title={failed ? "Sign-out failed — check your connection and try again" : children ? "Sign out" : undefined}
      style={busy ? { opacity: 0.5 } : undefined}
    >
      {children ?? (busy ? "…" : failed ? "Retry sign out" : "Sign out")}
    </button>
  );
}
