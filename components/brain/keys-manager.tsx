"use client";

// Org BYO API keys manager (settings). One key per provider; the server stores
// them encrypted and only ever returns the last 4 characters.

import { useState } from "react";
import { BRAIN_PROVIDERS, BRAIN_PROVIDER_IDS } from "@/lib/brain/catalog";
import type { BrainProvider } from "@/lib/brain/types";

type KeyStatus = { provider: BrainProvider; last4: string };

export function KeysManager({ initialKeys }: { initialKeys: KeyStatus[] }) {
  const [keys, setKeys] = useState<Record<string, string>>(
    Object.fromEntries(initialKeys.map((k) => [k.provider, k.last4])),
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setDraft = (p: string, v: string) => setDrafts((d) => ({ ...d, [p]: v }));
  const setErr = (p: string, v: string | null) =>
    setErrors((e) => {
      const next = { ...e };
      if (v) next[p] = v;
      else delete next[p];
      return next;
    });

  const save = async (provider: BrainProvider) => {
    const key = (drafts[provider] ?? "").trim();
    if (!key || busy) return;
    setBusy(provider);
    setErr(provider, null);
    try {
      const r = await fetch("/api/brain/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, key }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string; last4?: string };
      if (!r.ok) {
        setErr(provider, data.error ?? "Save failed.");
        return;
      }
      setKeys((k) => ({ ...k, [provider]: data.last4 ?? key.slice(-4) }));
      setDraft(provider, "");
    } catch {
      setErr(provider, "Save failed — try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (provider: BrainProvider) => {
    if (busy) return;
    setBusy(provider);
    setErr(provider, null);
    try {
      const r = await fetch("/api/brain/keys", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (r.ok) {
        setKeys((k) => {
          const next = { ...k };
          delete next[provider];
          return next;
        });
      } else {
        setErr(provider, "Remove failed.");
      }
    } catch {
      // Network rejection: without this the promise escapes unhandled and the
      // row silently keeps showing the key as configured.
      setErr(provider, "Remove failed — try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {BRAIN_PROVIDER_IDS.map((p) => {
        const info = BRAIN_PROVIDERS[p];
        const set = keys[p];
        return (
          <div key={p} className="rounded-none border border-edge bg-raise p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[13.5px] font-medium text-ink">{info.name}</div>
                <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
                  {info.models.map((m) => m.label).join(" · ")}
                </div>
              </div>
              {set ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
                  <span className="size-1.5 rounded-full bg-[var(--color-good,#3ecf6e)]" /> key ····{set}
                </span>
              ) : (
                <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dimmer">not set</span>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="password"
                value={drafts[p] ?? ""}
                onChange={(e) => setDraft(p, e.target.value)}
                placeholder={set ? "Paste a new key to replace…" : "Paste the org's API key…"}
                className="min-w-0 flex-1 rounded-none border border-edge bg-panel px-3 py-2 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-dimmer focus:border-[rgba(254,81,0,0.45)]"
                autoComplete="off"
              />
              <button
                onClick={() => void save(p)}
                disabled={!(drafts[p] ?? "").trim() || busy === p}
                className="cursor-pointer rounded-none border border-[rgba(254,81,0,0.4)] bg-orange-soft px-3.5 py-2 text-[12.5px] font-medium text-orange transition-colors hover:bg-[rgba(254,81,0,0.18)] disabled:cursor-default disabled:opacity-40"
              >
                {busy === p ? "…" : "Save"}
              </button>
              {set && (
                <button
                  onClick={() => void remove(p)}
                  disabled={busy === p}
                  className="cursor-pointer rounded-none border border-edge px-3 py-2 text-[12.5px] text-ink-dim transition-colors hover:border-edge-strong hover:text-ink disabled:opacity-40"
                >
                  Remove
                </button>
              )}
            </div>
            {errors[p] && <p className="mt-2 text-[12px] text-orange">{errors[p]}</p>}
          </div>
        );
      })}
      <p className="text-[11.5px] leading-[1.5] text-ink-dimmer">
        Keys are encrypted at rest and never shown again after saving. Chat routes to the provider of whichever model the
        user picks — only providers with a key appear in the picker.
      </p>
    </div>
  );
}
