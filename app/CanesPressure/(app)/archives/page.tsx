import { requireOwnerPage } from "@/lib/canes/access";
import { listArchivedDocuments } from "@/app/CanesPressure/archive-actions";
import { ArchiveList } from "@/app/CanesPressure/components/archive-list";
export const dynamic = "force-dynamic";
export default async function ArchivesPage() {
  await requireOwnerPage();
  const result = await listArchivedDocuments();
  return (
    <div>
      <h1 className="cp-display text-3xl">Archived records</h1>
      {result.ok ? (
        <ArchiveList records={result.data} />
      ) : (
        <p>{result.notice}</p>
      )}
    </div>
  );
}
