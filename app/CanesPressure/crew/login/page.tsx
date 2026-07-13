import { redirect } from "next/navigation";
import Link from "next/link";
import { TechnicianLoginForm } from "./login-form";
import { getTechnicianActor } from "@/lib/canes/crew-auth";

export const metadata = { title: "Technician sign in" };

const ERROR_COPY: Record<string, string> = {
  "invalid-link": "That sign-in link is invalid. Request a new one below.",
  "expired-link": "That sign-in link expired or was already used. Request a new one below.",
  "no-access": "This technician account is not active. Call the owner for access.",
};

export default async function TechnicianLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getTechnicianActor()) redirect("/CanesPressure/crew");
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--cp-chrome)] px-4 py-10 text-[var(--cp-chrome-ink)]">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="cp-display text-[34px] leading-tight">
            Canes<span className="text-[var(--cp-brand)]">.</span>
          </p>
          <p className="cp-mono mt-1.5 !text-[var(--cp-chrome-muted)]">Crew portal</p>
        </div>
        <div className="rounded-xl border border-[var(--cp-chrome-line)] bg-[var(--cp-surface)] p-6 text-[var(--cp-ink)] shadow-2xl shadow-black/20">
          <h1 className="text-[18px] font-semibold">Technician sign in</h1>
          <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--cp-muted)]">
            Use the email the owner approved for your individual account.
          </p>
          {error && ERROR_COPY[error] && (
            <p role="alert" className="mt-4 rounded-md bg-[var(--cp-danger-bg)] px-3 py-2 text-[13px] font-medium text-[var(--cp-danger)]">
              {ERROR_COPY[error]}
            </p>
          )}
          <div className="mt-5">
            <TechnicianLoginForm />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between px-1 text-[12px] text-[var(--cp-chrome-muted)]">
          <span>Powered by Urso</span>
          <Link className="min-h-11 content-center hover:text-white" href="/login">
            Owner sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
