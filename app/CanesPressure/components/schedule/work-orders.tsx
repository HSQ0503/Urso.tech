"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  fmtEt,
  fmtMoney,
  JOB_STATUS_LABEL,
  type Crew,
  type Job,
  type JobWithItems,
  type JobInvoiceSummary,
} from "@urso/types";
import type { CustomerHit } from "@/lib/canes/customers";
import { deleteJob } from "@/app/CanesPressure/actions";
import { JobDetailSheet } from "./job-detail-sheet";
import { CreateJobSheet } from "./create-job-sheet";

export function WorkOrders({
  jobs,
  crews,
  customers,
  selected,
  invoice,
}: {
  jobs: Job[];
  crews: Crew[];
  customers: CustomerHit[];
  selected: JobWithItems | null;
  invoice: JobInvoiceSummary | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const visible = jobs
    .filter(
      (job) =>
        !job.archived_at &&
        `${job.customer_name} ${job.job_name} ${job.job_address}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-4">
        <h1 className="cp-display text-3xl">Work orders</h1>
        <button
          className="cp-btn cp-btn-primary"
          onClick={() => setCreating(true)}
        >
          New work order
        </button>
      </header>
      <input
        aria-label="Search work orders"
        placeholder="Search work orders"
        className="cp-input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {notice ? <p role="status">{notice}</p> : null}
      <div className="cp-card divide-y divide-[var(--cp-line)]">
        {visible.map((job) => (
          <article
            key={job.id}
            className="flex flex-wrap items-center justify-between gap-4 p-4"
          >
            <Link
              className="min-w-0 flex-1"
              href={`/CanesPressure/jobs?job=${job.id}`}
            >
              <h2 className="font-semibold">
                {job.customer_name ?? "Customer"} ·{" "}
                {job.job_name ?? "Work order"}
              </h2>
              <p className="text-sm">
                {job.scheduled_at ? fmtEt(job.scheduled_at) : "Not scheduled"} ·{" "}
                {JOB_STATUS_LABEL[job.status]}
              </p>
              <p className="text-sm">{job.job_address}</p>
              {job.scheduling_conflict ? (
                <p className="font-semibold text-[var(--cp-danger)]">
                  Crew schedule overlaps another job
                </p>
              ) : null}
            </Link>
            <strong>{fmtMoney(job.total_cents)}</strong>
            <button
              disabled={busy}
              className="cp-btn"
              onClick={() => {
                if (
                  !confirm(
                    "Remove this work order from active lists and the calendar? Unused drafts are deleted. Business history is preserved and unpaid payment links are disabled.",
                  )
                )
                  return;
                start(async () => {
                  const result = await deleteJob(job.id);
                  setNotice(
                    result.notice ??
                      (result.ok ? "Work order removed." : "Not removed."),
                  );
                  router.refresh();
                });
              }}
            >
              Delete
            </button>
          </article>
        ))}
        {!visible.length ? <p className="p-8">No work orders match.</p> : null}
      </div>
      {selected ? (
        <JobDetailSheet
          key={selected.id}
          job={selected}
          crews={crews}
          invoice={invoice}
          onClose={() => router.push("/CanesPressure/jobs")}
        />
      ) : null}
      {creating ? (
        <CreateJobSheet
          crews={crews}
          customers={customers}
          onClose={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
