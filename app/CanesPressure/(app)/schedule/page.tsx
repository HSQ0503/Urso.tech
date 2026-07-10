import { listVisitsInRange } from "@/lib/canes/data";
import {
  getScheduleBoard,
  getUnscheduledJobs,
  listCalendarEvents,
  listCrews,
} from "@/lib/canes/estimates";
import { listInvoices } from "@/lib/canes/invoices";
import { ET, etLocalToIso, type JobInvoiceSummary } from "@/lib/canes/types";
import { ScheduleWorkspace } from "@/app/CanesPressure/components/schedule/schedule-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule" };

// Today's ET calendar date ("YYYY-MM-DD"), for a wall-time range start that
// includes this morning's jobs (a UTC-noon anchor would drop them).
function etTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// The Monday that leads the month grid containing `startYmd` — the month view
// renders 42 cells from there, so the fetch window must start there too or the
// leading out-of-month days render empty despite having jobs.
function monthGridStartYmd(startYmd: string): string {
  const anchor = new Date(`${startYmd}T12:00:00Z`);
  const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1, 12, 0, 0));
  const lead = (first.getUTCDay() + 6) % 7; // shift so Monday=0
  return new Date(first.getTime() - lead * 86_400_000).toISOString().slice(0, 10);
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; view?: string; job?: string }>;
}) {
  const sp = await searchParams;

  // View + window start come from the URL so paging week/month/day re-fetches
  // the visible range on the server — the client no longer navigates blind.
  const view =
    sp.view === "day" || sp.view === "month" || sp.view === "week" ? sp.view : "week";
  const startYmd =
    sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : etTodayYmd();
  const fetchYmd = view === "month" ? monthGridStartYmd(startYmd) : startYmd;
  const days = view === "month" ? 42 : 14;

  // Run the ET midnight through etLocalToIso so DST never shifts the boundary.
  const rangeStart = etLocalToIso(`${fetchYmd}T00:00`);

  const [board, unscheduled, visits, crews, events, invoiceRows] = await Promise.all([
    getScheduleBoard(rangeStart, days),
    getUnscheduledJobs(),
    // Visits come from the same window as the board — getAgenda only looked
    // forward from now, which dropped visits when paging to other weeks.
    listVisitsInRange(rangeStart, days),
    listCrews(true),
    listCalendarEvents(rangeStart, days),
    listInvoices(),
  ]);

  // A token-free job→invoice summary so the job sheet can show billing state.
  // Skip voided invoices — a re-billed job keeps its dead void row, which must
  // never shadow the live bill (matches getInvoiceByJob's neq-void semantics).
  // If several live invoices ever match a job, keep the newest by created_at
  // rather than trusting row order (demo fixtures aren't sorted).
  const invoices: Record<string, JobInvoiceSummary> = {};
  const newestByJob: Record<string, string> = {};
  for (const inv of invoiceRows) {
    if (!inv.job_id || inv.status === "void") continue;
    const seen = newestByJob[inv.job_id];
    if (seen && seen >= inv.created_at) continue;
    newestByJob[inv.job_id] = inv.created_at;
    invoices[inv.job_id] = {
      id: inv.id,
      number: inv.number,
      status: inv.status,
      total_cents: inv.total_cents,
      amount_paid_cents: inv.amount_paid_cents,
    };
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Desktop header (frozen) */}
      <header className="hidden md:block">
        <h1 className="cp-display text-[24px]">
          Schedule<span className="text-[var(--cp-brand)]">.</span>
        </h1>
        {/* Drag copy is desktop-only — mobile schedules by tap. */}
        <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
          Drag approved jobs onto the calendar. Estimate visits show as hairline chips.
        </p>
      </header>

      {/* Mobile header — iOS large title */}
      <header className="md:hidden">
        <h1 className="cp-ios-title">
          Schedule<span className="text-[var(--cp-brand)]">.</span>
        </h1>
        <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
          Tap a job to schedule it. Tap anything on the calendar for details.
        </p>
      </header>

      <ScheduleWorkspace
        jobs={board}
        unscheduled={unscheduled}
        visits={visits}
        crews={crews}
        events={events}
        invoices={invoices}
        view={view}
        startYmd={startYmd}
        initialJobId={sp.job ?? null}
      />
    </div>
  );
}
