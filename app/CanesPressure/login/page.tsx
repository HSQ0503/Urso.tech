import { redirect } from "next/navigation";
import { grantAccess, hasAccess } from "@/lib/canes/gate";
import Link from "next/link";

export const metadata = { title: "Sign in" };

async function unlock(formData: FormData) {
  "use server";
  const ok = await grantAccess(String(formData.get("code") ?? ""));
  redirect(ok ? "/CanesPressure" : "/CanesPressure/login?bad=1");
}

export default async function CanesLogin({
  searchParams,
}: {
  searchParams: Promise<{ bad?: string }>;
}) {
  if (await hasAccess()) redirect("/CanesPressure");
  const { bad } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="cp-display text-[34px] leading-tight">
            Canes<span className="text-[var(--cp-brand)]">.</span>
          </p>
          <p className="cp-mono mt-1.5">Pressure Washing</p>
        </div>
        <div className="cp-card">
          <div className="p-7">
            <h1 className="text-[16px] font-semibold">Sign in to operations</h1>
            <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
              Enter your access code to continue.
            </p>
            <form action={unlock} className="mt-5 space-y-3">
              <div>
                <label className="cp-label" htmlFor="code">
                  Access code
                </label>
                <input
                  id="code"
                  className="cp-input"
                  type="password"
                  name="code"
                  placeholder="Access code"
                  autoFocus
                  required
                />
              </div>
              {bad && (
                <p className="text-[13px] font-medium text-[var(--cp-danger)]">
                  Wrong code, try again.
                </p>
              )}
              <button className="cp-btn cp-btn-primary w-full" type="submit">
                Open dashboard
              </button>
            </form>
          </div>
        </div>
        <p className="cp-mono mt-5 text-center" style={{ color: "var(--cp-faint)" }}>
          Powered by Urso
        </p>
        <Link
          href="/CanesPressure/crew/login"
          className="mt-3 block min-h-11 content-center text-center text-[13px] font-semibold text-[var(--cp-muted)] hover:text-[var(--cp-ink)]"
        >
          Technician sign in
        </Link>
      </div>
    </div>
  );
}
