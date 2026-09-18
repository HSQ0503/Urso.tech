"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DocumentKind } from "@urso/types";
import { restoreArchivedDocument } from "@/app/CanesPressure/archive-actions";
export function ArchiveList({
  records,
}: {
  records: {
    kind: DocumentKind;
    id: string;
    label: string;
    archivedAt: string;
  }[];
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <div className="mt-5 space-y-3">
      {notice ? <p role="status">{notice}</p> : null}
      {records.map((row) => (
        <article
          key={`${row.kind}:${row.id}`}
          className="cp-card flex flex-wrap items-center justify-between gap-3 p-4"
        >
          <Link
            href={
              row.kind === "job"
                ? `/CanesPressure/jobs?job=${row.id}`
                : `/CanesPressure/${row.kind}s/${row.id}`
            }
          >
            {row.label}
          </Link>
          <button
            disabled={busy}
            className="cp-btn"
            onClick={() =>
              start(async () => {
                const result = await restoreArchivedDocument(row.kind, row.id);
                setNotice(result.notice);
                router.refresh();
              })
            }
          >
            Restore to lists
          </button>
        </article>
      ))}
      {!records.length ? <p>No archived records.</p> : null}
    </div>
  );
}
