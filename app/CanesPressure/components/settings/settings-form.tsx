"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { saveSettings, type ActionResult } from "@/app/CanesPressure/actions";
import { fmtPhone, toE164, type CanesSettings } from "@/lib/canes/types";

// Settings editor: three independent sections, each with its own Save so a
// template tweak never clobbers an in-progress phone-list edit.

type Notice = { ok: boolean; text: string } | null;

function noticeFrom(res: ActionResult): Notice {
  return res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.notice ?? "Could not save." };
}

function SectionCard({
  title,
  description,
  onSave,
  pending,
  notice,
  children,
}: {
  title: string;
  description: string;
  onSave: () => void;
  pending: boolean;
  notice: Notice;
  children: React.ReactNode;
}) {
  return (
    <section>
      {/* Mobile: iOS grouped-list header sits ABOVE the inset card. Desktop keeps
          the title/description inside the card (frozen). */}
      <div className="mb-2 md:hidden">
        <p className="cp-list-header">{title}</p>
        <p className="px-1.5 text-[12.5px] leading-snug text-[var(--cp-muted)]">{description}</p>
      </div>
      {/* rounded-xl gives the iOS grouped-card look on mobile; md:rounded-md restores
          the desktop 6px cp-card. Save renders block on mobile, compact on desktop. */}
      <div className="cp-card rounded-xl p-4 md:rounded-md md:p-5">
      <h2 className="hidden text-[15px] font-semibold md:block">{title}</h2>
      <p className="mt-1 hidden text-[13px] text-[var(--cp-muted)] md:block">{description}</p>
      <div className="flex flex-col gap-4 md:mt-4">{children}</div>
      <div className="mt-5 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <button
          type="button"
          className="cp-btn cp-btn-primary cp-btn-block md:hidden"
          onClick={onSave}
          disabled={pending}
        >
          {pending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          className="cp-btn cp-btn-primary hidden md:inline-flex"
          onClick={onSave}
          disabled={pending}
        >
          {pending ? "Saving..." : "Save"}
        </button>
        {notice && (
          <p
            className="text-[12.5px] font-medium"
            style={{ color: notice.ok ? "var(--cp-good)" : "var(--cp-warn)" }}
          >
            {notice.text}
          </p>
        )}
      </div>
      </div>
    </section>
  );
}

function hourLabel(h: number): string {
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${h < 12 ? "AM" : "PM"}`;
}

const TEMPLATE_FIELDS: { key: keyof CanesSettings["templates"]; label: string; help: string }[] = [
  {
    key: "hold_text",
    label: "Hold text",
    help: "Sent the moment a virtual-quote lead arrives so they know a call is coming.",
  },
  {
    key: "confirmation",
    label: "Appointment confirmation",
    help: "Sent before each estimate visit, asking the customer to reply YES.",
  },
  {
    key: "confirmation_ack",
    label: "Confirmation reply",
    help: "Sent right after the customer replies YES.",
  },
  {
    key: "missed_call",
    label: "Missed call text",
    help: "Sent when a call to the business number goes unanswered.",
  },
];

export function SettingsForm({ settings }: { settings: CanesSettings }) {
  // Templates
  const [templates, setTemplates] = useState({ ...settings.templates });
  const [templatesNotice, setTemplatesNotice] = useState<Notice>(null);
  const [templatesPending, startTemplates] = useTransition();

  // Timing
  const [offset, setOffset] = useState(String(settings.confirmation_offset_hours));
  const [quietStart, setQuietStart] = useState(settings.quiet_hours.start);
  const [quietEnd, setQuietEnd] = useState(settings.quiet_hours.end);
  const [timingNotice, setTimingNotice] = useState<Notice>(null);
  const [timingPending, startTiming] = useTransition();

  // Lead vendor numbers
  const [phones, setPhones] = useState(settings.lead_vendor_phones);
  const [draft, setDraft] = useState("");
  const [phonesNotice, setPhonesNotice] = useState<Notice>(null);
  const [phonesPending, startPhones] = useTransition();

  // Estimates
  const [estimateTerms, setEstimateTerms] = useState(settings.estimate_terms);
  const [estimateMessage, setEstimateMessage] = useState(settings.estimate_message);
  const [depositPresets, setDepositPresets] = useState(settings.deposit_presets.join(", "));
  const [expiryDays, setExpiryDays] = useState(String(settings.estimate_expiry_days));
  const [taxRatePct, setTaxRatePct] = useState(String(settings.estimate_tax_rate_bps / 100));
  const [estimateNotice, setEstimateNotice] = useState<Notice>(null);
  const [estimatePending, startEstimate] = useTransition();

  // Review rewards (0012) — dollar amounts edited as dollars, saved as cents.
  // Whole dollars display bare ("15"); fractional cents keep their decimals so
  // a saved $15.50 never silently becomes $16 on the next save.
  const centsToDollars = (cents: number) =>
    cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
  const [rwGoogleAmt, setRwGoogleAmt] = useState(centsToDollars(settings.review_rewards.google_cents));
  const [rwFacebookAmt, setRwFacebookAmt] = useState(centsToDollars(settings.review_rewards.facebook_cents));
  const [rwFollowAmt, setRwFollowAmt] = useState(centsToDollars(settings.review_rewards.follow_cents));
  const [rwGoogleUrl, setRwGoogleUrl] = useState(settings.review_rewards.google_url);
  const [rwFacebookUrl, setRwFacebookUrl] = useState(settings.review_rewards.facebook_url);
  const [rwInstagramUrl, setRwInstagramUrl] = useState(settings.review_rewards.instagram_url);
  const [rewardsNotice, setRewardsNotice] = useState<Notice>(null);
  const [rewardsPending, startRewards] = useTransition();

  const saveTemplates = () =>
    startTemplates(async () => {
      setTemplatesNotice(noticeFrom(await saveSettings({ templates })));
    });

  const saveTiming = () => {
    const hours = Number(offset);
    if (!Number.isFinite(hours) || hours < 1 || hours > 72) {
      setTimingNotice({ ok: false, text: "Offset must be between 1 and 72 hours." });
      return;
    }
    startTiming(async () => {
      setTimingNotice(
        noticeFrom(
          await saveSettings({
            confirmation_offset_hours: hours,
            quiet_hours: { start: quietStart, end: quietEnd, timezone: settings.quiet_hours.timezone },
          }),
        ),
      );
    });
  };

  const addPhone = () => {
    if (!draft.trim()) return;
    const e164 = toE164(draft);
    if (!e164) {
      setPhonesNotice({ ok: false, text: "That doesn't look like a valid US phone number." });
      return;
    }
    if (!phones.includes(e164)) setPhones([...phones, e164]);
    setDraft("");
    setPhonesNotice(null);
  };

  const savePhones = () =>
    startPhones(async () => {
      setPhonesNotice(noticeFrom(await saveSettings({ lead_vendor_phones: phones })));
    });

  const saveEstimate = () => {
    const presets = depositPresets
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (presets.length === 0 || presets.some((n) => n < 0 || n > 100)) {
      setEstimateNotice({ ok: false, text: "Deposit presets must be percentages between 0 and 100." });
      return;
    }
    const days = Number(expiryDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setEstimateNotice({ ok: false, text: "Expiry must be between 1 and 365 days." });
      return;
    }
    const taxPct = Number(taxRatePct);
    if (!Number.isFinite(taxPct) || taxPct < 0 || taxPct > 100) {
      setEstimateNotice({ ok: false, text: "Tax rate must be between 0 and 100 percent." });
      return;
    }
    startEstimate(async () => {
      setEstimateNotice(
        noticeFrom(
          await saveSettings({
            estimate_terms: estimateTerms,
            estimate_message: estimateMessage,
            deposit_presets: presets,
            estimate_expiry_days: days,
            estimate_tax_rate_bps: Math.round(taxPct * 100),
          }),
        ),
      );
    });
  };

  const saveRewards = () => {
    const amounts = [Number(rwGoogleAmt), Number(rwFacebookAmt), Number(rwFollowAmt)];
    if (amounts.some((n) => !Number.isFinite(n) || n <= 0 || n > 500)) {
      setRewardsNotice({ ok: false, text: "Reward amounts must be between $1 and $500." });
      return;
    }
    const urls = [rwGoogleUrl, rwFacebookUrl, rwInstagramUrl].map((u) => u.trim());
    if (urls.some((u) => u && !/^https?:\/\//i.test(u))) {
      setRewardsNotice({ ok: false, text: "Links must start with https:// (copy them from your browser)." });
      return;
    }
    startRewards(async () => {
      setRewardsNotice(
        noticeFrom(
          await saveSettings({
            review_rewards: {
              google_cents: Math.round(amounts[0] * 100),
              facebook_cents: Math.round(amounts[1] * 100),
              follow_cents: Math.round(amounts[2] * 100),
              google_url: urls[0],
              facebook_url: urls[1],
              instagram_url: urls[2],
            },
          }),
        ),
      );
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="Message templates"
        description="Placeholders {name}, {when} and {address} fill in automatically. Keep the 'Reply STOP to opt out' language in customer-facing texts. It is required for SMS compliance."
        onSave={saveTemplates}
        pending={templatesPending}
        notice={templatesNotice}
      >
        {TEMPLATE_FIELDS.map(({ key, label, help }) => (
          <div key={key}>
            <label className="cp-label" htmlFor={`tpl-${key}`}>
              {label}
            </label>
            <textarea
              id={`tpl-${key}`}
              className="cp-textarea min-h-[84px]"
              value={templates[key]}
              onChange={(e) => setTemplates({ ...templates, [key]: e.target.value })}
            />
            <p className="mt-1 text-[12px] text-[var(--cp-faint)]">{help}</p>
          </div>
        ))}
      </SectionCard>

      <SectionCard
        title="Timing"
        description="Controls when the confirmation text goes out and when automated texts are held back."
        onSave={saveTiming}
        pending={timingPending}
        notice={timingNotice}
      >
        <div>
          <label className="cp-label" htmlFor="confirmation-offset">
            Confirmation offset (hours)
          </label>
          <input
            id="confirmation-offset"
            type="number"
            min={1}
            max={72}
            className="cp-input max-w-[140px]"
            value={offset}
            onChange={(e) => setOffset(e.target.value)}
          />
          <p className="mt-1 text-[12px] text-[var(--cp-faint)]">
            12 = text goes out 12 hours before the visit.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:max-w-[340px]">
          <div>
            <label className="cp-label" htmlFor="quiet-start">
              Quiet hours start
            </label>
            <select
              id="quiet-start"
              className="cp-select"
              value={quietStart}
              onChange={(e) => setQuietStart(Number(e.target.value))}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="cp-label" htmlFor="quiet-end">
              Quiet hours end
            </label>
            <select
              id="quiet-end"
              className="cp-select"
              value={quietEnd}
              onChange={(e) => setQuietEnd(Number(e.target.value))}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="-mt-2 text-[12px] text-[var(--cp-faint)]">
          No automated texts go out between these hours (Eastern). They queue for the morning instead.
        </p>
      </SectionCard>

      <SectionCard
        title="Lead vendor numbers"
        description="Texts from these numbers are parsed into lead cards automatically."
        onSave={savePhones}
        pending={phonesPending}
        notice={phonesNotice}
      >
        {phones.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {phones.map((p) => (
              <li
                key={p}
                className="flex min-h-[52px] items-center justify-between gap-3 rounded-md border border-[var(--cp-line)] px-3.5 py-2 md:min-h-0"
              >
                <span className="text-[14px] font-medium">{fmtPhone(p)}</span>
                <button
                  type="button"
                  className="cp-btn cp-btn-sm cp-btn-danger min-h-[44px] min-w-[44px] px-2.5 md:min-h-[30px] md:min-w-0"
                  aria-label={`Remove ${fmtPhone(p)}`}
                  onClick={() => setPhones(phones.filter((x) => x !== p))}
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-[var(--cp-muted)]">No vendor numbers yet. Add the first one below.</p>
        )}
        <div className="flex gap-2">
          <input
            className="cp-input min-h-[44px] md:min-h-[38px]"
            placeholder="(561) 555-0100"
            inputMode="tel"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addPhone();
              }
            }}
          />
          <button type="button" className="cp-btn min-h-[44px] shrink-0 md:min-h-9" onClick={addPhone}>
            <Plus size={16} strokeWidth={2} />
            Add
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Estimates"
        description="Defaults for new quotes: the terms and cover message, deposit options, how long an estimate stays valid, and sales tax."
        onSave={saveEstimate}
        pending={estimatePending}
        notice={estimateNotice}
      >
        <div>
          <label className="cp-label" htmlFor="estimate-message">
            Cover message
          </label>
          <textarea
            id="estimate-message"
            className="cp-textarea min-h-[84px]"
            value={estimateMessage}
            onChange={(e) => setEstimateMessage(e.target.value)}
          />
          <p className="mt-1 text-[12px] text-[var(--cp-faint)]">
            Shown at the top of every estimate and used in the send text.
          </p>
        </div>
        <div>
          <label className="cp-label" htmlFor="estimate-terms">
            Terms
          </label>
          <textarea
            id="estimate-terms"
            className="cp-textarea min-h-[120px]"
            value={estimateTerms}
            onChange={(e) => setEstimateTerms(e.target.value)}
          />
          <p className="mt-1 text-[12px] text-[var(--cp-faint)]">
            The fine print the customer agrees to when they approve.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="cp-label" htmlFor="deposit-presets">
              Deposit presets (%)
            </label>
            <input
              id="deposit-presets"
              className="cp-input"
              inputMode="numeric"
              value={depositPresets}
              onChange={(e) => setDepositPresets(e.target.value)}
            />
            <p className="mt-1 text-[12px] text-[var(--cp-faint)]">Comma-separated, e.g. 0, 25, 50.</p>
          </div>
          <div>
            <label className="cp-label" htmlFor="estimate-expiry">
              Valid for (days)
            </label>
            <input
              id="estimate-expiry"
              type="number"
              min={1}
              max={365}
              className="cp-input"
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
            />
          </div>
          <div>
            <label className="cp-label" htmlFor="estimate-tax">
              Sales tax (%)
            </label>
            <input
              id="estimate-tax"
              type="number"
              min={0}
              max={100}
              step="0.001"
              className="cp-input"
              value={taxRatePct}
              onChange={(e) => setTaxRatePct(e.target.value)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Review rewards"
        description="Money-off offers that ride on invoices: the customer claims after leaving a review or follow, you verify it exists, and approving takes the amount off their bill. An offer without its link stays off. You choose which offers go on each invoice before sending it."
        onSave={saveRewards}
        pending={rewardsPending}
        notice={rewardsNotice}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="cp-label" htmlFor="rw-google-amt">
              Google review ($ off)
            </label>
            <input
              id="rw-google-amt"
              type="number"
              min={1}
              max={500}
              step="0.01"
              className="cp-input tabular-nums"
              value={rwGoogleAmt}
              onChange={(e) => setRwGoogleAmt(e.target.value)}
            />
          </div>
          <div>
            <label className="cp-label" htmlFor="rw-facebook-amt">
              Facebook review ($ off)
            </label>
            <input
              id="rw-facebook-amt"
              type="number"
              min={1}
              max={500}
              step="0.01"
              className="cp-input tabular-nums"
              value={rwFacebookAmt}
              onChange={(e) => setRwFacebookAmt(e.target.value)}
            />
          </div>
          <div>
            <label className="cp-label" htmlFor="rw-follow-amt">
              Insta + FB follow ($ off)
            </label>
            <input
              id="rw-follow-amt"
              type="number"
              min={1}
              max={500}
              step="0.01"
              className="cp-input tabular-nums"
              value={rwFollowAmt}
              onChange={(e) => setRwFollowAmt(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="cp-label" htmlFor="rw-google-url">
            Google review link
          </label>
          <input
            id="rw-google-url"
            type="url"
            className="cp-input"
            placeholder="https://g.page/r/…/review"
            value={rwGoogleUrl}
            onChange={(e) => setRwGoogleUrl(e.target.value)}
          />
          <p className="mt-1 text-[12px] text-[var(--cp-faint)]">
            From your Google Business Profile: &ldquo;Ask for reviews&rdquo; gives you this link.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="cp-label" htmlFor="rw-facebook-url">
              Facebook page link
            </label>
            <input
              id="rw-facebook-url"
              type="url"
              className="cp-input"
              placeholder="https://facebook.com/canespressurewashing"
              value={rwFacebookUrl}
              onChange={(e) => setRwFacebookUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="cp-label" htmlFor="rw-instagram-url">
              Instagram profile link
            </label>
            <input
              id="rw-instagram-url"
              type="url"
              className="cp-input"
              placeholder="https://instagram.com/canespressurewashing"
              value={rwInstagramUrl}
              onChange={(e) => setRwInstagramUrl(e.target.value)}
            />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
