import RequestForm from "@/app/CanesPressure/components/request-form";

export const metadata = { title: "Request a quote" };

// Public request-a-quote page (the GHL form replacement). Outside the (app)
// gate on purpose, like login/ and e/[token]/: customers must reach it without
// the operations passcode. The form posts to /api/canes/lead/intake.

export default function CanesRequestPage() {
  return (
    <div className="mx-auto max-w-[540px] px-5 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] md:py-12">
      <div className="text-center">
        <p className="cp-display text-[32px] leading-tight">
          Canes<span className="text-[var(--cp-brand)]">.</span>
        </p>
        <p className="cp-mono mt-1.5">Pressure Washing</p>
      </div>

      <div className="cp-card mt-6">
        <div className="p-6 md:p-7">
          <h1 className="text-[17px] font-semibold">Request a free quote</h1>
          <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
            Tell us what needs washing and Sebastian will reach out shortly with a quote or a free
            estimate visit.
          </p>
          <RequestForm />
        </div>
      </div>

      <p className="cp-mono mt-5 text-center" style={{ color: "var(--cp-faint)" }}>
        Residential and commercial pressure washing · Palm Beach County, FL
      </p>
    </div>
  );
}
