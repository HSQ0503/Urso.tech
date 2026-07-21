// A single vault doc, rendered read-only. The path travels as a query param
// (vault paths contain spaces and slashes — a segment would fight encoding).

import Link from "next/link";
import { redirect } from "next/navigation";
import { getBrainUser } from "@/lib/brain/access";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getDocByPath } from "@/lib/brain/db";
import { RichText } from "@/components/dashboard/rich-text";

export default async function BrainDocViewPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");

  const { path } = await searchParams;
  const admin = ursoDbSafe();
  const doc = path && admin ? await getDocByPath(admin, path).catch(() => null) : null;

  if (!doc) {
    return (
      <div className="mx-auto w-full max-w-[760px] py-10">
        <p className="text-[14px] text-ink-dim">That doc isn&rsquo;t in the vault.</p>
        <Link href="/brain/docs" className="mt-3 inline-block text-[13px] text-orange underline underline-offset-2">← Back to the vault</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[760px] py-6">
      <Link href="/brain/docs" className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-dimmer transition-colors hover:text-orange">← Vault</Link>
      <div className="mt-4 rounded-none border border-edge bg-panel p-6 md:p-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">{doc.path}</div>
        <h1 className="mt-2 text-[22px] font-bold tracking-[-0.02em] text-ink">{doc.title}</h1>
        {doc.description && <p className="mt-1.5 text-[13.5px] leading-[1.6] text-ink-dim">{doc.description}</p>}
        <div className="mt-6 border-t border-edge pt-6">
          <RichText text={doc.content} className="text-[14px] leading-[1.7] text-ink" />
        </div>
      </div>
    </div>
  );
}
