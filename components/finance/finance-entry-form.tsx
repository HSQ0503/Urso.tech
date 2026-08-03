"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowDownLeft,
  HandCoins,
  Landmark,
  ReceiptText,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { createFinanceEntry } from "@/app/fi/actions";
import { FinanceSubmitButton } from "@/components/finance/submit-button";

type TransactionType = "income" | "expense" | "founder_draw" | "founder_contribution" | "refund";
type DealOption = { id: string; clientName: string };

type TransactionOption = {
  value: TransactionType;
  label: string;
  description: string;
  icon: LucideIcon;
};

const transactionOptions: TransactionOption[] = [
  { value: "income", label: "Payment received", description: "Client money cleared", icon: ArrowDownLeft },
  { value: "expense", label: "Company expense", description: "Paid from company cash", icon: ReceiptText },
  { value: "founder_draw", label: "Founder payout", description: "Paid to Han or Guga", icon: HandCoins },
  { value: "refund", label: "Client refund", description: "Money returned to a client", icon: RotateCcw },
  { value: "founder_contribution", label: "Capital added", description: "Founder money added", icon: Landmark },
];

const categoryByType: Record<TransactionType, string> = {
  income: "client payment",
  expense: "other",
  founder_draw: "founder payout",
  founder_contribution: "founder contribution",
  refund: "client refund",
};

const buttonByType: Record<TransactionType, string> = {
  income: "Record payment",
  expense: "Record expense",
  founder_draw: "Record founder payout",
  founder_contribution: "Record capital contribution",
  refund: "Record refund",
};

const guidanceByType: Record<TransactionType, string> = {
  income: "Link every client payment to a deal so revenue collection stays accurate.",
  expense: "Expenses reduce company cash automatically. Use Founder payout if the purchase should come from Han’s or Guga’s allocation.",
  founder_draw: "Founder payouts reduce available cash and record who received the money.",
  founder_contribution: "Use this when Han or Guga puts personal money into the company.",
  refund: "Refunds reduce both collected revenue and available cash for the selected deal.",
};

const inputClass =
  "min-h-11 w-full border border-edge bg-cell px-3.5 py-2.5 text-[16px] text-ink placeholder:text-ink-dimmer transition-colors focus:border-edge-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-orange/50 sm:text-[13px]";

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11.5px] font-medium text-ink-dim">
        {label}{required && <span className="ml-1 text-orange" aria-hidden>*</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-[10.5px] leading-[1.45] text-ink-dimmer">{hint}</span>}
    </label>
  );
}

export function FinanceEntryForm({ deals, today }: { deals: DealOption[]; today: string }) {
  const [entryType, setEntryType] = useState<TransactionType>("expense");
  const isFounderEntry = entryType === "founder_draw" || entryType === "founder_contribution";
  const isClientEntry = entryType === "income" || entryType === "refund";
  const isExpense = entryType === "expense";
  const showDeal = entryType !== "founder_contribution";

  return (
    <form action={createFinanceEntry} className="mt-5">
      <input type="hidden" name="entryType" value={entryType} />

      <div className="grid grid-cols-2 gap-px border border-edge bg-edge sm:grid-cols-3" aria-label="Transaction type">
        {transactionOptions.map((option) => {
          const Icon = option.icon;
          const selected = option.value === entryType;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setEntryType(option.value)}
              className={`min-h-[82px] cursor-pointer bg-panel p-3 text-left transition-colors last:col-span-2 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-orange/60 ${selected ? "bg-orange-soft text-ink ring-1 ring-inset ring-orange/50" : "text-ink-dim hover:bg-raise"}`}
            >
              <Icon size={16} strokeWidth={1.7} className={selected ? "text-orange" : "text-ink-dimmer"} aria-hidden />
              <span className="mt-2 block text-[12px] font-medium leading-tight">{option.label}</span>
              <span className="mt-1 block text-[9.5px] leading-[1.35] text-ink-dimmer">{option.description}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 border border-edge bg-raise px-3.5 py-3 text-[11px] leading-[1.5] text-ink-dim">
        {guidanceByType[entryType]}
      </div>

      <div key={entryType} className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Amount" required>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[13px] text-ink-dimmer">$</span>
            <input name="amount" inputMode="decimal" placeholder="0.00" required className={`${inputClass} pl-8`} />
          </div>
        </Field>

        <Field label="Date" required>
          <input type="date" name="occurredOn" defaultValue={today} required className={inputClass} />
        </Field>

        {showDeal ? (
          <Field
            label={isClientEntry ? "Client / deal" : "Related deal"}
            required={isClientEntry}
            hint={isExpense || entryType === "founder_draw" ? "Optional. Use this when the transaction belongs to a specific deal." : undefined}
          >
            <select name="dealId" required={isClientEntry} defaultValue="" className={inputClass}>
              <option value="">{isClientEntry ? "Choose a deal" : "General company transaction"}</option>
              {deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.clientName}</option>)}
            </select>
          </Field>
        ) : <input type="hidden" name="dealId" value="" />}

        {isExpense ? (
          <>
            <Field label="Merchant or vendor" required>
              <input name="counterparty" placeholder="Restaurant or vendor" required className={inputClass} />
            </Field>
            <Field label="Category" required>
              <select name="category" required defaultValue="" className={inputClass}>
                <option value="" disabled>Choose a category</option>
                <option value="meals & entertainment">Meals & entertainment</option>
                <option value="travel">Travel</option>
                <option value="software">Software</option>
                <option value="contractor">Contractor</option>
                <option value="design">Design</option>
                <option value="cybersecurity">Cybersecurity</option>
                <option value="marketing">Marketing</option>
                <option value="legal">Legal</option>
                <option value="accounting & tax">Accounting & tax</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </>
        ) : (
          <>
            <input type="hidden" name="category" value={categoryByType[entryType]} />
            <input type="hidden" name="counterparty" value="" />
          </>
        )}

        {isFounderEntry ? (
          <Field label="Founder" required>
            <select name="founder" required defaultValue="" className={inputClass}>
              <option value="" disabled>Choose a founder</option>
              <option value="han">Han</option>
              <option value="guga">Guga</option>
            </select>
          </Field>
        ) : <input type="hidden" name="founder" value="" />}

        <div className="sm:col-span-2">
          <Field label="Note" hint="Optional context for the ledger.">
            <input name="notes" placeholder={isExpense ? "What was this purchase for?" : "Add a note"} className={inputClass} />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <FinanceSubmitButton>{buttonByType[entryType]}</FinanceSubmitButton>
        </div>
      </div>
    </form>
  );
}
