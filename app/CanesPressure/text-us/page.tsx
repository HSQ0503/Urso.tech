export const metadata = { title: "Text Us" };

// Public CTA collateral for the A2P 10DLC campaign (error 30909 remediation):
// the page reviewers visit to verify how customers opt in to texting. Shows
// the call to action with every required disclosure — consent, frequency,
// rates, HELP/STOP, and links to the terms and privacy policy. Outside the
// (app) gate on purpose.

export default function CanesTextUsPage() {
  return (
    <div className="mx-auto max-w-[640px] px-5 py-12">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--cp-muted)]">
        Canes Pressure Washing
      </p>
      <h1 className="cp-display mt-1.5 text-[26px]">Text or call us for a free quote</h1>
      <p className="mt-1 text-[13px] text-[var(--cp-faint)]">
        Residential and commercial pressure washing · Palm Beach County, FL
      </p>

      <div className="cp-card mt-6 p-5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--cp-muted)]">
          Our business line
        </p>
        <a
          href="sms:+15616526652"
          className="cp-display mt-1 block text-[24px] text-[var(--cp-brand-deep)]"
        >
          (561) 652-6652
        </a>
        <p className="mt-2 text-[14px] leading-relaxed">
          Text us what you need washed — driveway, house, roof, patio, pavers — and we&rsquo;ll
          reply with a quote or a free estimate visit. You can also call and we&rsquo;ll pick up or
          text you right back.
        </p>
      </div>

      <div className="mt-6 space-y-4 text-[13.5px] leading-relaxed text-[var(--cp-muted)]">
        <p>
          By texting Canes Pressure Washing at (561) 652-6652, or by verbally providing your phone
          number when requesting a quote, you agree to receive text messages about your service
          request, including replies to your inquiry, quote follow-ups, and appointment
          confirmations and reminders. Consent is not a condition of purchase.
        </p>
        <p>
          Message frequency varies based on your service request. Message and data rates may
          apply. Reply <strong className="text-[var(--cp-ink)]">HELP</strong> for assistance or
          call (561) 652-6652. Reply <strong className="text-[var(--cp-ink)]">STOP</strong> at any
          time to opt out; we will confirm your opt-out and send no further messages. No mobile
          information will be shared with third parties or affiliates for marketing or promotional
          purposes.
        </p>
        <p>
          <a
            className="font-semibold text-[var(--cp-brand-deep)] hover:underline"
            href="/CanesPressure/terms"
          >
            SMS Terms &amp; Conditions
          </a>
          {" · "}
          <a
            className="font-semibold text-[var(--cp-brand-deep)] hover:underline"
            href="/CanesPressure/privacy"
          >
            Privacy Policy
          </a>
          {" · "}
          <a
            className="font-semibold text-[var(--cp-brand-deep)] hover:underline"
            href="https://www.canespressurewashing.com"
          >
            canespressurewashing.com
          </a>
        </p>
        <p className="text-[12.5px] text-[var(--cp-faint)]">
          This customer-service platform is operated for Canes Pressure Washing by Urso
          (urso.ws). Our marketing website is canespressurewashing.com.
        </p>
      </div>
    </div>
  );
}
