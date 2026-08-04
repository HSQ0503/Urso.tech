"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  HandCoins,
  Search,
} from "lucide-react";
import { updateFinanceEntry, voidFinanceEntry } from "@/app/fi/actions";
import { FinanceSubmitButton } from "@/components/finance/submit-button";
import { VoidEntryButton } from "@/components/finance/void-entry-button";

type EntryType = "income" | "expense" | "founder_draw" | "founder_contribution" | "refund";
type Founder = "han" | "guga";
type Filter = "all" | "income" | "expense" | "founder" | "refund";

type LedgerEntry = {
  id: string;
  dealId: string | null;
  dealName: string | null;
  entryType: EntryType;
  amountCents: number;
  cashEffectCents: number;
  occurredOn: string;
  category: string;
  counterparty: string;
  founder: Founder | null;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

type DealOption = { id: string; clientName: string };

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const date = (value: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

const meta: Record<EntryType, { label: string; icon: typeof ArrowUpRight; tone: string }> = {
  income: { label: "Client payment", icon: ArrowDownLeft, tone: "text-[var(--color-good)]" },
  expense: { label: "Company expense", icon: ArrowUpRight, tone: "text-orange" },
  founder_draw: { label: "Founder payout", icon: HandCoins, tone: "text-orange" },
  founder_contribution: { label: "Capital added", icon: ArrowDownLeft, tone: "text-[var(--color-good)]" },
  refund: { label: "Client refund", icon: ArrowUpRight, tone: "text-orange" },
};

const categoryByType: Record<EntryType, string> = {
  income: "client payment",
  expense: "other",
  founder_draw: "founder payout",
  founder_contribution: "founder contribution",
  refund: "client refund",
};

const inputClass =
  "min-h-11 w-full border border-edge bg-cell px-3.5 py-2.5 text-[16px] text-ink placeholder:text-ink-dimmer transition-colors focus:border-edge-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-orange/50 sm:text-[13px]";

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-medium text-ink-dim">
        {label}{required && <span className="ml-1 text-orange" aria-hidden>*</span>}
      </span>
      {children}
    </label>
  );
}

function EntryEditor({ entry, deals }: { entry: LedgerEntry; deals: DealOption[] }) {
  const [entryType, setEntryType] = useState<EntryType>(entry.entryType);
  const updateAction = updateFinanceEntry.bind(null, entry.id);
  const voidAction = voidFinanceEntry.bind(null, entry.id);
  const isFounderEntry = entryType === "founder_draw" || entryType === "founder_contribution";
  const isClientEntry = entryType === "income" || entryType === "refund";
  const isExpense = entryType === "expense";
  const showDeal = entryType !== "founder_contribution";

  return (
    <div className="border-t border-edge bg-raise px-4 py-4 sm:px-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_auto]">
        <form action={updateAction} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Type" required>
            <select name="entryType" value={entryType} onChange={(event) => setEntryType(event.target.value as EntryType)} className={inputClass}>
              <option value="income">Client payment</option>
              <option value="expense">Company expense</option>
              <option value="founder_draw">Founder payout</option>
              <option value="refund">Client refund</option>
              <option value="founder_contribution">Capital added</option>
            </select>
          </Field>

          <Field label="Amount" required>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[13px] text-ink-dimmer">$</span>
              <input name="amount" inputMode="decimal" defaultValue={(entry.amountCents / 100).toFixed(2)} required className={`${inputClass} pl-8`} />
            </div>
          </Field>

          <Field label="Date" required>
            <input type="date" name="occurredOn" defaultValue={entry.occurredOn} required className={inputClass} />
          </Field>

          {showDeal ? (
            <Field label="Deal" required={isClientEntry}>
              <select name="dealId" defaultValue={entry.dealId ?? ""} required={isClientEntry} className={inputClass}>
                <option value="">{isClientEntry ? "Choose a deal" : "General company transaction"}</option>
                {deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.clientName}</option>)}
              </select>
            </Field>
          ) : <input type="hidden" name="dealId" value="" />}

          {isExpense ? (
            <>
              <Field label="Merchant or vendor" required>
                <input name="counterparty" defaultValue={entry.counterparty} required className={inputClass} />
              </Field>
              <Field label="Category" required>
                <input name="category" list={`finance-edit-categories-${entry.id}`} defaultValue={entry.entryType === "expense" ? entry.category : "other"} required className={inputClass} />
                <datalist id={`finance-edit-categories-${entry.id}`}>
                  <option value="meals & entertainment" /><option value="travel" /><option value="software" /><option value="contractor" /><option value="design" /><option value="cybersecurity" /><option value="marketing" /><option value="legal" /><option value="accounting & tax" /><option value="other" />
                </datalist>
              </Field>
            </>
          ) : (
            <>
              <input type="hidden" name="counterparty" value="" />
              <input type="hidden" name="category" value={entry.entryType === entryType ? entry.category : categoryByType[entryType]} />
            </>
          )}

          {isFounderEntry ? (
            <Field label="Founder" required>
              <select name="founder" defaultValue={entry.founder ?? ""} required className={inputClass}>
                <option value="" disabled>Choose a founder</option>
                <option value="han">Han</option>
                <option value="guga">Guga</option>
              </select>
            </Field>
          ) : <input type="hidden" name="founder" value="" />}

          <div className="sm:col-span-2 xl:col-span-4">
            <Field label="Note">
              <input name="notes" defaultValue={entry.notes} placeholder="Optional context" className={inputClass} />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-4">
            <FinanceSubmitButton>Save changes</FinanceSubmitButton>
          </div>
        </form>

        <div className="min-w-[190px] border-t border-edge pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-dimmer">Audit</p>
          <dl className="mt-3 space-y-3 text-[10.5px] leading-[1.45]">
            <div><dt className="text-ink-dimmer">Created by</dt><dd className="mt-0.5 break-all text-ink-dim">{entry.createdBy}</dd></div>
            <div><dt className="text-ink-dimmer">Created</dt><dd className="mt-0.5 text-ink-dim">{dateTime(entry.createdAt)}</dd></div>
            <div><dt className="text-ink-dimmer">Last updated</dt><dd className="mt-0.5 text-ink-dim">{dateTime(entry.updatedAt)}{entry.updatedBy ? ` by ${entry.updatedBy}` : ""}</dd></div>
          </dl>
          <div className="mt-5 border-t border-edge pt-2">
            <VoidEntryButton action={voidAction} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LedgerRow({ entry, deals }: { entry: LedgerEntry; deals: DealOption[] }) {
  const item = meta[entry.entryType];
  const Icon = item.icon;
  const founder = entry.founder === "han" ? "Han" : entry.founder === "guga" ? "Guga" : null;
  const detail = [...new Set([entry.dealName, entry.counterparty, founder, entry.category].filter((value): value is string => Boolean(value)))].join(" · ");

  return (
    <details className="group/entry border-b border-edge last:border-b-0">
      <summary className="grid min-h-[70px] cursor-pointer list-none grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-raise focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange/50 sm:grid-cols-[auto_1fr_130px_120px_auto] sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="grid size-9 place-items-center border border-edge bg-raise">
          <Icon size={16} strokeWidth={1.7} className={item.tone} aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-ink">{item.label}</span>
          <span className="mt-0.5 block truncate text-[10.5px] text-ink-dimmer">{detail || "No additional details"}</span>
        </span>
        <span className="hidden font-mono text-[10px] text-ink-dimmer sm:block">{date(entry.occurredOn)}</span>
        <span className={`text-right font-mono text-[12.5px] tabular-nums ${entry.cashEffectCents >= 0 ? "text-[var(--color-good)]" : "text-ink"}`}>
          {entry.cashEffectCents >= 0 ? "+" : "−"}{money(Math.abs(entry.cashEffectCents))}
        </span>
        <ChevronDown size={16} strokeWidth={1.7} className="text-ink-dimmer transition-transform duration-200 group-open/entry:rotate-180" aria-hidden />
      </summary>
      <EntryEditor entry={entry} deals={deals} />
    </details>
  );
}

export function FinanceLedger({ entries, deals }: { entries: LedgerEntry[]; deals: DealOption[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const netCents = entries.reduce((total, entry) => total + entry.cashEffectCents, 0);
  const search = query.trim().toLowerCase();
  const filteredEntries = entries.filter((entry) => {
    const matchesFilter = filter === "all"
      || (filter === "founder" && (entry.entryType === "founder_draw" || entry.entryType === "founder_contribution"))
      || entry.entryType === filter;
    if (!matchesFilter) return false;
    if (!search) return true;
    return [meta[entry.entryType].label, entry.dealName, entry.counterparty, entry.category, entry.notes, entry.createdBy]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(search));
  });

  return (
    <details id="ledger" className="group dash-rise scroll-mt-20 border border-edge bg-panel">
      <summary className="flex min-h-[82px] cursor-pointer list-none items-center justify-between gap-5 px-5 py-4 transition-colors hover:bg-raise focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange/50 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dimmer">Ledger</span>
          <span className="mt-1 block text-[17px] font-medium text-ink">Transaction history</span>
        </span>
        <span className="flex items-center gap-4">
          <span className="hidden text-right sm:block">
            <span className="block font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-dimmer">{entries.length} active</span>
            <span className={`mt-1 block font-mono text-[11px] tabular-nums ${netCents >= 0 ? "text-[var(--color-good)]" : "text-orange"}`}>Net {netCents >= 0 ? "+" : "−"}{money(Math.abs(netCents))}</span>
          </span>
          <span className="inline-flex min-h-11 items-center gap-2 border border-edge px-3 text-[11px] font-medium text-ink-dim">
            <span className="group-open:hidden">Expand</span><span className="hidden group-open:inline">Collapse</span>
            <ChevronDown size={15} className="transition-transform duration-200 group-open:rotate-180" aria-hidden />
          </span>
        </span>
      </summary>

      <div className="border-t border-edge">
        <div className="grid gap-3 border-b border-edge bg-raise p-4 sm:grid-cols-[1fr_180px] sm:px-5">
          <label className="relative block">
            <span className="sr-only">Search transactions</span>
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-dimmer" aria-hidden />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client, merchant, category, or note" className={`${inputClass} pl-10`} />
          </label>
          <label>
            <span className="sr-only">Filter transactions</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className={inputClass}>
              <option value="all">All transactions</option>
              <option value="income">Client payments</option>
              <option value="expense">Company expenses</option>
              <option value="founder">Founder transactions</option>
              <option value="refund">Client refunds</option>
            </select>
          </label>
        </div>

        {filteredEntries.length > 0 ? filteredEntries.map((entry) => <LedgerRow key={entry.id} entry={entry} deals={deals} />) : (
          <div className="px-5 py-10 text-center text-[12px] text-ink-dimmer">No transactions match this view.</div>
        )}
      </div>
    </details>
  );
}
