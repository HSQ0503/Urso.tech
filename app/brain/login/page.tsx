// Brain sign-in — against the URSO HQ Supabase project (its own users, fully
// separate from the Woof Gang dashboard login). Accounts are provisioned by
// hand in that project's Auth dashboard; no self-signup.

import { redirect } from "next/navigation";
import { getBrainUser } from "@/lib/brain/access";
import { BrainLoginForm } from "@/components/brain/login-form";

export const metadata = { title: "Sign in | Urso Brain" };

export default async function BrainLoginPage() {
  if (await getBrainUser()) redirect("/brain");

  const configured = Boolean(
    process.env.NEXT_PUBLIC_URSO_SUPABASE_URL && process.env.NEXT_PUBLIC_URSO_SUPABASE_PUBLISHABLE_KEY,
  );

  return (
    <div className="grid flex-1 place-items-center py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-orange">Urso Brain</div>
          <h1 className="mt-2 text-[22px] font-bold tracking-[-0.02em] text-ink">Sign in</h1>
          <p className="mt-1.5 text-[13px] leading-[1.55] text-ink-dim">
            The brain knows who you are from your account — department, projects, and the rules that apply to you.
          </p>
        </div>
        {configured ? (
          <BrainLoginForm />
        ) : (
          <div className="rounded-none border border-edge bg-panel p-5 text-[13px] leading-[1.6] text-ink-dim">
            The Urso HQ Supabase project isn&rsquo;t configured — set{" "}
            <code className="text-orange">NEXT_PUBLIC_URSO_SUPABASE_URL</code> and{" "}
            <code className="text-orange">NEXT_PUBLIC_URSO_SUPABASE_PUBLISHABLE_KEY</code>.
          </div>
        )}
        <p className="mt-5 text-center font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dimmer">
          Accounts are provisioned by Urso · no self-signup
        </p>
      </div>
    </div>
  );
}
