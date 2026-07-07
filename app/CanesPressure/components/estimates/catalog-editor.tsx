"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import {
  upsertCatalogItem,
  deleteCatalogItem,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import type { CatalogItem, CatalogKind } from "@/lib/canes/types";

// Catalog editor: Sebastian's price list. Each row edits inline against a
// controlled draft, then saves on its own so one edit never clobbers another.
// Prices show in dollars here and convert to integer cents at save. New rows
// append below; deleting soft-deactivates (upstream action sets active:false).

type Notice = { ok: boolean; text: string } | null;

function noticeFrom(res: ActionResult): Notice {
  return res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.notice ?? "Could not save." };
}

// UI-side working shape: prices as dollar strings so the input stays editable.
type Draft = {
  id?: string;
  name: string;
  kind: CatalogKind;
  price: string; // dollars, as typed
  taxable: boolean;
  active: boolean;
  position: number;
};

function toDraft(item: CatalogItem): Draft {
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    price: (item.default_price_cents / 100).toFixed(2),
    taxable: item.taxable,
    active: item.active,
    position: item.position,
  };
}

function dollarsToCents(price: string): number | null {
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function CatalogRow({
  draft,
  onDelete,
}: {
  draft: Draft;
  onDelete: (id: string | undefined) => void;
}) {
  const [row, setRow] = useState<Draft>(draft);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, start] = useTransition();
  const [removing, startRemove] = useTransition();

  const save = () => {
    if (!row.name.trim()) {
      setNotice({ ok: false, text: "Name is required." });
      return;
    }
    const cents = dollarsToCents(row.price);
    if (cents === null) {
      setNotice({ ok: false, text: "Price must be a number." });
      return;
    }
    start(async () => {
      const res = await upsertCatalogItem({
        id: row.id,
        name: row.name.trim(),
        kind: row.kind,
        defaultPriceCents: cents,
        taxable: row.taxable,
        active: row.active,
        position: row.position,
      });
      setNotice(noticeFrom(res));
    });
  };

  const remove = () => {
    if (!row.id) {
      onDelete(undefined);
      return;
    }
    startRemove(async () => {
      const res = await deleteCatalogItem(row.id!);
      if (res.ok) onDelete(row.id);
      else setNotice({ ok: false, text: res.notice ?? "Could not remove." });
    });
  };

  return (
    <div className="rounded-md border border-[var(--cp-line)] p-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_120px]">
        <div>
          <label className="cp-label" htmlFor={`cat-name-${row.id ?? "new"}`}>
            Service name
          </label>
          <input
            id={`cat-name-${row.id ?? "new"}`}
            className="cp-input"
            placeholder="Driveway wash"
            value={row.name}
            onChange={(e) => setRow({ ...row, name: e.target.value })}
          />
        </div>
        <div>
          <label className="cp-label" htmlFor={`cat-kind-${row.id ?? "new"}`}>
            Kind
          </label>
          <select
            id={`cat-kind-${row.id ?? "new"}`}
            className="cp-select"
            value={row.kind}
            onChange={(e) => setRow({ ...row, kind: e.target.value as CatalogKind })}
          >
            <option value="service">Service</option>
            <option value="product">Product</option>
          </select>
        </div>
        <div>
          <label className="cp-label" htmlFor={`cat-price-${row.id ?? "new"}`}>
            Default price
          </label>
          <input
            id={`cat-price-${row.id ?? "new"}`}
            className="cp-input tabular-nums"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="0.00"
            value={row.price}
            onChange={(e) => setRow({ ...row, price: e.target.value })}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-[13px] font-medium text-[var(--cp-ink)]">
          <input
            type="checkbox"
            checked={row.taxable}
            onChange={(e) => setRow({ ...row, taxable: e.target.checked })}
          />
          Taxable
        </label>
        <label className="flex items-center gap-2 text-[13px] font-medium text-[var(--cp-ink)]">
          <input
            type="checkbox"
            checked={row.active}
            onChange={(e) => setRow({ ...row, active: e.target.checked })}
          />
          Active
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="cp-btn cp-btn-primary cp-btn-sm" onClick={save} disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          className="cp-btn cp-btn-danger cp-btn-sm px-2.5"
          aria-label={`Remove ${row.name || "row"}`}
          onClick={remove}
          disabled={removing}
        >
          <X size={14} strokeWidth={2} />
          {row.id ? "Remove" : "Discard"}
        </button>
        {notice && (
          <p
            className="text-[12.5px] font-medium"
            style={{ color: notice.ok ? "var(--cp-good)" : "var(--cp-warn)" }}
          >
            {notice.text}
          </p>
        )}
      </div>
    </div>
  );
}

export function CatalogEditor({ items }: { items: CatalogItem[] }) {
  // Persisted rows come keyed by id. New (unsaved) rows get a client-only key so
  // React keeps their local state stable until their first save reloads the page.
  const [drafts, setDrafts] = useState<Draft[]>(() => items.map(toDraft));
  const [newKeys, setNewKeys] = useState<string[]>([]);

  const nextPosition = drafts.reduce((max, d) => Math.max(max, d.position), 0) + 1;

  const addRow = () => {
    setDrafts([
      ...drafts,
      { name: "", kind: "service", price: "0.00", taxable: false, active: true, position: nextPosition },
    ]);
    setNewKeys([...newKeys, `new-${Date.now()}-${newKeys.length}`]);
  };

  // A removed persisted row (soft-deactivated) drops out of the list; a
  // discarded new row drops out too. Positions in the persisted rows are stable.
  const removeAt = (index: number, id: string | undefined) => {
    if (id) {
      setDrafts(drafts.filter((d) => d.id !== id));
    } else {
      const persistedCount = drafts.filter((d) => d.id).length;
      const newIndex = index - persistedCount;
      setDrafts(drafts.filter((_, i) => i !== index));
      setNewKeys(newKeys.filter((_, i) => i !== newIndex));
    }
  };

  const persisted = drafts.filter((d) => d.id);
  const fresh = drafts.filter((d) => !d.id);

  return (
    <section className="cp-card p-4 md:p-5">
      <h2 className="cp-display text-[16px]">Service catalog</h2>
      <p className="mt-1 text-[13px] text-[var(--cp-muted)]">
        Your default price list. These prefill the estimate builder. Editing a price here never changes
        estimates you already sent.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {drafts.length === 0 ? (
          <p className="text-[13px] text-[var(--cp-muted)]">No services yet. Add your first one below.</p>
        ) : (
          <>
            {persisted.map((d) => {
              const index = drafts.indexOf(d);
              return (
                <CatalogRow
                  key={d.id}
                  draft={d}
                  onDelete={(id) => removeAt(index, id)}
                />
              );
            })}
            {fresh.map((d, i) => {
              const index = drafts.indexOf(d);
              return (
                <CatalogRow
                  key={newKeys[i] ?? `fresh-${i}`}
                  draft={d}
                  onDelete={(id) => removeAt(index, id)}
                />
              );
            })}
          </>
        )}
      </div>

      <div className="mt-4">
        <button type="button" className="cp-btn shrink-0" onClick={addRow}>
          <Plus size={16} strokeWidth={2} />
          Add service
        </button>
      </div>
    </section>
  );
}
