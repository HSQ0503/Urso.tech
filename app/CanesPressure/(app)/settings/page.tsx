import { getSettings, isDemo } from "@/lib/canes/data";
import { twilioConfigured } from "@/lib/canes/supabase";
import { requireOwnerPage } from "@/lib/canes/access";
import { SettingsForm } from "@/app/CanesPressure/components/settings/settings-form";
import { AutomationsPanel } from "@/app/CanesPressure/components/settings/automations-panel";
import { TourReplayButton } from "@/app/CanesPressure/components/tour/replay-button";
import { CrewAccountManager } from "@/app/CanesPressure/components/settings/crew-account-manager";
import { listTechnicianAccountsForOwner } from "@/lib/canes/crew-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: ok ? "var(--cp-good)" : "var(--cp-warn)" }}
      aria-hidden
    />
  );
}

export default async function SettingsPage() {
  await requireOwnerPage();
  const [settings, technicianAccounts] = await Promise.all([
    getSettings(),
    listTechnicianAccountsForOwner(),
  ]);
  const demo = isDemo();
  const twilio = twilioConfigured();
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";

  const webhooks = [
    { label: "SMS", url: `${base}/api/canes/twilio/sms` },
    { label: "Voice", url: `${base}/api/canes/twilio/voice` },
    { label: "Status callback", url: `${base}/api/canes/twilio/status` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="cp-ios-title md:hidden">
          Settings<span className="text-[var(--cp-brand)]">.</span>
        </h1>
        <h1 className="cp-display hidden text-[24px] leading-tight md:block">
          Settings<span className="text-[var(--cp-brand)]">.</span>
        </h1>
        <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
          Templates, timing and lead sources for the automation.
        </p>
      </header>

      <SettingsForm settings={settings} />

      <AutomationsPanel settings={settings} />

      <CrewAccountManager {...technicianAccounts} />

      <section className="cp-card rounded-xl p-4 md:rounded-md md:p-5">
        <h2 className="text-[15px] font-semibold">Connection status</h2>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <StatusDot ok={!demo} />
            <div>
              <p className="text-[14px] font-semibold">
                Supabase database{" "}
                <span className="ml-1 text-[12.5px] font-medium text-[var(--cp-muted)]">
                  {demo ? "Demo data" : "Live"}
                </span>
              </p>
              <p className="mt-0.5 text-[13px] text-[var(--cp-muted)]">
                {demo
                  ? "Showing sample leads. Once the secret key is added, real leads, messages and these settings save for good."
                  : "Connected. Leads, messages and settings are saving to the live database."}
              </p>
            </div>
          </div>
          <div className="cp-divider" />
          <div className="flex items-start gap-3">
            <StatusDot ok={twilio} />
            <div>
              <p className="text-[14px] font-semibold">
                Twilio phone number{" "}
                <span className="ml-1 text-[12.5px] font-medium text-[var(--cp-muted)]">
                  {twilio ? "Configured" : "Waiting on account"}
                </span>
              </p>
              <p className="mt-0.5 text-[13px] text-[var(--cp-muted)]">
                {twilio
                  ? "Connected. Automated texts, missed-call replies and click-to-call are active."
                  : "Once the Twilio account is connected, automated texts, missed-call replies and click-to-call switch on."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="cp-card rounded-xl p-4 md:rounded-md md:p-5">
        <h2 className="text-[15px] font-semibold">Product tour</h2>
        <p className="mt-1 text-[13px] text-[var(--cp-muted)]">
          A guided walkthrough of every page, from leads to payouts. It ran on your first
          sign-in; replay it anytime.
        </p>
        <div className="mt-3">
          <TourReplayButton />
        </div>
      </section>

      <section className="cp-card rounded-xl p-4 md:rounded-md md:p-5">
        <h2 className="text-[15px] font-semibold">Webhooks</h2>
        <p className="mt-1 text-[13px] text-[var(--cp-muted)]">
          Paste these into the Twilio phone number configuration so incoming texts and calls reach the app.
        </p>
        <div className="mt-4 flex flex-col gap-2.5">
          {webhooks.map(({ label, url }) => (
            <div key={label}>
              <p className="cp-mono">{label}</p>
              <code className="mt-0.5 block break-all rounded bg-[var(--cp-bg)] px-2.5 py-1.5 font-mono text-[12.5px] text-[var(--cp-ink)]">
                {url}
              </code>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
