"use client";

import { useState } from "react";
import { cx, Cta } from "./ui";
import { WipeLink } from "./wipe-link";

// Single centered form, modeled on Mercury's website intake ("Team up with
// Mercury"): contained card, sentence-case labels above inputs, a two-column
// grid for short fields, selectable pills for the categorical ones, full-width
// textareas, centered submit. Skinned in Urso's dark panel/edge/ink/orange.
// Only name + email are required.

const LOCATION_BANDS = ["None / online", "1", "2–3", "4–9", "10–24", "25+"];

const REVENUE_BANDS = [
  "Under $50k/mo",
  "$50k–150k/mo",
  "$150k–500k/mo",
  "$500k–1M/mo",
  "$1M+/mo",
  "Rather not say",
];

const fieldBase =
  "w-full rounded-lg border border-edge-strong bg-[#0c0c0c] px-3.5 py-3 text-[15px] text-ink placeholder:text-ink-dimmer outline-none transition-colors focus:border-orange focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-orange";

const labelBase = "mb-2 block text-[13.5px] font-medium tracking-[-0.005em] text-ink";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block">
        <span className={labelBase}>
          {label}
          {required && <span className="text-orange"> *</span>}
        </span>
        {hint && (
          <span className="mb-2 block text-[13px] leading-[1.45] text-ink-dim">
            {hint}
          </span>
        )}
        {children}
      </label>
    </div>
  );
}

// Single-select pill row — Mercury's radio treatment, click again to clear.
function Pills({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(active ? "" : o)}
            className={cx(
              "rounded-lg border px-3.5 py-2 text-[14px] transition-colors",
              active
                ? "border-orange bg-orange/10 text-ink"
                : "border-edge-strong text-ink-dim hover:bg-white/[0.03] hover:text-ink",
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">
      {children}
    </div>
  );
}

const INITIAL = {
  name: "",
  email: "",
  businessName: "",
  structure: "",
  locations: "",
  revenueBand: "",
  systems: "",
  infoLocation: "",
  contactChannels: "",
  journey: "",
  leakGuess: "",
  wishVisibility: "",
  gutDecisions: "",
  currentReports: "",
  worthIt: "",
  anythingElse: "",
};

export function DiscoveryForm() {
  const [form, setForm] = useState(INITIAL);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const canSubmit = form.name.trim().length > 1 && emailOk;

  const set =
    (key: keyof typeof form) =>
    (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const setVal = (key: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [key]: v }));

  async function submit() {
    if (!canSubmit) {
      setError("Add your name and a valid email to send.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Something went wrong. Try again.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-edge bg-panel px-8 py-12 text-center sm:px-12 sm:py-16">
        <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-orange">
          Got it
        </div>
        <h2 className="mt-4 text-[26px] font-semibold tracking-[-0.02em] text-ink">
          That&rsquo;s our homework.
        </h2>
        <p className="mx-auto mt-3 max-w-[44ch] text-[16px] leading-[1.55] text-ink-dim">
          We&rsquo;ll read it before we meet and do the recon, so the call starts on
          your business — not on the basics. Talk soon.
        </p>
        <WipeLink
          href="/what-we-find"
          className="group mt-7 inline-flex items-center gap-2 text-[14px] text-ink-dim transition-colors hover:text-ink"
        >
          While you wait, see what we look for
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="transition-transform group-hover:translate-x-0.5">
            <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </WipeLink>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!loading) submit();
      }}
      className="rounded-2xl border border-edge bg-panel p-6 sm:p-9 lg:p-11"
    >
      {/* The basics */}
      <fieldset>
        <GroupLabel>The basics</GroupLabel>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Your name" required>
            <input className={fieldBase} value={form.name} onChange={set("name")} autoComplete="name" placeholder="Your name" />
          </Field>
          <Field label="Email" required>
            <input className={fieldBase} value={form.email} onChange={set("email")} type="email" autoComplete="email" placeholder="you@business.com" />
          </Field>
          <Field label="Business name">
            <input className={fieldBase} value={form.businessName} onChange={set("businessName")} autoComplete="organization" placeholder="What it's called" />
          </Field>
          <Field label="Independent, or part of a brand?">
            <input className={fieldBase} value={form.structure} onChange={set("structure")} placeholder="Independent, or which franchise" />
          </Field>
        </div>
        <div className="mt-6">
          <Field label="How many locations, if any?">
            <Pills value={form.locations} onChange={setVal("locations")} options={LOCATION_BANDS} />
          </Field>
        </div>
        <div className="mt-6">
          <Field label="Rough monthly revenue">
            <Pills value={form.revenueBand} onChange={setVal("revenueBand")} options={REVENUE_BANDS} />
          </Field>
        </div>
      </fieldset>

      {/* Your setup */}
      <fieldset className="mt-9 border-t border-edge pt-9">
        <GroupLabel>Your setup</GroupLabel>
        <div className="space-y-6">
          <Field label="What systems run the business day to day?" hint="POS or booking, accounting, scheduling — anything you use for customers or marketing.">
            <textarea className={cx(fieldBase, "min-h-[92px] resize-y")} value={form.systems} onChange={set("systems")} placeholder="e.g. Square for the registers, QuickBooks for the books, a spreadsheet for the rest…" />
          </Field>
          <Field label="Where does the most important info actually live?" hint="One main system, a few disconnected tools, spreadsheets, inboxes, or mostly in someone's head?">
            <input className={fieldBase} value={form.infoLocation} onChange={set("infoLocation")} placeholder="Be honest — it's usually in a few places at once" />
          </Field>
          <Field label="How do customers reach you and book?" hint="Phone, online booking, walk-in, web form — and who picks up when the phone rings?">
            <textarea className={cx(fieldBase, "min-h-[92px] resize-y")} value={form.contactChannels} onChange={set("contactChannels")} placeholder="e.g. Most call or walk in. Front desk answers when they can; after hours it just rings." />
          </Field>
        </div>
      </fieldset>

      {/* How it works */}
      <fieldset className="mt-9 border-t border-edge pt-9">
        <GroupLabel>How it works, and where it leaks</GroupLabel>
        <div className="space-y-6">
          <Field label="How does a customer go from first finding you to paying?" hint="In your own words. Rough is fine.">
            <textarea className={cx(fieldBase, "min-h-[108px] resize-y")} value={form.journey} onChange={set("journey")} placeholder="They find us → reach out → we book it → work happens → they pay → (and then?)" />
          </Field>
          <Field label="Where in that path do you think you lose the most?" hint="Your best guess — we'll measure it, not assume it.">
            <textarea className={cx(fieldBase, "min-h-[92px] resize-y")} value={form.leakGuess} onChange={set("leakGuess")} placeholder="Calls that go unanswered, no-shows, one-and-done customers, people who never hear back…" />
          </Field>
        </div>
      </fieldset>

      {/* What you'd want to see */}
      <fieldset className="mt-9 border-t border-edge pt-9">
        <GroupLabel>What you&rsquo;d want to see</GroupLabel>
        <div className="space-y-6">
          <Field label="The one thing you most wish you could see instantly, but can't today?">
            <textarea className={cx(fieldBase, "min-h-[92px] resize-y")} value={form.wishVisibility} onChange={set("wishVisibility")} placeholder="If a clean view could answer one question every morning, what would it be?" />
          </Field>
          <Field label="What do you decide on gut right now, because the numbers aren't in front of you?">
            <textarea className={cx(fieldBase, "min-h-[92px] resize-y")} value={form.gutDecisions} onChange={set("gutDecisions")} placeholder="Staffing, which location needs attention, what to spend on…" />
          </Field>
          <Field label="Any numbers or reports you already check regularly?">
            <input className={fieldBase} value={form.currentReports} onChange={set("currentReports")} placeholder="What are they — and where do you pull them from?" />
          </Field>
        </div>
      </fieldset>

      {/* Worth it */}
      <fieldset className="mt-9 border-t border-edge pt-9">
        <GroupLabel>Worth it</GroupLabel>
        <div className="space-y-6">
          <Field label="What would make this clearly worth it for you?">
            <textarea className={cx(fieldBase, "min-h-[92px] resize-y")} value={form.worthIt} onChange={set("worthIt")} placeholder="More revenue, time back, fewer dropped balls, finally seeing every location at once…" />
          </Field>
          <Field label="Anything else we should know before we talk?">
            <textarea className={cx(fieldBase, "min-h-[92px] resize-y")} value={form.anythingElse} onChange={set("anythingElse")} placeholder="Optional — anything that'd help us show up prepared." />
          </Field>
        </div>
      </fieldset>

      {error && (
        <p className="mt-8 rounded-lg border border-[#E5484D]/30 bg-[#E5484D]/5 px-3.5 py-2.5 text-center text-[13px] text-[#E5484D]">
          {error}
        </p>
      )}

      <div className="mt-10 flex flex-col items-center border-t border-edge pt-9">
        <Cta
          variant="primary"
          size="lg"
          type="submit"
          onClick={loading ? undefined : submit}
          className={cx((loading || !canSubmit) && "pointer-events-none opacity-40")}
        >
          {loading ? "Sending…" : "Send it over"}
        </Cta>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
          {canSubmit
            ? "Short answers are fine. A founder reads every one."
            : "Just your name and email to send."}
        </p>
      </div>
    </form>
  );
}
