"use client";

// Email + password sign-in against the Urso HQ project. On success the session
// cookie (urso-brain-auth) is set by the browser client; we then hard-refresh
// so the server layout/pages see it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ursoBrowserClient } from "@/lib/brain/supabase-client";

export function BrainLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await ursoBrowserClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setError(
          /invalid/i.test(error.message)
            ? "Wrong email or password."
            : error.message,
        );
        return;
      }
      router.push("/brain");
      router.refresh();
    } catch {
      setError("Sign-in failed — try again.");
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full rounded-none border border-edge bg-raise px-3 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-dimmer focus:border-[rgba(254,81,0,0.45)]";

  return (
    <form onSubmit={submit} className="space-y-4 rounded-none border border-edge bg-panel p-5">
      <div>
        <label htmlFor="brain-email" className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">Email</label>
        <input
          id="brain-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`mt-1.5 ${inputCls}`}
        />
      </div>
      <div>
        <label htmlFor="brain-password" className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">Password</label>
        <input
          id="brain-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`mt-1.5 ${inputCls}`}
        />
      </div>
      {error && <p className="text-[12.5px] text-orange">{error}</p>}
      <button
        type="submit"
        disabled={busy || !email.trim() || !password}
        className="dash-press w-full cursor-pointer rounded-none border border-[rgba(254,81,0,0.4)] bg-orange-soft px-4 py-2.5 text-[13.5px] font-medium text-orange transition-colors hover:bg-[rgba(254,81,0,0.18)] disabled:cursor-default disabled:opacity-40"
      >
        {busy ? "Signing in…" : "Sign in →"}
      </button>
    </form>
  );
}
