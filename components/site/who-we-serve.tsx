import { Reveal } from "./reveal";
import { FORECAST_GRAIN } from "./forecast";

/* The verticals are framed as who the operating system is BUILT FOR, not a
   client roster — pet care is the one real client (the live pilot); the rest are
   model-fit categories described as capability ("we surface", "we track"), never
   claimed as customers. Honest positioning, per the brand's no-fabrication rule. */
const SEGMENTS = [
  {
    eyebrow: "Pet care",
    body: "Grooming and retail franchises run on rebook cadence and the phone — yet after-hours calls hit voicemail and never get a callback, and one likely-fake 1-star drags the rating that feeds your next booking. It's where we started: our live pilot is a four-store pet franchise.",
  },
  {
    eyebrow: "Salon & barber",
    body: "Chair time is inventory you can't resell tomorrow, so a soft rebook or a quiet no-show is revenue gone for good. We surface calls answered, rebook rate, and no-show rate per location — so a slow front desk stops costing you the next appointment.",
  },
  {
    eyebrow: "Spa & med-aesthetics",
    body: "High-ticket bookings make every dropped inquiry and every unanswered review expensive. We catch the missed calls, flag review rating and reply rate, and find the booking-funnel friction quietly suppressing your best store.",
  },
  {
    eyebrow: "Fitness & wellness studios",
    body: "Memberships and class packs live on retention, not the first sale — so the trial that never rebooks and the inquiry that never gets answered are where the money actually leaks. We track the cadence that keeps members paying.",
  },
];

const FEATURED = {
  eyebrow: "Multi-unit franchise groups",
  body: "Run 4 to 15 stores and the business starts living in your head — scattered across POS, Google, phone lines, and the books. We pull it onto one screen, show each manager their own standing without exposing another store's numbers, and make the leak you fix once the playbook for the rest.",
};

/* Origin's vivid panel, rendered in Urso orange: a clean vertical wash — rich,
   glowing orange behind the headline up top, darkening to near-black by the time
   it reaches the cards. The cards therefore sit on the DARK lower band (exactly
   like Origin's blue is darkest where its cards land), so light translucent glass
   keeps its contrast. */
const SERVE_GRADIENT =
  "radial-gradient(130% 80% at 50% -6%, rgba(255,124,48,0.50) 0%, transparent 60%), " +
  "linear-gradient(180deg, #8e350e 0%, #782f0e 16%, #582510 34%, #371a0c 54%, #1c0f08 76%, #0a0604 100%)";

/* Subtle light-translucent glass, Origin-style: a faint lift over the dark lower
   field with a dim mono eyebrow and a generous eyebrow→body gap. */
const CARD =
  "flex h-full flex-col rounded-[18px] border border-white/[0.08] bg-white/[0.05] p-[clamp(26px,3vw,46px)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-sm transition-colors duration-200 hover:bg-white/[0.07]";
const EYEBROW =
  "font-mono text-[11px] uppercase tracking-[0.16em] text-white/55";
const GAP = "mt-[clamp(30px,4vw,54px)]";

export function WhoWeServe() {
  return (
    <section className="relative overflow-hidden rounded-t-[clamp(24px,3.4vw,44px)]">
      {/* Vertical orange wash — Origin's blue panel in Urso's palette. */}
      <div aria-hidden className="absolute inset-0" style={{ background: SERVE_GRADIENT }} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: FORECAST_GRAIN,
          backgroundSize: "160px 160px",
          opacity: 0.06,
          mixBlendMode: "soft-light",
        }}
      />

      <div className="relative mx-auto max-w-[1200px] px-[clamp(20px,4vw,56px)] pb-[clamp(64px,9vw,120px)] pt-[clamp(96px,13vw,172px)]">
        <Reveal className="mx-auto max-w-[820px] text-center">
          {/* No orange period — the headline sits over the orange gradient. */}
          <h2 className="text-balance font-serif text-[clamp(2.5rem,6vw,5rem)] font-normal leading-[1.02] tracking-[-0.025em] text-ink">
            <em className="italic">Built</em> for businesses that run on people
          </h2>
          <p className="mx-auto mt-7 max-w-[52ch] text-[clamp(1.0625rem,1.6vw,1.2rem)] leading-[1.5] text-white/70">
            One operating system, tuned to people-based, appointment-driven
            service businesses. The same leaks surface in every chair, kennel, and
            treatment room — demand you already earned, walking back out the door.
          </p>
        </Reveal>

        <div className="mt-[clamp(48px,7vw,88px)] grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-5">
          {SEGMENTS.map((s, i) => (
            <Reveal key={s.eyebrow} delay={i * 70} className="flex">
              <div className={CARD}>
                <p className={EYEBROW}>{s.eyebrow}</p>
                <p className={`${GAP} max-w-[46ch] text-[15px] leading-[1.55] text-white/90 sm:text-[16px]`}>
                  {s.body}
                </p>
              </div>
            </Reveal>
          ))}

          {/* Featured wide card — Origin's full-width bottom tile, faded into the
              dark base of the panel. */}
          <Reveal delay={SEGMENTS.length * 70} className="md:col-span-2">
            <div className="flex flex-col items-center rounded-[18px] border border-white/[0.07] bg-white/[0.035] p-[clamp(30px,3.6vw,56px)] text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-sm">
              <p className={EYEBROW}>{FEATURED.eyebrow}</p>
              <p className={`${GAP} max-w-[66ch] text-[15.5px] leading-[1.6] text-white/85 sm:text-[16.5px]`}>
                {FEATURED.body}
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
