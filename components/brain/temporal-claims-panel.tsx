import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  FileText,
  GitBranch,
  History,
} from "lucide-react";
import { brainDocHref } from "@/lib/brain/links";

export type TemporalClaimObjectType = "text" | "number" | "boolean" | "date" | "entity";
export type TemporalClaimLifecycle = "active" | "superseded" | "retired";
export type TemporalClaimResolution = "accepted" | "unresolved" | "contested";
export type TemporalClaimStatus = "current" | "historical" | "future";

export type TemporalClaimReference = {
  id: string;
  label?: string;
};

export type TemporalClaimConflict = {
  id: string;
  status: "open" | "resolved" | "dismissed";
  message: string;
  otherClaimIds?: string[];
};

export type AuthorizedTemporalClaim = {
  id: string;
  subjectLabel: string;
  predicateLabel: string;
  objectValue: string;
  objectLabel?: string | null;
  objectType: TemporalClaimObjectType;
  lifecycle: TemporalClaimLifecycle;
  resolution: TemporalClaimResolution;
  temporalStatus: TemporalClaimStatus;
  validFrom: string | null;
  validUntil: string | null;
  projectId: string | null;
  source: {
    path: string;
    title: string;
    version: number;
    excerpt: string;
  };
  supersedes: TemporalClaimReference[];
  supersededBy: TemporalClaimReference[];
  conflict?: TemporalClaimConflict | null;
};

export type TemporalClaimsPanelProps = {
  claims: AuthorizedTemporalClaim[];
  path: string;
  projectId?: string | null;
  asOf?: string | null;
  defaultDate?: string;
  formAction?: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function formatObject(claim: AuthorizedTemporalClaim) {
  if (claim.objectLabel) return claim.objectLabel;
  if (claim.objectType === "boolean") return claim.objectValue === "true" ? "Yes" : "No";
  if (claim.objectType === "date") return formatDate(claim.objectValue) ?? claim.objectValue;
  return claim.objectValue;
}

function claimPeriod(claim: AuthorizedTemporalClaim) {
  const from = formatDate(claim.validFrom);
  const until = formatDate(claim.validUntil);

  if (from && until) return `${from}–before ${until}`;
  if (from) return `Effective ${from}`;
  if (until) return `Until ${until} (exclusive)`;
  return "No effective date recorded";
}

const temporalLabel: Record<TemporalClaimStatus, string> = {
  current: "Current",
  historical: "Historical",
  future: "Future",
};

const lifecycleLabel: Record<TemporalClaimLifecycle, string> = {
  active: "Active",
  superseded: "Superseded",
  retired: "Retired",
};

const resolutionLabel: Record<TemporalClaimResolution, string> = {
  accepted: "Accepted",
  unresolved: "Unresolved",
  contested: "Contested",
};

function badgeClass(kind: "current" | "historical" | "future" | "warning" | "neutral") {
  if (kind === "current") return "border-orange/25 bg-orange-soft text-orange";
  if (kind === "warning") return "border-orange/35 bg-orange-soft text-orange";
  return "border-[var(--ob-border)] bg-[var(--ob-bg)] text-[var(--ob-muted)]";
}

function ClaimReferenceList({
  label,
  claims,
}: {
  label: string;
  claims: TemporalClaimReference[];
}) {
  if (claims.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
      <span className="text-[var(--ob-faint)]">{label}</span>
      {claims.map((claim) => (
        <a
          key={claim.id}
          href={`#claim-${encodeURIComponent(claim.id)}`}
          className="inline-flex min-h-7 items-center rounded-[4px] border border-[var(--ob-border)] bg-[var(--ob-bg)] px-2 font-mono text-[9.5px] text-[var(--ob-muted)] transition-colors hover:border-[var(--ob-faint)] hover:text-[var(--ob-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/60"
        >
          {claim.label ?? claim.id.slice(0, 8)}
        </a>
      ))}
    </div>
  );
}

export function TemporalClaimsPanel({
  claims,
  path,
  projectId = null,
  asOf = null,
  defaultDate,
  formAction = "/brain/docs/view",
}: TemporalClaimsPanelProps) {
  const groups = new Map<string, AuthorizedTemporalClaim[]>();
  for (const claim of claims) {
    const key = `${claim.subjectLabel}\u0000${claim.predicateLabel}`;
    const group = groups.get(key);
    if (group) group.push(claim);
    else groups.set(key, [claim]);
  }

  const todayParams = new URLSearchParams({ path });
  if (projectId) todayParams.set("project", projectId);
  const todayHref = `${formAction}?${todayParams.toString()}`;
  const dateValue = asOf?.slice(0, 10) ?? defaultDate ?? new Date().toISOString().slice(0, 10);

  return (
    <section aria-labelledby="temporal-claims-heading" className="mt-8 border-t border-[var(--ob-border)] pt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-[620px]">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--ob-faint)]">
            Governed truth
          </p>
          <h2 id="temporal-claims-heading" className="mt-1.5 text-[15px] font-semibold text-[var(--ob-text)]">
            Temporal claims
          </h2>
          <p className="mt-1 text-[11.5px] leading-5 text-[var(--ob-muted)]">
            Atomic facts backed by this exact document version. Select a date to inspect what was valid then.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ob-faint)]">
            Truth at
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={todayHref}
              aria-current={asOf ? undefined : "page"}
              className={`inline-flex min-h-11 items-center gap-2 rounded-[5px] border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/60 ${
                asOf
                  ? "border-[var(--ob-border)] bg-[var(--ob-bg-sec)] text-[var(--ob-muted)] hover:border-[var(--ob-faint)] hover:text-[var(--ob-text)]"
                  : "border-orange/30 bg-orange-soft text-orange"
              }`}
            >
              <CalendarDays className="size-3.5" />
              Today
            </Link>
            <form method="get" action={formAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="path" value={path} />
              {projectId && <input type="hidden" name="project" value={projectId} />}
              <label className="sr-only" htmlFor="brain-claims-as-of">
                View claims as of date
              </label>
              <input
                id="brain-claims-as-of"
                name="asOf"
                type="date"
                required
                defaultValue={dateValue}
                className="min-h-11 rounded-[5px] border border-[var(--ob-border)] bg-[var(--ob-bg-sec)] px-3 text-[12px] text-[var(--ob-text)] [color-scheme:dark] focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
              />
              <button type="submit" className="ob-btn min-h-11">
                View date
                <ArrowRight className="size-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {groups.size === 0 ? (
        <div className="mt-5 rounded-[6px] border border-dashed border-[var(--ob-border)] bg-[var(--ob-bg-alt)] px-5 py-8 text-center">
          <History className="mx-auto size-4 text-[var(--ob-faint)]" />
          <p className="mt-3 text-[12.5px] font-medium text-[var(--ob-text)]">
            No authorized claims for this date
          </p>
          <p className="mx-auto mt-1 max-w-[440px] text-[11.5px] leading-5 text-[var(--ob-muted)]">
            This document can still be read as evidence, but no governed temporal fact from it is visible in your scope.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {[...groups.entries()].map(([key, group]) => (
            <section key={key} className="overflow-hidden rounded-[6px] border border-[var(--ob-border)] bg-[var(--ob-bg-alt)]">
              <header className="border-b border-[var(--ob-border)] bg-[var(--ob-bg-sec)] px-4 py-3">
                <p className="text-[12.5px] font-medium text-[var(--ob-text)]">{group[0].subjectLabel}</p>
                <p className="mt-0.5 font-mono text-[10px] text-[var(--ob-faint)]">{group[0].predicateLabel}</p>
              </header>

              <ul className="divide-y divide-[var(--ob-border)]">
                {group.map((claim) => {
                  const isWarning = claim.resolution !== "accepted" || claim.conflict?.status === "open";

                  return (
                    <li id={`claim-${claim.id}`} key={claim.id} className="scroll-mt-6 px-4 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <p className="break-words text-[14px] font-semibold leading-5 text-[var(--ob-text)]">
                            {formatObject(claim)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span
                              className={`inline-flex min-h-6 items-center rounded-full border px-2 text-[9.5px] font-semibold uppercase tracking-[0.07em] ${badgeClass(
                                claim.temporalStatus,
                              )}`}
                            >
                              {temporalLabel[claim.temporalStatus]}
                            </span>
                            <span
                              className={`inline-flex min-h-6 items-center rounded-full border px-2 text-[9.5px] font-semibold uppercase tracking-[0.07em] ${badgeClass(
                                claim.lifecycle === "active" ? "neutral" : "historical",
                              )}`}
                            >
                              {lifecycleLabel[claim.lifecycle]}
                            </span>
                            <span
                              className={`inline-flex min-h-6 items-center rounded-full border px-2 text-[9.5px] font-semibold uppercase tracking-[0.07em] ${badgeClass(
                                isWarning ? "warning" : "neutral",
                              )}`}
                            >
                              {resolutionLabel[claim.resolution]}
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 text-[10.5px] text-[var(--ob-faint)]">
                          <CalendarDays className="size-3.5" />
                          <span>{claimPeriod(claim)}</span>
                        </div>
                      </div>

                      {claim.conflict && (
                        <div
                          className={`mt-3 flex items-start gap-2 rounded-[5px] border px-3 py-2.5 text-[11px] leading-5 ${
                            claim.conflict.status === "open"
                              ? "border-orange/30 bg-orange-soft text-orange"
                              : "border-[var(--ob-border)] bg-[var(--ob-bg)] text-[var(--ob-muted)]"
                          }`}
                        >
                          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                          <div>
                            <p className="font-medium">
                              {claim.conflict.status === "open" ? "Open conflict" : "Conflict reviewed"}
                            </p>
                            <p className="mt-0.5 opacity-90">{claim.conflict.message}</p>
                          </div>
                        </div>
                      )}

                      <div className="mt-3 space-y-2">
                        <ClaimReferenceList label="Supersedes" claims={claim.supersedes} />
                        <ClaimReferenceList label="Superseded by" claims={claim.supersededBy} />
                      </div>

                      <div className="mt-3 rounded-[5px] border border-[var(--ob-border)] bg-[var(--ob-bg)] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Link
                            href={brainDocHref(claim.source.path, claim.projectId)}
                            className="inline-flex min-h-8 min-w-0 items-center gap-2 text-[10.5px] font-medium text-[var(--ob-muted)] transition-colors hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/60"
                          >
                            <FileText className="size-3.5 shrink-0" />
                            <span className="truncate">{claim.source.title}</span>
                            <span className="shrink-0 font-mono text-[9.5px] text-[var(--ob-faint)]">
                              v{claim.source.version}
                            </span>
                          </Link>
                          <span className="flex items-center gap-1.5 font-mono text-[9px] text-[var(--ob-faint)]">
                            <GitBranch className="size-3" />
                            {claim.id.slice(0, 8)}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-3 text-[10.5px] leading-[1.55] text-[var(--ob-muted)]">
                          {claim.source.excerpt}
                        </p>
                        <p className="mt-2 truncate font-mono text-[9px] text-[var(--ob-faint)]">
                          {claim.source.path}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
