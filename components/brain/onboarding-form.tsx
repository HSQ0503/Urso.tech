"use client";

// Brain profile form — used both for first-run onboarding (/brain/welcome) and
// editing on /brain/settings. Switching department here is also how a demo
// persona is played ("now I'm the marketing person").

import { useState } from "react";
import { useRouter } from "next/navigation";

type Department = { id: string; name: string; blurb: string };

export function OnboardingForm({
  departments,
  initialName,
  initialDepartmentId = "",
  initialTitle = "",
  submitLabel = "Enter the brain",
  redirectTo = "/brain",
}: {
  departments: Department[];
  initialName: string;
  initialDepartmentId?: string;
  initialTitle?: string;
  submitLabel?: string;
  redirectTo?: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [departmentId, setDepartmentId] = useState(initialDepartmentId);
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentId || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const r = await fetch("/api/brain/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, departmentId, title }),
      });
      if (!r.ok) {
        setError(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "Save failed — try again.");
        return;
      }
      if (redirectTo) {
        router.push(redirectTo);
        router.refresh();
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("Save failed — try again.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-none border border-edge bg-raise px-3 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-dimmer focus:border-[rgba(254,81,0,0.45)]";

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">Your name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1.5 ${inputCls}`} />
      </div>

      <div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">Department</span>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {departments.map((d) => {
            const active = d.id === departmentId;
            return (
              <button
                type="button"
                key={d.id}
                onClick={() => setDepartmentId(d.id)}
                className={`cursor-pointer rounded-none border px-3.5 py-3 text-left transition-colors ${
                  active ? "border-[rgba(254,81,0,0.5)] bg-orange-wash" : "border-edge bg-raise hover:border-edge-strong"
                }`}
              >
                <div className={`text-[13.5px] font-medium ${active ? "text-orange" : "text-ink"}`}>{d.name}</div>
                <div className="mt-0.5 text-[12px] leading-[1.45] text-ink-dim">{d.blurb}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">Role / title (optional)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Founding engineer, Account lead…"
          className={`mt-1.5 ${inputCls}`}
        />
      </div>

      {error && <p className="text-[12.5px] text-orange">{error}</p>}
      {saved && <p className="text-[12.5px] text-ink-dim">Saved.</p>}

      <button
        type="submit"
        disabled={!departmentId || !name.trim() || saving}
        className="dash-press cursor-pointer rounded-none border border-[rgba(254,81,0,0.4)] bg-orange-soft px-5 py-2.5 text-[13.5px] font-medium text-orange transition-colors hover:bg-[rgba(254,81,0,0.18)] disabled:cursor-default disabled:opacity-40"
      >
        {saving ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
