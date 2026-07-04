import { redirect } from "next/navigation";
import { Droplets } from "lucide-react";
import { grantAccess, hasAccess } from "@/lib/canes/gate";

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
        <div className="cp-card overflow-hidden">
          <div className="cp-waterline" />
          <div className="p-7">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--cp-brand)] text-white">
              <Droplets size={20} strokeWidth={2.2} />
            </span>
            <h1 className="cp-display mt-4 text-[20px]">Canes Pressure Washing</h1>
            <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
              Operations dashboard. Enter your access code to continue.
            </p>
            <form action={unlock} className="mt-5 space-y-3">
              <input
                className="cp-input"
                type="password"
                name="code"
                placeholder="Access code"
                autoFocus
                required
              />
              {bad && <p className="text-[13px] font-medium text-[var(--cp-danger)]">Wrong code, try again.</p>}
              <button className="cp-btn cp-btn-primary w-full" type="submit">
                Open dashboard
              </button>
            </form>
          </div>
        </div>
        <p className="mt-4 text-center text-[11.5px] text-[var(--cp-faint)]">Powered by Urso · urso.tech</p>
      </div>
    </div>
  );
}
