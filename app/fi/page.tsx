import type { CSSProperties, ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  BriefcaseBusiness,
  CircleDollarSign,
  HandCoins,
  Landmark,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { Card, Micro, Tag } from "@/components/dashboard/ui";
import { CashFlowChart, DealAllocationChart } from "@/components/finance/finance-charts";
import { FinanceEntryForm } from "@/components/finance/finance-entry-form";
import { FinanceSubmitButton } from "@/components/finance/submit-button";
import { VoidEntryButton } from "@/components/finance/void-entry-button";
import { createFinanceDeal, voidFinanceEntry } from "./actions";
import {
  getFinanceSnapshot,
  type FinanceEntry,
  type FinanceEntryType,
} from "@/lib/finance";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const date = (value: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
const todayEt = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const rise = (index: number) => ({ "--i": index } as CSSProperties);

const inputClass =
  "min-h-11 w-full border border-edge bg-cell px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-dimmer transition-colors focus:border-edge-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-orange/50";

const notices: Record<string, string> = {
  "deal-added": "Deal added. Its value is contracted only until a payment is recorded.",
  "entry-added": "Cash entry recorded and every total has been recalculated.",
  "entry-voided": "Entry voided. It no longer affects the ledger or cash balance.",
};
const errors: Record<string, string> = {
  store: "The Urso finance store is not configured yet.",
  "deal-fields": "Complete the required deal fields with valid dollar amounts.",
  "deal-allocation": "Founder allocations cannot exceed the deal value.",
  "entry-fields": "Complete the required transaction fields with a valid amount and date.",
  "entry-founder": "Choose Han or Guga for this founder transaction.",
  "entry-deal": "Choose the deal associated with this client payment or refund.",
  "entry-counterparty": "Enter the merchant or vendor for this company expense.",
  "entry-id": "That ledger entry could not be identified.",
  save: "The finance record could not be saved. Try again.",
};

function Stat({
  label,
  value,
  note,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Banknote;
  tone?: "default" | "good" | "orange";
}) {
  const color = tone === "good" ? "text-[var(--color-good)]" : tone === "orange" ? "text-orange" : "text-ink";
  return (
    <div className="min-w-0 bg-panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <Micro>{label}</Micro>
        <Icon size={16} strokeWidth={1.7} className="text-ink-dimmer" aria-hidden />
      </div>
      <p className={`mt-4 text-[clamp(22px,3vw,30px)] font-semibold leading-none tracking-[-0.035em] tabular-nums ${color}`}>{value}</p>
      <p className="mt-2 text-[11.5px] leading-[1.45] text-ink-dimmer">{note}</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dimmer">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[10.5px] leading-[1.45] text-ink-dimmer">{hint}</span>}
    </label>
  );
}

const entryMeta: Record<FinanceEntryType, { label: string; icon: typeof ArrowUpRight; tone: string }> = {
  income: { label: "Client payment", icon: ArrowDownLeft, tone: "text-[var(--color-good)]" },
  expense: { label: "Company expense", icon: ArrowUpRight, tone: "text-orange" },
  founder_draw: { label: "Founder payout", icon: HandCoins, tone: "text-orange" },
  founder_contribution: { label: "Capital added", icon: ArrowDownLeft, tone: "text-[var(--color-good)]" },
  refund: { label: "Client refund", icon: ArrowUpRight, tone: "text-orange" },
};

function EntryRow({ entry }: { entry: FinanceEntry }) {
  const meta = entryMeta[entry.entryType];
  const Icon = meta.icon;
  const action = voidFinanceEntry.bind(null, entry.id);
  const detail = [entry.dealName, entry.counterparty, entry.founder ? entry.founder === "han" ? "Han" : "Guga" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-edge px-4 py-3.5 last:border-b-0 sm:grid-cols-[auto_1fr_130px_120px_auto]">
      <span className="grid size-9 place-items-center border border-edge bg-raise">
        <Icon size={16} strokeWidth={1.7} className={meta.tone} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-ink">{meta.label}</p>
        <p className="mt-0.5 truncate text-[11px] text-ink-dimmer">{detail || entry.category}</p>
      </div>
      <span className="hidden font-mono text-[10px] text-ink-dimmer sm:block">{date(entry.occurredOn)}</span>
      <span className={`text-right font-mono text-[12.5px] tabular-nums ${entry.cashEffectCents >= 0 ? "text-[var(--color-good)]" : "text-ink"}`}>
        {entry.cashEffectCents >= 0 ? "+" : "−"}{money(Math.abs(entry.cashEffectCents))}
      </span>
      <VoidEntryButton action={action} />
    </div>
  );
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const [snapshot, params] = await Promise.all([getFinanceSnapshot(), searchParams]);
  const { totals, deals, entries, months } = snapshot;
  const plannedHan = deals.filter((deal) => deal.status !== "canceled").reduce((sum, deal) => sum + deal.plannedHanDrawCents, 0);
  const plannedGuga = deals.filter((deal) => deal.status !== "canceled").reduce((sum, deal) => sum + deal.plannedGugaDrawCents, 0);
  const revenueProgress = totals.contractedCents > 0 ? totals.collectedCents / totals.contractedCents : 0;
  const revenueProgressWidth = Math.max(0, Math.min(1, revenueProgress));
  const allocatedBusinessSpend = Math.min(totals.expensesCents, totals.retainedTargetCents);
  const notice = params.notice ? notices[params.notice] : null;
  const error = params.error ? errors[params.error] ?? errors.save : null;

  if (!snapshot.configured) {
    return (
      <div className="mx-auto max-w-[760px] py-20">
        <Micro>Finance setup</Micro>
        <h1 className="mt-3 max-w-[680px] text-[clamp(32px,5vw,52px)] font-semibold leading-[1.05] tracking-[-0.035em]">
          Database connection required
        </h1>
        <p className="mt-6 max-w-[58ch] text-[14px] leading-6 text-ink-dim">
          Apply <span className="font-mono text-ink">supabase/urso/0013_finance_tracker.sql</span> to Urso HQ. The page will then load the Sebastian and Scott deal allocations automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <header className="dash-rise mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between" style={rise(0)}>
        <div>
          <h1 className="text-[clamp(32px,4vw,48px)] font-semibold leading-[1.05] tracking-[-0.035em]">
            Financial overview
          </h1>
          <p className="mt-3 max-w-[64ch] text-[13px] leading-5 text-ink-dim">
            Monitor cash on hand, outstanding receivables, founder distributions, and operating expenses.
          </p>
        </div>
        <Tag tone="orange">Live ledger</Tag>
      </header>

      {(notice || error) && (
        <div role={error ? "alert" : "status"} className={`dash-rise border px-4 py-3 text-[12.5px] ${error ? "border-orange/35 bg-orange-soft text-orange" : "border-[color-mix(in_srgb,var(--color-good)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-good)_8%,transparent)] text-[var(--color-good)]"}`} style={rise(1)}>
          {error ?? notice}
        </div>
      )}

      {/* Signature capital reservoir: one number and one ruler answer the core question. */}
      <section className="dash-rise relative overflow-hidden border border-edge bg-panel p-5 sm:p-7" style={rise(2)}>
        <div aria-hidden className="dash-grain pointer-events-none absolute inset-0" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-end">
          <div>
            <div className="flex items-center gap-2">
              <span className="size-2 bg-[var(--color-good)]" />
              <Micro>Available cash · cleared entries only</Micro>
            </div>
            <p className={`mt-5 text-[clamp(48px,8vw,88px)] font-semibold leading-[0.85] tracking-[-0.055em] tabular-nums ${totals.availableCashCents >= 0 ? "text-ink" : "text-orange"}`}>
              {money(totals.availableCashCents)}
            </p>
            <p className="mt-5 max-w-[48ch] text-[12px] leading-5 text-ink-dim">
              Cleared payments and contributions, less founder payouts, refunds, and company expenses.
            </p>
          </div>

          <div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <Micro>Revenue collected</Micro>
                <p className="mt-1 text-[13px] text-ink-dim">{money(totals.collectedCents)} of {money(totals.contractedCents)} received</p>
              </div>
              <span className="font-mono text-[12px] tabular-nums text-ink">{(revenueProgress * 100).toFixed(0)}%</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden bg-track">
              <div className="meter-fill h-full bg-[var(--color-good)]" style={{ width: `${revenueProgressWidth * 100}%` }} />
            </div>
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between gap-4">
                <Micro>Contract allocation</Micro>
                <span className="font-mono text-[10px] tabular-nums text-ink-dimmer">{money(totals.contractedCents)}</span>
              </div>
              <div className="flex h-7 overflow-hidden bg-track" aria-label="Contract allocation">
                {totals.contractedCents > 0 && (
                  <>
                    <div className="h-full bg-orange" style={{ width: `${(totals.companyAllocationCents / totals.contractedCents) * 100}%` }} title={`Company cash: ${money(totals.companyAllocationCents)}`} />
                    <div className="h-full bg-[var(--color-period-1)]" style={{ width: `${(allocatedBusinessSpend / totals.contractedCents) * 100}%` }} title={`Business spent: ${money(allocatedBusinessSpend)}`} />
                    <div className="h-full bg-[var(--color-period-2)]" style={{ width: `${(plannedHan / totals.contractedCents) * 100}%` }} title={`Han: ${money(plannedHan)}`} />
                    <div className="h-full bg-[var(--color-period-3)]" style={{ width: `${(plannedGuga / totals.contractedCents) * 100}%` }} title={`Guga: ${money(plannedGuga)}`} />
                  </>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-dim sm:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
                <span className="flex items-center gap-1.5"><span className="size-2 bg-orange" />Company {money(totals.companyAllocationCents)}</span>
                <span className="flex items-center gap-1.5"><span className="size-2 bg-[var(--color-period-1)]" />Spent {money(allocatedBusinessSpend)}</span>
                <span className="flex items-center gap-1.5"><span className="size-2 bg-[var(--color-period-2)]" />Han {money(plannedHan)}</span>
                <span className="flex items-center gap-1.5"><span className="size-2 bg-[var(--color-period-3)]" />Guga {money(plannedGuga)}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="dash-rise grid grid-cols-2 gap-px border border-edge bg-edge md:grid-cols-3 xl:grid-cols-6" style={rise(3)}>
        <Stat label="Contracted" value={money(totals.contractedCents)} note="signed deal value" icon={BriefcaseBusiness} />
        <Stat label="Collected" value={money(totals.collectedCents)} note="client cash received, net of refunds" icon={CircleDollarSign} tone="good" />
        <Stat label="Still to collect" value={money(totals.outstandingCents)} note="contracted, not cash" icon={WalletCards} tone="orange" />
        <Stat label="Company cash" value={money(totals.companyAllocationCents)} note={`${money(totals.retainedTargetCents)} before expenses`} icon={Landmark} />
        <Stat label="Founder draws" value={money(totals.founderDrawsCents)} note={`${money(totals.plannedFounderDrawsCents)} planned`} icon={HandCoins} />
        <Stat label="Business spent" value={money(totals.expensesCents)} note="contractors, tools, and operating costs" icon={ReceiptText} />
      </section>

      <section id="cash-flow" className="dash-rise grid scroll-mt-20 gap-3 xl:grid-cols-[1.25fr_0.75fr]" style={rise(4)}>
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><Micro>Cash flow</Micro><h2 className="mt-1 text-[17px] font-medium tracking-[-0.015em]">Cash movement</h2></div>
            <div className="flex gap-3 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-dim">
              <span className="flex items-center gap-1.5"><span className="size-2 bg-orange" />Received</span>
              <span className="flex items-center gap-1.5"><span className="size-2 bg-series" />Paid</span>
              <span className="flex items-center gap-1.5"><span className="size-2 bg-[var(--color-good)]" />Balance</span>
            </div>
          </div>
          <div className="mt-4"><CashFlowChart months={months} /></div>
        </Card>
        <Card>
          <Micro>Allocation</Micro>
          <h2 className="mt-1 text-[17px] font-medium tracking-[-0.015em]">Contract allocation</h2>
          <p className="mt-2 text-[11.5px] leading-[1.5] text-ink-dimmer">Company expenses reduce the company portion of each linked deal.</p>
          <DealAllocationChart deals={deals} />
        </Card>
      </section>

      <section id="deals" className="dash-rise scroll-mt-20 border border-edge bg-panel" style={rise(5)}>
        <div className="flex flex-col gap-2 border-b border-edge px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div><Micro>Deals</Micro><h2 className="mt-1 text-[17px] font-medium">Revenue and allocation by deal</h2></div>
          <p className="text-[11px] text-ink-dimmer">{deals.length} deal{deals.length === 1 ? "" : "s"} · {money(totals.contractedCents)} contracted</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dimmer">
              <tr className="border-b border-edge"><th className="px-5 py-3 font-normal">Client / deal</th><th className="px-4 py-3 font-normal">Contract</th><th className="px-4 py-3 font-normal">Collected</th><th className="px-4 py-3 font-normal">Outstanding</th><th className="px-4 py-3 font-normal">Founder plan</th><th className="px-4 py-3 font-normal">Company</th><th className="px-5 py-3 font-normal">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {deals.map((deal) => (
                <tr key={deal.id} className="transition-colors hover:bg-raise">
                  <td className="px-5 py-4"><p className="text-[13px] font-medium">{deal.clientName}</p><p className="mt-1 max-w-[280px] text-[10.5px] text-ink-dimmer">{deal.dealName}</p></td>
                  <td className="px-4 py-4 font-mono text-[12px] tabular-nums">{money(deal.contractedCents)}</td>
                  <td className="px-4 py-4 font-mono text-[12px] tabular-nums text-[var(--color-good)]">{money(deal.collectedCents)}</td>
                  <td className="px-4 py-4 font-mono text-[12px] tabular-nums text-orange">{money(deal.outstandingCents)}</td>
                  <td className="px-4 py-4 font-mono text-[10.5px] text-ink-dim">Han {money(deal.plannedHanDrawCents)}<br />Guga {money(deal.plannedGugaDrawCents)}</td>
                  <td className="px-4 py-4"><p className="font-mono text-[12px] font-medium tabular-nums">{money(deal.companyAllocationCents)}</p><p className="mt-1 text-[10px] text-ink-dimmer">{money(deal.businessSpentCents)} spent</p></td>
                  <td className="px-5 py-4"><Tag tone={deal.status === "complete" ? "good" : deal.status === "canceled" ? "warn" : "muted"}>{deal.status}</Tag></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="ledger" className="dash-rise scroll-mt-20 border border-edge bg-panel" style={rise(6)}>
        <div className="flex items-end justify-between gap-4 border-b border-edge px-5 py-4">
          <div><Micro>Ledger</Micro><h2 className="mt-1 text-[17px] font-medium">Transaction history</h2></div>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-dimmer">{entries.length} active entries</span>
        </div>
        {entries.length > 0 ? entries.map((entry) => <EntryRow key={entry.id} entry={entry} />) : (
          <div className="px-5 py-12 text-center">
            <ShieldCheck size={24} strokeWidth={1.5} className="mx-auto text-ink-dimmer" aria-hidden />
            <p className="mt-3 text-[13px] font-medium">No cash has been recorded yet.</p>
            <p className="mx-auto mt-1 max-w-[48ch] text-[11.5px] leading-5 text-ink-dimmer">The deals above are contracts, not bank deposits. Record the first payment when it clears.</p>
          </div>
        )}
      </section>

      <section id="record" className="dash-rise grid scroll-mt-20 gap-3 xl:grid-cols-2" style={rise(7)}>
        <Card>
          <Micro>New transaction</Micro>
          <h2 className="mt-1 text-[19px] font-medium">Record a transaction</h2>
          <p className="mt-2 text-[11.5px] leading-5 text-ink-dimmer">Choose what happened. The form will only ask for the information that matters.</p>
          <FinanceEntryForm deals={deals.map(({ id, clientName }) => ({ id, clientName }))} today={todayEt()} />
        </Card>

        <Card>
          <Micro>New deal</Micro>
          <h2 className="mt-1 text-[19px] font-medium">Add a signed deal</h2>
          <p className="mt-2 text-[11.5px] leading-5 text-ink-dimmer">This updates contracted revenue and the allocation plan—not available cash.</p>
          <form action={createFinanceDeal} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Client"><input name="clientName" required placeholder="Client or company" className={inputClass} /></Field>
            <Field label="Deal"><input name="dealName" required placeholder="Scope or engagement" className={inputClass} /></Field>
            <Field label="Contract value"><input name="contracted" inputMode="decimal" required placeholder="0.00" className={inputClass} /></Field>
            <Field label="Signed date"><input type="date" name="signedOn" className={inputClass} /></Field>
            <Field label="Han planned draw"><input name="hanDraw" inputMode="decimal" defaultValue="0.00" required className={inputClass} /></Field>
            <Field label="Guga planned draw"><input name="gugaDraw" inputMode="decimal" defaultValue="0.00" required className={inputClass} /></Field>
            <div className="sm:col-span-2"><Field label="Note"><input name="notes" placeholder="Payment schedule, terms, or context" className={inputClass} /></Field></div>
            <div className="sm:col-span-2"><FinanceSubmitButton>Add signed deal</FinanceSubmitButton></div>
          </form>
        </Card>
      </section>

      <footer className="dash-rise flex flex-col gap-2 border-t border-edge py-5 text-[10.5px] text-ink-dimmer sm:flex-row sm:items-center sm:justify-between" style={rise(8)}>
        <span>Cash basis · USD · America/New_York</span>
        <span>Contracted revenue does not increase available cash.</span>
      </footer>
    </div>
  );
}
