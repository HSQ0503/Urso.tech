"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import type { CustomerHit } from "@/lib/canes/customers";
import { AddressInput } from "../address-input";
import { CustomerPicker } from "../customer-picker";
import { PhoneInput } from "../phone-input";
import {
  createEstimate,
  saveEstimateItems,
  sendEstimate,
  updateEstimate,
  upsertCatalogItem,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import {
  ChannelPicker,
  choiceToChannels,
  overrideSendOpts,
  resolveSendTarget,
  EMPTY_OVERRIDE,
  type ChannelChoice,
  type SendOverride,
} from "./channel-picker";
import {
  etLocalToIso,
  fmtMoney,
  type CatalogItem,
  type CatalogKind,
  type Estimate,
  type EstimateItem,
  type EstimateType,
} from "@/lib/canes/types";
import { isCompleteWhen, SchedulePicker } from "../leads/schedule-picker";

// The estimate builder — one client island that drives both create-mode (from
// a lead) and edit-mode (existing draft). Totals recompute live in JS mirroring
// computeTotals/lineTotalCents in actions.ts so the number never lags the tap;
// the server always recomputes on save, so this preview is advisory only.
// Read-only once the estimate leaves draft (approved/sent estimates are locked).

type DraftLine = {
  key: string;
  catalogId: string | null;
  name: string;
  description: string | null;
  kind: CatalogKind;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  taxable: boolean;
  isOption: boolean;
  isMandatory: boolean;
};

// Mirrors lineTotalCents in actions.ts: round(qty * unit) - discount.
function lineTotal(l: DraftLine): number {
  return Math.round(l.quantity * l.unitPriceCents) - l.discountCents;
}

// A line counts toward the subtotal when it's mandatory, a standard (non-option)
// line, or a selected option. In the builder, options are treated as selected
// only when mandatory (matching saveEstimateItems' is_selected default), so an
// unselected optional line is previewed as excluded from the running total.
function lineCounts(l: DraftLine): boolean {
  return l.isMandatory || !l.isOption;
}

let seq = 0;
function newKey(): string {
  seq += 1;
  return `line-${Date.now().toString(36)}-${seq}`;
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function inputToCents(v: string): number {
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function itemToDraft(it: EstimateItem): DraftLine {
  return {
    key: it.id,
    catalogId: it.catalog_id,
    name: it.name,
    description: it.description,
    kind: it.kind,
    quantity: it.quantity,
    unitPriceCents: it.unit_price_cents,
    discountCents: it.discount_cents,
    taxable: it.taxable,
    isOption: it.is_option,
    isMandatory: it.is_mandatory,
  };
}

function catalogToDraft(c: CatalogItem): DraftLine {
  return {
    key: newKey(),
    catalogId: c.id,
    name: c.name,
    description: c.description,
    kind: c.kind,
    quantity: 1,
    unitPriceCents: c.default_price_cents,
    discountCents: 0,
    taxable: c.taxable,
    isOption: false,
    isMandatory: false,
  };
}

// datetime-local wants "YYYY-MM-DDTHH:mm"; the SchedulePicker also speaks that
// naive string. Convert a stored ISO to the ET wall-clock naive value so an
// existing expiry pre-selects a chip.
function isoToEtNaive(iso: string | null): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

type Prefill = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  jobAddress: string;
  jobName: string;
  leadId: string | null;
  contactId: string | null;
  estimateType: EstimateType;
  messageToCustomer: string;
  terms: string;
  internalNotes: string;
  depositPercent: number;
  adjustmentCents: number;
  expiresAtIso: string | null;
  employee: string;
};

function prefillFromEstimate(e: Estimate): Prefill {
  return {
    customerName: e.customer_name ?? "",
    customerPhone: e.customer_phone ?? "",
    customerEmail: e.customer_email ?? "",
    jobAddress: e.job_address ?? "",
    jobName: e.job_name ?? "",
    leadId: e.lead_id,
    contactId: e.contact_id,
    estimateType: e.estimate_type,
    messageToCustomer: e.message_to_customer ?? "",
    terms: e.terms ?? "",
    internalNotes: e.internal_notes ?? "",
    depositPercent: e.deposit_percent,
    adjustmentCents: e.adjustment_cents,
    expiresAtIso: e.expires_at,
    employee: e.employee ?? "",
  };
}

export function EstimateBuilder({
  mode,
  estimate,
  initialItems = [],
  catalog,
  prefill,
  depositPresets,
  readOnly = false,
  optedOut = false,
  customers = [],
}: {
  mode: "create" | "edit";
  estimate?: Estimate;
  initialItems?: EstimateItem[];
  catalog: CatalogItem[];
  // The client directory behind the name typeahead.
  customers?: CustomerHit[];
  // Create-mode seeds; edit-mode derives its seeds from `estimate`.
  prefill?: {
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    jobAddress?: string;
    jobName?: string;
    leadId?: string | null;
    contactId?: string | null;
    messageToCustomer?: string;
    terms?: string;
    expiresAtIso?: string | null;
  };
  depositPresets: number[];
  readOnly?: boolean;
  // The linked lead's opt-out flag; disables the Text channel in the picker.
  optedOut?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);

  const seed: Prefill =
    mode === "edit" && estimate
      ? prefillFromEstimate(estimate)
      : {
          customerName: prefill?.customerName ?? "",
          customerPhone: prefill?.customerPhone ?? "",
          customerEmail: prefill?.customerEmail ?? "",
          jobAddress: prefill?.jobAddress ?? "",
          jobName: prefill?.jobName ?? "",
          leadId: prefill?.leadId ?? null,
          contactId: prefill?.contactId ?? null,
          estimateType: "standard",
          messageToCustomer: prefill?.messageToCustomer ?? "",
          terms: prefill?.terms ?? "",
          internalNotes: "",
          depositPercent: 0,
          adjustmentCents: 0,
          expiresAtIso: prefill?.expiresAtIso ?? null,
          employee: "",
        };

  const [type, setType] = useState<EstimateType>(seed.estimateType);
  const [customerName, setCustomerName] = useState(seed.customerName);
  const [customerPhone, setCustomerPhone] = useState(seed.customerPhone);
  const [customerEmail, setCustomerEmail] = useState(seed.customerEmail);
  const [jobAddress, setJobAddress] = useState(seed.jobAddress);
  // Client link (Sebastian's client-first ask): a picker hit binds contact_id;
  // typing a different name unbinds it and reads as a new client. pickedName
  // tracks the name the current link belongs to.
  const [contactId, setContactId] = useState(seed.contactId);
  const [pickSeq, setPickSeq] = useState(0);
  const pickedName = useRef<string | null>(seed.contactId ? seed.customerName : null);
  // What the current link filled in — a seeded link's fields count too, so
  // unlinking a seeded client never leaves their phone/email/address behind
  // on a "new" client (ensureContact would silently re-link them by phone).
  const appliedPick = useRef<{ phone: string; email: string; address: string }>(
    seed.contactId
      ? { phone: seed.customerPhone, email: seed.customerEmail, address: seed.jobAddress }
      : { phone: "", email: "", address: "" },
  );

  // Compare phones by digits — the input shows "(561) 555-0118" while the
  // directory carries "+15615550118".
  const digits = (v: string) => v.replace(/\D/g, "");

  function pickCustomer(hit: CustomerHit) {
    setContactId(hit.id);
    setPickSeq((n) => n + 1); // remount PhoneInput even when re-picking the same client
    pickedName.current = hit.name ?? "";
    setCustomerName(hit.name ?? "");
    setCustomerPhone(hit.phone ?? "");
    setCustomerEmail(hit.email ?? "");
    setJobAddress(hit.address ?? "");
    appliedPick.current = { phone: hit.phone ?? "", email: hit.email ?? "", address: hit.address ?? "" };
  }

  function changeCustomerName(name: string) {
    setCustomerName(name);
    if (contactId && name.trim() !== (pickedName.current ?? "").trim()) {
      setContactId(null);
      pickedName.current = null;
      // Only clear what the link wrote — never something typed by hand.
      if (digits(customerPhone) === digits(appliedPick.current.phone)) setCustomerPhone("");
      if (customerEmail === appliedPick.current.email) setCustomerEmail("");
      if (jobAddress === appliedPick.current.address) setJobAddress("");
      appliedPick.current = { phone: "", email: "", address: "" };
      setPickSeq((n) => n + 1); // remount PhoneInput so a cleared phone shows empty
    }
  }
  const [jobName, setJobName] = useState(seed.jobName);
  const [message, setMessage] = useState(seed.messageToCustomer);
  const [terms, setTerms] = useState(seed.terms);
  const [internalNotes, setInternalNotes] = useState(seed.internalNotes);
  const [adjustmentCents, setAdjustmentCents] = useState(seed.adjustmentCents);
  const [depositPercent, setDepositPercent] = useState(seed.depositPercent);
  const [customDeposit, setCustomDeposit] = useState(!depositPresets.includes(seed.depositPercent));
  const [expiry, setExpiry] = useState(isoToEtNaive(seed.expiresAtIso));
  const [lines, setLines] = useState<DraftLine[]>(() => initialItems.map(itemToDraft));
  const [channelChoice, setChannelChoice] = useState<ChannelChoice>("both");
  const [override, setOverride] = useState<SendOverride>(EMPTY_OVERRIDE);
  // Keys of custom lines already saved to the catalog this session (for feedback).
  const [savedToCatalog, setSavedToCatalog] = useState<Record<string, boolean>>({});

  const totals = useMemo(() => {
    let subtotal = 0;
    for (const l of lines) {
      if (!lineCounts(l)) continue;
      subtotal += lineTotal(l);
    }
    // Advisory preview: subtotal + adjustment. Tax (if any) is settled by the
    // server on save via recomputeEstimateTotals, so it's omitted here.
    const total = subtotal + adjustmentCents;
    const deposit = Math.round((total * depositPercent) / 100);
    return { subtotal, total, deposit };
  }, [lines, adjustmentCents, depositPercent]);

  function addLine(c: CatalogItem) {
    setLines((prev) => [...prev, catalogToDraft(c)]);
  }

  function addBlankLine() {
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        catalogId: null,
        name: "",
        description: null,
        kind: "service",
        quantity: 1,
        unitPriceCents: 0,
        discountCents: 0,
        taxable: false,
        isOption: type === "options",
        isMandatory: false,
      },
    ]);
  }

  function patchLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function itemsPayload() {
    return lines
      .filter((l) => l.name.trim())
      .map((l) => ({
        catalogId: l.catalogId,
        name: l.name.trim(),
        description: l.description,
        kind: l.kind,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        discountCents: l.discountCents,
        taxable: l.taxable,
        isOption: type === "options" ? l.isOption : false,
        isMandatory: l.isMandatory,
        packageGroup: null,
      }));
  }

  function detailsPatch() {
    return {
      customerName,
      customerPhone,
      customerEmail,
      contactId,
      jobAddress,
      jobName,
      estimateType: type,
      adjustmentCents,
      depositPercent,
      messageToCustomer: message,
      terms,
      internalNotes,
      expiresAtIso: isCompleteWhen(expiry) ? etLocalToIso(expiry) : null,
    };
  }

  // Create-mode: create the estimate, then persist items + details, then either
  // land on the edit page (save draft) or send. Edit-mode: patch details + items
  // against the existing id.
  async function persist(): Promise<ActionResult & { estimateId?: string }> {
    if (mode === "edit" && estimate) {
      const upd = await updateEstimate(estimate.id, detailsPatch());
      if (!upd.ok) return upd;
      const items = await saveEstimateItems(estimate.id, itemsPayload());
      if (!items.ok) return items;
      return { ok: true, estimateId: estimate.id };
    }
    const created = await createEstimate({
      leadId: seed.leadId ?? undefined,
      contactId: contactId ?? undefined,
      estimateType: type,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      customerEmail: customerEmail || undefined,
      jobAddress: jobAddress || undefined,
      jobName: jobName || undefined,
    });
    if (!created.ok || !created.estimateId) return created;
    // Never send contactId in the follow-up patch: for a new client the state
    // is null, and it would wipe the contact link createEstimate just resolved
    // server-side (name dedupe / ensureContact).
    const upd = await updateEstimate(created.estimateId, { ...detailsPatch(), contactId: undefined });
    if (!upd.ok) return upd;
    const items = await saveEstimateItems(created.estimateId, itemsPayload());
    if (!items.ok) return items;
    return { ok: true, estimateId: created.estimateId };
  }

  function handleSaveDraft() {
    setNotice("");
    setSaved(false);
    startTransition(async () => {
      const res = await persist();
      if (!res.ok) {
        setNotice(res.notice ?? "Could not save the estimate.");
        return;
      }
      if (mode === "create" && res.estimateId) {
        router.push(`/CanesPressure/estimates/${res.estimateId}`);
      } else {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2500);
        router.refresh();
      }
    });
  }

  function handleSend() {
    if (lines.filter((l) => l.name.trim()).length === 0) {
      setNotice("Add at least one line before sending.");
      return;
    }
    if (!target.canSend) {
      setNotice("Add a phone or email to send this estimate.");
      return;
    }
    setNotice("");
    setSaved(false);
    startTransition(async () => {
      const res = await persist();
      if (!res.ok || !res.estimateId) {
        setNotice(res.notice ?? "Could not save the estimate.");
        return;
      }
      const sent = await sendEstimate(res.estimateId, {
        channels: resolvedChannels,
        ...overrideSendOpts(override),
      });
      if (!sent.ok) {
        setNotice(sent.notice ?? "Saved as draft, but sending failed.");
        // Land on the estimate so the send can be retried from the rail.
        router.push(`/CanesPressure/estimates/${res.estimateId}`);
        return;
      }
      router.push(`/CanesPressure/estimates/${res.estimateId}`);
    });
  }

  // Save a custom (no catalog_id) line into the reusable service catalog.
  function handleSaveToCatalog(l: DraftLine) {
    const name = l.name.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await upsertCatalogItem({
        name,
        kind: l.kind,
        defaultPriceCents: l.unitPriceCents,
        taxable: l.taxable,
      });
      if (res.ok) {
        setSavedToCatalog((prev) => ({ ...prev, [l.key]: true }));
      } else {
        setNotice(res.notice ?? "Could not save to services.");
      }
    });
  }

  const activeCatalog = catalog.filter((c) => c.active);
  const disabled = isPending || readOnly;

  // Which channels are reachable, and what the picker's choice resolves to. When
  // a channel is unavailable (no field, or opted out of text), force it off so we
  // never ask the server to send where it can't. A valid send-to-other override
  // beats the typed contact fields, field by field.
  const target = resolveSendTarget({
    phone: customerPhone,
    email: customerEmail,
    optedOut,
    override,
  });
  const chosen = choiceToChannels(channelChoice);
  const resolvedChannels = {
    text: chosen.text && target.hasPhone && !target.textBlocked,
    email: chosen.email && target.hasEmail,
  };

  const typeSegment = (value: EstimateType, label: string) => (
    <button
      type="button"
      onClick={() => setType(value)}
      disabled={readOnly}
      className={`min-h-[32px] cursor-pointer rounded text-[13px] font-semibold transition-colors ${
        type === value
          ? "bg-[var(--cp-brand-fill)] text-white"
          : "text-[var(--cp-muted)] hover:text-[var(--cp-ink)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Customer + job */}
      <section className="cp-card p-4">
        <h2 className="text-[15px] font-semibold">Customer &amp; job</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="cp-label" htmlFor="est-name">Client name</label>
            <CustomerPicker
              id="est-name"
              customers={customers}
              value={customerName}
              onChange={changeCustomerName}
              onPick={pickCustomer}
              linkedId={contactId}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="cp-label" htmlFor="est-phone">Phone</label>
            <PhoneInput
              key={`${contactId ?? "manual"}:${pickSeq}`}
              id="est-phone"
              defaultValue={customerPhone}
              onChange={setCustomerPhone}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="cp-label" htmlFor="est-email">Email (optional)</label>
            <input
              id="est-email"
              type="email"
              className="cp-input"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              disabled={disabled}
              placeholder="name@email.com"
            />
          </div>
          <div>
            <label className="cp-label" htmlFor="est-jobname">Job name</label>
            <input
              id="est-jobname"
              className="cp-input"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              disabled={disabled}
              placeholder="Driveway + house wash"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="cp-label" htmlFor="est-address">Job address</label>
            <AddressInput
              id="est-address"
              value={jobAddress}
              onChange={setJobAddress}
              disabled={disabled}
            />
          </div>
          <div>
            <span className="cp-label">Estimate type</span>
            <div className="grid grid-cols-2 gap-1 rounded-md border border-[var(--cp-line)] bg-[var(--cp-surface)] p-1">
              {typeSegment("standard", "Standard")}
              {typeSegment("options", "Options")}
            </div>
            <p className="mt-1.5 text-[12px] text-[var(--cp-faint)]">
              {type === "options"
                ? "Customer picks which optional lines to add."
                : "One fixed scope; every line is included."}
            </p>
          </div>
        </div>
      </section>

      {/* Catalog tap-to-add strip */}
      {!readOnly && (
        <section className="cp-card p-4">
          <h2 className="text-[15px] font-semibold">Add services</h2>
          {activeCatalog.length === 0 ? (
            <p className="mt-1 text-[12px] text-[var(--cp-faint)]">
              No saved services yet — add a line below, or set up your service list in{" "}
              <Link href="/CanesPressure/estimates/items" className="font-medium text-[var(--cp-brand-fill)] hover:underline">
                Settings
              </Link>
              .
            </p>
          ) : (
            <p className="mt-1 text-[12px] text-[var(--cp-faint)]">Tap to add a line.</p>
          )}
          {/* Mobile wraps the tap-to-add chips (thumb-friendly, no hidden
              off-screen services); desktop keeps the single-row scroll strip. */}
          <div className="cp-scroll mt-3 -mx-1 flex flex-wrap gap-2 px-1 pb-1 md:flex-nowrap md:overflow-x-auto">
            {activeCatalog.map((c) => (
              <button
                key={c.id}
                type="button"
                className="cp-slot min-h-[44px] shrink-0 md:min-h-[38px]"
                onClick={() => addLine(c)}
                disabled={disabled}
              >
                {c.name}
                <span className="cp-slot-sub tabular-nums">{fmtMoney(c.default_price_cents)}</span>
              </button>
            ))}
            <button
              type="button"
              className="cp-slot min-h-[44px] shrink-0 md:min-h-[38px]"
              onClick={addBlankLine}
              disabled={disabled}
            >
              <Plus size={15} strokeWidth={2} />
              <span className="cp-slot-sub">Custom</span>
            </button>
          </div>
        </section>
      )}

      {/* Line items — compact stacked cards, not a dense grid */}
      <section className="cp-card p-4">
        <h2 className="text-[15px] font-semibold">Line items</h2>
        {lines.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-[var(--cp-muted)]">
            No lines yet. {readOnly ? "" : "Tap a service above to start."}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {lines.map((l, i) => {
              const included = lineCounts(l);
              return (
                <li key={l.key}>
                  {i > 0 && <div className="cp-divider mb-3" />}
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2">
                      <input
                        className="cp-input flex-1"
                        value={l.name}
                        onChange={(e) => patchLine(l.key, { name: e.target.value })}
                        disabled={disabled}
                        placeholder="Service name"
                        aria-label="Line name"
                      />
                      {!readOnly && (
                        <button
                          type="button"
                          className="cp-btn cp-btn-sm cp-btn-danger shrink-0"
                          onClick={() => removeLine(l.key)}
                          disabled={disabled}
                          aria-label="Remove line"
                        >
                          <Trash2 size={14} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-[1fr_1.4fr_auto] items-center gap-2">
                      <div>
                        <label className="cp-label" htmlFor={`qty-${l.key}`}>Qty</label>
                        <input
                          id={`qty-${l.key}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.5"
                          className="cp-input tabular-nums"
                          value={l.quantity}
                          onChange={(e) => patchLine(l.key, { quantity: Number(e.target.value) || 0 })}
                          disabled={disabled}
                        />
                      </div>
                      <div>
                        <label className="cp-label" htmlFor={`price-${l.key}`}>Unit price</label>
                        <input
                          id={`price-${l.key}`}
                          type="text"
                          inputMode="decimal"
                          className="cp-input tabular-nums"
                          defaultValue={centsToInput(l.unitPriceCents)}
                          onBlur={(e) => {
                            const cents = inputToCents(e.target.value);
                            e.target.value = centsToInput(cents);
                            patchLine(l.key, { unitPriceCents: cents });
                          }}
                          disabled={disabled}
                        />
                      </div>
                      <div className="text-right">
                        <span className="cp-label">Line</span>
                        <p
                          className={`min-h-[38px] pt-2 text-[15px] font-semibold tabular-nums ${
                            included ? "" : "text-[var(--cp-faint)] line-through"
                          }`}
                        >
                          {fmtMoney(lineTotal(l))}
                        </p>
                      </div>
                    </div>
                    {type === "options" && (
                      <div className="flex flex-wrap items-center gap-4 pt-0.5">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium">
                          <input
                            type="checkbox"
                            checked={l.isOption}
                            onChange={(e) =>
                              patchLine(l.key, {
                                isOption: e.target.checked,
                                isMandatory: e.target.checked ? l.isMandatory : false,
                              })
                            }
                            disabled={disabled}
                          />
                          Optional add-on
                        </label>
                        {l.isOption && (
                          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium">
                            <input
                              type="checkbox"
                              checked={l.isMandatory}
                              onChange={(e) => patchLine(l.key, { isMandatory: e.target.checked })}
                              disabled={disabled}
                            />
                            Required
                          </label>
                        )}
                      </div>
                    )}
                    {/* Custom line (no catalog match) → offer to save it for reuse. */}
                    {!readOnly && l.catalogId === null && l.name.trim() && l.unitPriceCents > 0 && (
                      <div className="pt-0.5">
                        {savedToCatalog[l.key] ? (
                          <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--cp-good)]">
                            <Check size={13} strokeWidth={2} /> Saved to your services
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="text-[12.5px] font-medium text-[var(--cp-brand-fill)] hover:underline disabled:opacity-45"
                            onClick={() => handleSaveToCatalog(l)}
                            disabled={disabled}
                          >
                            Save to my services
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Totals */}
        <div className="cp-divider mt-4 space-y-2 pt-4">
          <div className="flex items-center justify-between text-[13.5px]">
            <span className="text-[var(--cp-muted)]">Subtotal</span>
            <span className="tabular-nums">{fmtMoney(totals.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-[13.5px]">
            <span className="text-[var(--cp-muted)]">Adjustment</span>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                inputMode="decimal"
                className="cp-input w-28 tabular-nums"
                defaultValue={centsToInput(adjustmentCents)}
                onBlur={(e) => {
                  const cents = inputToCents(e.target.value);
                  e.target.value = centsToInput(cents);
                  setAdjustmentCents(cents);
                }}
                disabled={disabled}
                aria-label="Adjustment amount"
              />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--cp-line)] pt-2 text-[16px] font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{fmtMoney(totals.total)}</span>
          </div>
        </div>
      </section>

      {/* Deposit */}
      <section className="cp-card p-4">
        <h2 className="text-[15px] font-semibold">Deposit</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {depositPresets.map((p) => (
            <button
              key={p}
              type="button"
              className="cp-slot"
              data-selected={!customDeposit && depositPercent === p}
              onClick={() => {
                setCustomDeposit(false);
                setDepositPercent(p);
              }}
              disabled={disabled}
            >
              {p === 0 ? "None" : `${p}%`}
            </button>
          ))}
          <button
            type="button"
            className="cp-slot"
            data-selected={customDeposit}
            onClick={() => setCustomDeposit(true)}
            disabled={disabled}
          >
            Custom
          </button>
          {customDeposit && (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={100}
                className="cp-input w-20 tabular-nums"
                value={depositPercent}
                onChange={(e) =>
                  setDepositPercent(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                }
                disabled={disabled}
                aria-label="Custom deposit percent"
              />
              <span className="text-[13.5px] text-[var(--cp-muted)]">%</span>
            </div>
          )}
        </div>
        {depositPercent > 0 && (
          <p className="mt-2.5 text-[13px] tabular-nums text-[var(--cp-muted)]">
            Deposit due: <span className="font-semibold text-[var(--cp-ink)]">{fmtMoney(totals.deposit)}</span>
          </p>
        )}
      </section>

      {/* Message + terms + notes */}
      <section className="cp-card p-4">
        <h2 className="text-[15px] font-semibold">Message &amp; terms</h2>
        <div className="mt-3 space-y-3">
          <div>
            <label className="cp-label" htmlFor="est-message">Message to customer</label>
            <textarea
              id="est-message"
              rows={3}
              className="cp-textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="cp-label" htmlFor="est-terms">Terms</label>
            <textarea
              id="est-terms"
              rows={4}
              className="cp-textarea"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="cp-label" htmlFor="est-notes">Internal notes (private)</label>
            <textarea
              id="est-notes"
              rows={2}
              className="cp-textarea"
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              disabled={disabled}
              placeholder="Gate codes, crew notes — never shown to the customer."
            />
          </div>
          <div>
            <span className="cp-label">Expires</span>
            {readOnly ? (
              <p className="text-[13.5px] tabular-nums text-[var(--cp-muted)]">
                {expiry ? expiry.replace("T", " ") + " ET" : "No expiry set."}
              </p>
            ) : (
              <SchedulePicker value={expiry} onChange={setExpiry} />
            )}
          </div>
        </div>
      </section>

      {/* Save / Send */}
      {!readOnly && (
        <div className="space-y-3">
          <div>
            <span className="cp-label">Send by</span>
            <ChannelPicker
              phone={customerPhone}
              email={customerEmail}
              optedOut={optedOut}
              choice={channelChoice}
              onChange={setChannelChoice}
              disabled={isPending}
              override={override}
              onOverrideChange={setOverride}
            />
          </div>
          {/* Send is the primary; on mobile the two CTAs stack full-width
              (Save & send on top), on desktop they sit inline and compact. */}
          <div className="flex flex-col-reverse gap-2 md:flex-row md:flex-wrap md:items-center">
            <button
              type="button"
              className="cp-btn cp-btn-block md:min-h-9 md:w-auto md:rounded-[5px] md:text-[13px]"
              onClick={handleSaveDraft}
              disabled={isPending}
            >
              {isPending ? "Saving..." : "Save draft"}
            </button>
            <button
              type="button"
              className="cp-btn cp-btn-primary cp-btn-block md:min-h-9 md:w-auto md:rounded-[5px] md:text-[13px]"
              onClick={handleSend}
              disabled={isPending || !target.canSend}
            >
              {isPending ? "Working..." : "Save & send"}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--cp-good)]">
                <Check size={14} strokeWidth={2} /> Saved
              </span>
            )}
            {notice && <span className="text-[12.5px] text-[var(--cp-warn)]">{notice}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
