export const metadata = { title: "SMS terms & conditions" };

// Public SMS terms for the Canes Pressure Washing messaging program — required
// by A2P 10DLC campaign registration. Outside the (app) gate on purpose:
// reviewers must reach it without a passcode.

export default function CanesTermsPage() {
  return (
    <div className="mx-auto max-w-[640px] px-5 py-12">
      <p className="cp-mono">Canes Pressure Washing</p>
      <h1 className="cp-display mt-1.5 text-[26px]">
        SMS terms &amp; conditions<span className="text-[var(--cp-brand)]">.</span>
      </h1>
      <p className="mt-1 text-[13px] text-[var(--cp-faint)]">Last updated July 2026</p>

      <div className="mt-6 space-y-5 text-[14.5px] leading-relaxed text-[var(--cp-ink)]">
        <section>
          <h2 className="cp-mono">Program description</h2>
          <p className="mt-1.5">
            Canes Pressure Washing sends text messages to customers who have contacted us to
            request quotes or schedule pressure-washing services. Messages include responses to
            your inquiries, quote follow-ups, appointment confirmations and reminders, and a
            courtesy reply if we miss your call.
          </p>
        </section>

        <section>
          <h2 className="cp-mono">Frequency and rates</h2>
          <p className="mt-1.5">
            Message frequency varies based on your service request. Message and data rates may
            apply. Check with your mobile carrier for details about your plan.
          </p>
        </section>

        <section>
          <h2 className="cp-mono">Opting out and help</h2>
          <p className="mt-1.5">
            Reply <strong>STOP</strong> at any time to stop receiving text messages from us. After
            you send STOP, we will confirm your opt-out and send no further messages. Reply{" "}
            <strong>HELP</strong> for assistance, or call us at (561) 652-6652.
          </p>
        </section>

        <section>
          <h2 className="cp-mono">Carriers</h2>
          <p className="mt-1.5">
            Mobile carriers are not liable for delayed or undelivered messages.
          </p>
        </section>

        <section>
          <h2 className="cp-mono">Privacy</h2>
          <p className="mt-1.5">
            Our{" "}
            <a
              className="font-semibold text-[var(--cp-brand-deep)] hover:underline"
              href="/CanesPressure/privacy"
            >
              Privacy policy
            </a>{" "}
            describes how we handle your information. No mobile information will be shared with
            third parties or affiliates for marketing or promotional purposes.
          </p>
        </section>

        <section>
          <h2 className="cp-mono">Contact</h2>
          <p className="mt-1.5">
            Canes Pressure Washing · (561) 652-6652 ·{" "}
            <a
              className="font-semibold text-[var(--cp-brand-deep)] hover:underline"
              href="https://www.canespressurewashing.com"
            >
              canespressurewashing.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
