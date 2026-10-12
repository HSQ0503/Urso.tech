"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IMPORT_COLUMNS, type ImportBatch } from "@/lib/canes/ledger-import";
import { stageLedgerImport, applyLedgerImport } from "../import-actions";
export function LedgerImport({ batches }: { batches: ImportBatch[] }) {
  const router = useRouter(),
    [source, setSource] = useState("Sebastian ledger"),
    [csv, setCsv] = useState(""),
    [selected, setSelected] = useState<Record<string, boolean>>({}),
    [notice, setNotice] = useState(""),
    [pending, start] = useTransition();
  function template() {
    const url = URL.createObjectURL(
      new Blob([IMPORT_COLUMNS.join(",") + "\r\n"], { type: "text/csv" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "canes-ledger-import.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <section className="cp-card space-y-3 p-4">
        <h2 className="font-semibold">Prepare a CSV</h2>
        <p className="text-sm text-[var(--cp-muted)]">
          Keep the same source name and source IDs when retrying an export.
          Amounts are integer cents; dates are YYYY-MM-DD in Eastern time. Up to
          500 rows per batch.
        </p>
        <button className="cp-btn min-h-11" onClick={template}>
          Download blank template
        </button>
        <details className="text-sm leading-6">
          <summary className="cursor-pointer font-semibold">
            Supported records and mapping
          </summary>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong>customer</strong>: name, phone, email and address.
              Matching customers are flagged for review.
            </li>
            <li>
              <strong>completed_job</strong>: name (service), customer_name,
              date (actual completion), amount_cents (total), tax_cents,
              category and optional contact target_id. Creates historical work
              plus an unpaid draft invoice. The result ID is the invoice ID for
              a later payment import.
            </li>
            <li>
              <strong>payment</strong>: target_id is an existing manual invoice
              ID; date is when payment was received. Specify amount_cents and
              method: cash, card, check, bank, zelle, venmo or other. This
              records a past collection and does not charge a card.
            </li>
            <li>
              <strong>expense</strong>: name, date paid, amount_cents and
              category. Optional target_id identifies a worker payment; channel
              matches a configured marketing channel name.
            </li>
            <li>
              <strong>worker_balance</strong>: target_id is an existing worker
              ID; amount_cents is an approved outstanding opening balance or
              signed correction. Name records the reason. Do not import paid
              history again as unpaid earnings.
            </li>
          </ul>
          <p className="mt-3">
            Service category keys: paver_sealing, roof_washing, house_washing,
            window_cleaning, gutter_cleaning, paver_concrete_cleaning, custom.
            Leave unknown categories blank. Import customers/work first, then
            map the returned IDs before importing collections. Recurring
            contracts require fresh customer acceptance and cannot be imported
            as active agreements.
          </p>
        </details>
        <label className="cp-label block">
          Stable source name
          <input
            className="cp-input mt-1"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            maxLength={100}
          />
        </label>
        <label className="cp-label block">
          CSV file
          <input
            className="cp-input mt-1"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                if (file.size > 500000) {
                  setNotice("Use a file under 500 KB.");
                  return;
                }
                void file.text().then(setCsv);
              }
            }}
          />
        </label>
        <button
          className="cp-btn cp-btn-primary min-h-11"
          disabled={pending || !csv}
          onClick={() =>
            start(async () => {
              const result = await stageLedgerImport(source, csv);
              setNotice(result.notice ?? "Saved.");
              if (result.ok) router.refresh();
            })
          }
        >
          {pending ? "Working…" : "Stage preview"}
        </button>
      </section>
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
      {batches.map((batch) => (
        <section key={batch.id} className="cp-card space-y-3 p-4">
          <h2 className="font-semibold">{batch.source_name}</h2>
          <p className="text-xs text-[var(--cp-muted)]">
            {batch.created_at} · {batch.rows.length} rows
          </p>
          {batch.rows.map((row) => (
            <label
              key={row.id}
              className="flex items-start gap-3 border-t border-[var(--cp-line)] py-3 text-sm"
            >
              <input
                className="mt-1 h-5 w-5"
                type="checkbox"
                disabled={row.state !== "ready" || pending}
                checked={Boolean(selected[row.id])}
                onChange={(event) =>
                  setSelected({ ...selected, [row.id]: event.target.checked })
                }
              />
              <span className="min-w-0">
                <strong>
                  {row.source_key} · {row.payload.kind} · {row.payload.name}
                </strong>
                <span className="mt-1 block text-[var(--cp-muted)]">
                  {row.payload.date}{" "}
                  {row.payload.amount_cents
                    ? `· ${row.payload.amount_cents} cents`
                    : ""}{" "}
                  · {row.state}: {row.notice}
                </span>
                {row.target_id ? (
                  <span className="mt-1 block break-all">
                    Result ID: {row.target_id}
                  </span>
                ) : null}
                <details className="mt-2">
                  <summary>All imported fields</summary>
                  <pre className="overflow-x-auto py-2 text-xs">
                    {JSON.stringify(row.payload, null, 2)}
                  </pre>
                </details>
              </span>
            </label>
          ))}
          <button
            className="cp-btn cp-btn-primary min-h-11"
            disabled={
              pending ||
              !batch.rows.some(
                (row) => row.state === "ready" && selected[row.id],
              )
            }
            onClick={() =>
              start(async () => {
                const result = await applyLedgerImport(
                  batch.id,
                  batch.rows
                    .filter((row) => row.state === "ready" && selected[row.id])
                    .map((row) => row.id),
                );
                setNotice(result.notice ?? "Saved.");
                if (result.ok) {
                  setSelected({});
                  router.refresh();
                }
              })
            }
          >
            Import selected reviewed rows
          </button>
        </section>
      ))}
    </>
  );
}
