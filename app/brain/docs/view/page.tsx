// A single vault doc, rendered read-only, with its graph edges: outgoing
// [[wikilinks]] and backlinks — the Obsidian panes, in the brain. The path
// travels as a query param (vault paths contain spaces and slashes).

import Link from "next/link";
import { redirect } from "next/navigation";
import { getBrainUser } from "@/lib/brain/access";
import { ursoDbSafe } from "@/lib/brain/supabase";
import { getBacklinks, getDocByPath, getDocTitles } from "@/lib/brain/db";
import { RichText } from "@/components/dashboard/rich-text";

function LinkChips({ label, docs }: { label: string; docs: { path: string; title: string }[] }) {
  if (!docs.length) return null;
  return (
    <div>
      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dimmer">{label}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {docs.map((d) => (
          <Link
            key={d.path}
            href={`/brain/docs/view?path=${encodeURIComponent(d.path)}`}
            className="rounded-full border border-edge bg-raise px-2.5 py-1 text-[12px] text-ink-dim transition-colors duration-200 hover:border-[rgba(254,81,0,0.4)] hover:text-orange"
          >
            {d.title}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function BrainDocViewPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const user = await getBrainUser();
  if (!user) redirect("/brain/login");

  const { path } = await searchParams;
  const admin = ursoDbSafe();
  const doc = path && admin ? await getDocByPath(admin, path).catch(() => null) : null;

  if (!doc || !admin) {
    return (
      <div className="mx-auto w-full max-w-[760px] py-10">
        <p className="text-[14px] text-ink-dim">That doc isn&rsquo;t in the vault.</p>
        <Link href="/brain/docs" className="mt-3 inline-block text-[13px] text-orange underline underline-offset-2">← Back to the vault</Link>
      </div>
    );
  }

  const [outgoing, backlinks] = await Promise.all([
    getDocTitles(admin, doc.links).catch(() => []),
    getBacklinks(admin, doc.path).catch(() => []),
  ]);

  return (
    <div className="mx-auto w-full max-w-[760px] py-6">
      <Link href="/brain/docs" className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-dimmer transition-colors hover:text-orange">← Vault</Link>
      <div className="mt-4 rounded-none border border-edge bg-panel p-6 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">{doc.path}</div>
          {doc.origin === "brain" && (
            <span className="rounded-full border border-[rgba(254,81,0,0.35)] px-2 py-[2px] font-mono text-[9px] uppercase tracking-[0.12em] text-orange" title="Written by the brain — flows back to Obsidian on the next export">
              brain-written
            </span>
          )}
        </div>
        <h1 className="mt-2 text-[22px] font-bold tracking-[-0.02em] text-ink">{doc.title}</h1>
        {doc.description && <p className="mt-1.5 text-[13.5px] leading-[1.6] text-ink-dim">{doc.description}</p>}
        <div className="mt-6 border-t border-edge pt-6">
          <RichText text={doc.content} className="text-[14px] leading-[1.7] text-ink" />
        </div>
        {(outgoing.length > 0 || backlinks.length > 0) && (
          <div className="mt-8 space-y-4 border-t border-edge pt-5">
            <LinkChips label="Links to" docs={outgoing} />
            <LinkChips label="Linked from" docs={backlinks} />
          </div>
        )}
      </div>
    </div>
  );
}
