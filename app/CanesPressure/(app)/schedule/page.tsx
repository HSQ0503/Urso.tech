import { getAgenda } from "@/lib/canes/data";
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

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; view?: string }>;
}) {
  const sp = await searchParams;

  // View + window start come from the URL so paging week/month/day re-fetches
  // the visible range on the server — the client no longer navigates blind.
  const view =
    sp.view === "day" || sp.view === "month" || sp.view === "week" ? sp.view : "week";
  const startYmd =
    sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : etTodayYmd();
  const days = view === "month" ? 42 : 14;

  // Run the ET midnight through etLocalToIso so DST never shifts the boundary.
  const rangeStart = etLocalToIso(`${startYmd}T00:00`);

  const [board, unscheduled, agenda, crews, events, invoiceRows] = await Promise.all([
    getScheduleBoard(rangeStart, days),
    getUnscheduledJobs(),
    getAgenda(days),
    listCrews(true),
    listCalendarEvents(rangeStart, days),
    listInvoices(),
  ]);

  // The workspace reads visits as a flat Lead[] (it groups by ET day itself).
  const visits = agenda.flatMap((g) => g.leads);

  // A token-free job→invoice summary so the job sheet can show billing state.
  const invoices: Record<string, JobInvoiceSummary> = {};
  for (const inv of invoiceRows) {
    if (inv.job_id) {
      invoices[inv.job_id] = {
        id: inv.id,
        number: inv.number,
        status: inv.status,
        total_cents: inv.total_cents,
        amount_paid_cents: inv.amount_paid_cents,
      };
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="cp-display text-[24px]">Schedule</h1>
        <p className="mt-1 text-[13.5px] text-[var(--cp-muted)]">
          Drag approved jobs onto the calendar. Estimate visits show as hairline chips.
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
        rangeDays={days}
      />
    </div>
  );
}
