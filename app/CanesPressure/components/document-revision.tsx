"use client";

import { RepeatFromDocument } from "./recurring/from-document";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  fmtMoney,
  priceServices,
  type DocumentEdit,
  type DocumentKind,
  type ServiceLineInput,
} from "@urso/types";
import {
  applyDocumentChange,
  declineEstimateByOwner,
  loadDocumentEdit,
} from "@/app/CanesPressure/document-actions";
import {
  deleteEstimate,
  deleteInvoice,
  deleteJob,
} from "@/app/CanesPressure/actions";

export function DocumentRevisionControls({
  kind,
  id,
}: {
  kind: DocumentKind;
  id: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [doc, setDoc] = useState<DocumentEdit | null>(null);
  const [lines, setLines] = useState<(ServiceLineInput & { key: string })[]>(
    [],
  );
  const [adjustment, setAdjustment] = useState("0");
  const [tax, setTax] = useState("0");
  const [terms, setTerms] = useState("");
  const [agreement, setAgreement] = useState<"resend" | "verbal">("resend");
  const [review, setReview] = useState(false);
  const [futureVisits, setFutureVisits] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const open = () =>
    start(async () => {
      const result = await loadDocumentEdit(kind, id);
      if (!result.ok) {
        setNotice(result.notice);
        return;
      }
      setDoc(result.data);
      setLines(
        result.data.lines.map((line) => ({
          ...line,
          key: crypto.randomUUID(),
        })),
      );
      setAdjustment(String(result.data.adjustmentCents / 100));
      setTax(String(result.data.taxRateBps / 100));
      setTerms(result.data.terms);
      setReview(false);
      setFutureVisits(false);
      setNotice(null);
    });
  let priced: ReturnType<typeof priceServices> | null = null;
  try {
    priced = priceServices(
      lines,
      Math.round(Number(adjustment) * 100),
      Math.round(Number(tax) * 100),
    );
  } catch {}
  const lineChange = (index: number, patch: Partial<ServiceLineInput>) => {
    setReview(false);
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  };
  return (
    <div className="my-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="cp-btn cp-btn-primary"
          onClick={open}
        >
          Edit prices & discounts
        </button>
        {kind === "estimate" ? (
          <button
            type="button"
            disabled={busy}
            className="cp-btn"
            onClick={() => {
              if (
                !confirm(
                  "Record this estimate as declined? Any open linked work and unpaid payment links will be canceled. Completed work and payments are preserved.",
                )
              )
                return;
              start(async () => {
                const result = await declineEstimateByOwner(id);
                setNotice(result.notice ?? "Saved.");
                router.refresh();
              });
            }}
          >
            Mark declined
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          className="cp-btn"
          onClick={() => {
            if (
              !confirm(
                "Remove this record from active lists? Unused drafts are deleted. Business and payment history is preserved. Open work or unpaid payment links may be canceled.",
              )
            )
              return;
            start(async () => {
              const result = await (kind === "estimate"
                ? deleteEstimate(id)
                : kind === "job"
                  ? deleteJob(id)
                  : deleteInvoice(id));
              setNotice(result.notice ?? "Removed.");
              if (result.ok)
                router.push(
                  kind === "job"
                    ? "/CanesPressure/jobs"
                    : `/CanesPressure/${kind}s`,
                );
              router.refresh();
            });
          }}
        >
          Delete / archive
        </button>
      </div>
      <RepeatFromDocument kind={kind} id={id} />
      {notice ? (
        <p role="status" className="cp-card p-3">
          {notice}
        </p>
      ) : null}
      {doc ? (
        <section className="cp-card space-y-4 p-5">
          <div className="flex justify-between gap-3">
            <h2 className="text-xl font-semibold">Revise {doc.title}</h2>
            <button
              type="button"
              className="cp-btn"
              onClick={() => setDoc(null)}
            >
              Close
            </button>
          </div>
          {lines.map((line, index) => (
            <fieldset
              key={line.key}
              className="grid gap-3 rounded-lg border p-3 sm:grid-cols-4"
            >
              <legend>Service {index + 1}</legend>
              <label className="sm:col-span-4">
                Service
                <input
                  className="cp-input"
                  value={line.name}
                  onChange={(e) => lineChange(index, { name: e.target.value })}
                />
              </label>
              <label>
                Quantity
                <input
                  className="cp-input"
                  type="number"
                  min="0.01"
                  step="any"
                  value={line.quantity}
                  onChange={(e) =>
                    lineChange(index, { quantity: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Unit price ($)
                <input
                  className="cp-input"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={line.unitPriceCents / 100}
                  onChange={(e) =>
                    lineChange(index, {
                      unitPriceCents: Math.round(Number(e.target.value) * 100),
                    })
                  }
                />
              </label>
              <label>
                Discount type
                <select
                  className="cp-input"
                  value={line.discountMode ?? "amount"}
                  onChange={(e) =>
                    lineChange(index, {
                      discountMode:
                        e.target.value === "percent" ? "percent" : "amount",
                    })
                  }
                >
                  <option value="amount">Dollar amount</option>
                  <option value="percent">Percent</option>
                </select>
              </label>
              <label>
                Line discount
                <input
                  className="cp-input"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={(line.discountValue ?? 0) / 100}
                  onChange={(e) =>
                    lineChange(index, {
                      discountValue: Math.round(Number(e.target.value) * 100),
                    })
                  }
                />
              </label>
              {line.isOption ? (
                <label className="flex min-h-12 items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={line.isMandatory}
                    checked={!!(line.isSelected || line.isMandatory)}
                    onChange={(e) =>
                      lineChange(index, { isSelected: e.target.checked })
                    }
                  />
                  Include optional service
                  {line.packageGroup ? ` (${line.packageGroup})` : ""}
                </label>
              ) : null}
              <label className="flex min-h-12 items-center gap-2">
                <input
                  type="checkbox"
                  checked={line.taxable ?? false}
                  onChange={(e) =>
                    lineChange(index, { taxable: e.target.checked })
                  }
                />
                Taxable
              </label>
              <button
                type="button"
                className="cp-btn"
                onClick={() => {
                  setLines((current) => current.filter((_, i) => i !== index));
                  setReview(false);
                }}
              >
                Remove line
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="cp-btn"
            onClick={() => {
              setLines((current) => [
                ...current,
                {
                  key: crypto.randomUUID(),
                  name: "",
                  quantity: 1,
                  unitPriceCents: 0,
                  discountMode: "amount",
                  discountValue: 0,
                },
              ]);
              setReview(false);
            }}
          >
            Add service
          </button>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Adjustment ($)
              <input
                className="cp-input"
                type="number"
                step="0.01"
                value={adjustment}
                onChange={(e) => {
                  setAdjustment(e.target.value);
                  setReview(false);
                }}
              />
            </label>
            <label>
              Tax rate (%)
              <input
                className="cp-input"
                type="number"
                step="0.01"
                min="0"
                value={tax}
                onChange={(e) => {
                  setTax(e.target.value);
                  setReview(false);
                }}
              />
            </label>
          </div>
          <label className="block">
            Terms for this revision
            <textarea
              className="cp-input min-h-32"
              value={terms}
              onChange={(e) => {
                setTerms(e.target.value);
                setReview(false);
              }}
            />
          </label>
          {doc.affected.some((item) => item.kind === "estimate") ? (
            <label className="block">
              Agreement
              <select
                className="cp-input"
                value={agreement}
                onChange={(e) => {
                  setAgreement(
                    e.target.value === "verbal" ? "verbal" : "resend",
                  );
                  setReview(false);
                }}
              >
                <option value="resend">
                  Resend estimate for customer signature
                </option>
                <option value="verbal">
                  Record agreement by phone / in person
                </option>
              </select>
            </label>
          ) : null}
          {doc.recurringPlanId ? (
            <label className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                checked={futureVisits}
                disabled={!doc.futureVisitsEditable}
                onChange={(event) => {
                  setFutureVisits(event.target.checked);
                  setReview(false);
                }}
              />
              Apply services and prices to future visits too (
              {doc.futureVisitCount} already scheduled).
              {!doc.futureVisitsEditable
                ? " Revise billed visits individually."
                : ""}
            </label>
          ) : null}
          {doc.invoiceRewardCents > 0 ? (
            <p>Approved invoice rewards: {fmtMoney(doc.invoiceRewardCents)}</p>
          ) : null}
          <p className="font-semibold">
            Revised total:{" "}
            {priced
              ? fmtMoney(priced.totalCents)
              : "Check the services and discounts"}
          </p>
          {review && priced ? (
            <div className="space-y-3">
              <p>
                Updates {doc.affected.map((item) => item.label).join(", ")}.
                Recorded payments remain {fmtMoney(doc.paidCents)}.{" "}
                {futureVisits
                  ? `Also updates ${doc.futureVisitCount} upcoming visits and the repeat schedule.`
                  : ""}
              </p>
              <p>
                {Math.max(0, priced.totalCents - doc.invoiceRewardCents) <
                doc.paidCents
                  ? `Overpayment requiring a refund or credit decision: ${fmtMoney(doc.paidCents - Math.max(0, priced.totalCents - doc.invoiceRewardCents))}`
                  : `Remaining balance: ${fmtMoney(Math.max(0, priced.totalCents - doc.invoiceRewardCents) - doc.paidCents)}`}
              </p>
              <p>
                Previous signed versions and payments remain in history. Current
                payment links are retired before the revision saves.
              </p>
              <button
                type="button"
                disabled={busy}
                className="cp-btn cp-btn-primary"
                onClick={() =>
                  start(async () => {
                    const result = await applyDocumentChange(kind, id, {
                      fingerprint: doc.fingerprint,
                      lines,
                      adjustmentCents: Math.round(Number(adjustment) * 100),
                      taxRateBps: Math.round(Number(tax) * 100),
                      terms,
                      agreement,
                      futureVisits,
                    });
                    setNotice(result.ok ? result.data.notice : result.notice);
                    if (result.ok) {
                      setDoc(null);
                      router.refresh();
                    }
                  })
                }
              >
                Confirm revision
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!priced || busy}
              className="cp-btn cp-btn-primary"
              onClick={() => setReview(true)}
            >
              Review linked changes
            </button>
          )}
        </section>
      ) : null}
    </div>
  );
}
