import Link from "next/link";
import { requireOwnerPage } from "@/lib/canes/access";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { LedgerImport } from "../../../components/ledger-import";
import type { ImportBatch } from "@/lib/canes/ledger-import";
export const dynamic = "force-dynamic";
export default async function ImportPage() {
  await requireOwnerPage();
  let batches: ImportBatch[] = [];
  if (canesConfigured()) {
    const { data, error } = await canesDb()
      .from("canes_import_batches")
      .select("id,source_name,created_at,rows:canes_import_rows(*)")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error("Import history could not be loaded.");
    batches = (data ?? []) as ImportBatch[];
  }
  return (
    <div className="space-y-5">
      <Link href="/CanesPressure/money" className="cp-btn">
        Back to Money
      </Link>
      <header>
        <h1 className="cp-display text-3xl">Import ledger</h1>
        <p className="mt-2 text-sm text-[var(--cp-muted)]">
          Review historical records before adding them. Existing records and
          signed recurring agreements stay intact.
        </p>
      </header>
      <LedgerImport batches={batches} />
    </div>
  );
}
