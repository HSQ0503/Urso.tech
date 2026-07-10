export const metadata = { title: "Privacy policy" };

// Public privacy policy for the Canes Pressure Washing SMS program — required
// by A2P 10DLC campaign registration (carriers verify the mobile non-sharing
// statement, frequency note, and rates disclosure). Outside the (app) gate on
// purpose: reviewers must reach it without a passcode.

export default function CanesPrivacyPage() {
  return (
    <div className="mx-auto max-w-[640px] px-5 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] md:py-12">
      <p className="cp-mono">Canes Pressure Washing</p>
      <h1 className="cp-display mt-1.5 text-[26px]">
        Privacy policy<span className="text-[var(--cp-brand)]">.</span>
      </h1>
      <p className="mt-1 text-[13px] text-[var(--cp-faint)]">Last updated July 2026</p>

      <div className="mt-6 space-y-5 text-[14.5px] leading-relaxed text-[var(--cp-ink)]">
        <p>
          Canes Pressure Washing (&ldquo;we,&rdquo; &ldquo;us&rdquo;) provides residential and
          commercial pressure-washing services in Palm Beach County, Florida. This policy describes
          how we handle the information customers share with us when requesting quotes or
          scheduling services.
        </p>

        <section>
          <h2 className="cp-mono">Information we collect</h2>
          <p className="mt-1.5">
            When you contact us by phone, text message, or through our website, we collect the
            information you provide: your name, phone number, service address, and details about
            the services you are requesting.
          </p>
        </section>

        <section>
          <h2 className="cp-mono">How we use it</h2>
          <p className="mt-1.5">
            We use your information solely to respond to your inquiries, provide quotes, schedule
            and confirm appointments, deliver our services, and send related service
            communications, including text messages.
          </p>
        </section>

        <section>
          <h2 className="cp-mono">Text messaging</h2>
          <p className="mt-1.5">
            <strong>
              No mobile information will be shared with third parties or affiliates for marketing
              or promotional purposes.
            </strong>{" "}
            Text messages are sent only to customers who have contacted us to request quotes or
            services. Message frequency varies based on your service request. Message and data
            rates may apply. You can opt out at any time by replying <strong>STOP</strong>, and get
            assistance by replying <strong>HELP</strong> or calling us.
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
