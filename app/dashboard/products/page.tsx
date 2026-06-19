import Link from "next/link";
import {
  parseScope,
  parseMonth,
  parseProductSort,
  parseSortDir,
  scopeLabel,
  monthLabel,
  PRODUCT_PAGE_SIZE,
  type ProductSort,
} from "@/components/dashboard/data";
import { getProductCatalog } from "@/components/dashboard/data.server";
import { Card, PageHeader, Micro, Tag, fmtMoney, pct } from "@/components/dashboard/ui";
import { InfoTip } from "@/components/dashboard/info-tip";
import { getI18n } from "@/lib/i18n.server";

// Every canonical product sold in the selected period. The same item rung
// under different register spellings is ONE row here: barcodes collapse to a
// canonical name, names collapse by normalization (migration 0018).

const colHelp = (t: (s: string) => string) => (
  <div>
    <div className="font-medium text-ink">{t("What each column means")}</div>
    <ul className="mt-2 space-y-1.5">
      <li><span className="font-mono text-ink">{t("Revenue")}</span><span className="text-ink-dim"> — {t("net of discounts for the selected period. Deposits and gift cards excluded.")}</span></li>
      <li><span className="font-mono text-ink">{t("Units")}</span><span className="text-ink-dim"> — {t("quantity sold in the period.")}</span></li>
      <li><span className="font-mono text-ink">{t("Avg price")}</span><span className="text-ink-dim"> — {t("revenue per unit.")}</span></li>
      <li><span className="font-mono text-ink">{t("Margin")}</span><span className="text-ink-dim"> — {t("(revenue − item cost) / revenue. Retail only; services carry no item cost.")}</span></li>
      <li><span className="font-mono text-ink">{t("Stores")}</span><span className="text-ink-dim"> — {t("how many of the selected stores sold it.")}</span></li>
    </ul>
  </div>
);

type SP = { store?: string; month?: string; q?: string; sort?: string; dir?: string; page?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { t } = await getI18n();
  const scope = parseScope(sp.store);
  const month = parseMonth(sp.month);
  const sort = parseProductSort(sp.sort);
  const dir = parseSortDir(sp.dir, sort);
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const period = month === "all" ? "Last 12 months" : monthLabel(month);

  const catalog = await getProductCatalog(scope, month, { q, sort, dir, page });
  if (!catalog) {
    return (
      <div className="animate-stage-in">
        <PageHeader eyebrow={`${t("Products")} · ${scopeLabel(scope)} · ${period}`} title={t("Products")} />
      </div>
    );
  }
  const { rows, total } = catalog;
  const pages = Math.max(1, Math.ceil(total / PRODUCT_PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * PRODUCT_PAGE_SIZE + 1;
  const last = Math.min(total, page * PRODUCT_PAGE_SIZE);

  // Links preserve every other parameter; sort clicks toggle direction.
  const href = (patch: Partial<SP>) => {
    const params = { store: sp.store, month: sp.month, q: q || undefined, sort, dir, page: undefined, ...patch };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== "") usp.set(k, String(v));
    const s = usp.toString();
    return `/dashboard/products${s ? `?${s}` : ""}`;
  };
  const sortHref = (col: ProductSort) =>
    href({ sort: col, dir: sort === col ? (dir === "asc" ? "desc" : "asc") : col === "name" ? "asc" : "desc" });
  const arrow = (col: ProductSort) => (sort === col ? (dir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div className="animate-stage-in space-y-3">
      <PageHeader
        eyebrow={`${t("Products")} · ${scopeLabel(scope)} · ${period}`}
        title={t("Products")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form action="/dashboard/products" className="flex items-center gap-2">
          {sp.store && <input type="hidden" name="store" value={sp.store} />}
          {sp.month && <input type="hidden" name="month" value={sp.month} />}
          {sort !== "revenue" && <input type="hidden" name="sort" value={sort} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("Search products…")}
            className="w-64 rounded-lg border border-edge bg-transparent px-3 py-1.5 text-[13px] text-ink placeholder:text-ink-dimmer focus:border-orange/60 focus:outline-none"
          />
          <button type="submit" className="rounded-lg border border-edge px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:border-orange/60 hover:text-ink">
            {t("Search")}
          </button>
          {q && (
            <Link href={href({ q: undefined })} className="text-[12.5px] text-ink-dimmer transition-colors hover:text-ink">
              {t("Clear")}
            </Link>
          )}
        </form>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dimmer">
          {total.toLocaleString("en-US")} {t("products")}{q ? ` ${t("matching")} “${q}”` : ""}
        </span>
      </div>

      <Card pad={false}>
        <div className="flex items-center gap-1.5 px-5 pb-1 pt-5">
          <Micro>{t("Catalog · sold in period")}</Micro>
          <InfoTip text={colHelp(t)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
                <th className="px-5 py-2.5 text-left font-normal">
                  <Link href={sortHref("name")} className="transition-colors hover:text-ink">{t("Product")}{arrow("name")}</Link>
                </th>
                <th className="px-5 py-2.5 text-right font-normal">
                  <Link href={sortHref("revenue")} className="transition-colors hover:text-ink">{t("Revenue")}{arrow("revenue")}</Link>
                </th>
                <th className="px-5 py-2.5 text-right font-normal">
                  <Link href={sortHref("units")} className="transition-colors hover:text-ink">{t("Units")}{arrow("units")}</Link>
                </th>
                <th className="px-5 py-2.5 text-right font-normal">{t("Avg price")}</th>
                <th className="px-5 py-2.5 text-right font-normal">
                  <Link href={sortHref("margin")} className="transition-colors hover:text-ink">{t("Margin")}{arrow("margin")}</Link>
                </th>
                <th className="px-5 py-2.5 text-right font-normal">{t("Stores")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-edge transition-colors hover:bg-raise">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-ink">{r.name}</span>
                      <Tag tone={r.line === "Grooming" ? "orange" : "muted"}>{r.line}</Tag>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-ink">{fmtMoney(r.revenue)}</td>
                  <td className="px-5 py-3 text-right font-mono text-ink-dim">{r.units.toLocaleString("en-US")}</td>
                  <td className="px-5 py-3 text-right font-mono text-ink-dim">{r.avgPrice == null ? "—" : fmtMoney(Math.round(r.avgPrice))}</td>
                  <td className="px-5 py-3 text-right font-mono text-ink-dim">{r.margin == null ? "—" : pct(r.margin)}</td>
                  <td className="px-5 py-3 text-right font-mono text-ink-dimmer">{r.stores}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr className="border-t border-edge">
                  <td colSpan={6} className="px-5 py-8 text-center text-[13.5px] text-ink-dim">
                    {t("Nothing sold matches")}{q ? ` “${q}”` : ` ${t("this period")}`} — {t("try a different search or widen the period.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-edge px-5 py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dimmer">
            {first.toLocaleString("en-US")}–{last.toLocaleString("en-US")} {t("of")} {total.toLocaleString("en-US")}
          </span>
          <div className="flex items-center gap-3 text-[12.5px]">
            {page > 1 ? (
              <Link href={href({ page: String(page - 1) })} className="text-ink-dim transition-colors hover:text-ink">← {t("Prev")}</Link>
            ) : (
              <span className="text-ink-dimmer/50">← {t("Prev")}</span>
            )}
            <span className="font-mono text-[11px] text-ink-dimmer">{page} / {pages}</span>
            {page < pages ? (
              <Link href={href({ page: String(page + 1) })} className="text-ink-dim transition-colors hover:text-ink">{t("Next")} →</Link>
            ) : (
              <span className="text-ink-dimmer/50">{t("Next")} →</span>
            )}
          </div>
        </div>
      </Card>

      <p className="text-[12.5px] leading-[1.5] text-ink-dimmer">
        {t("Products that never sold in the period don’t appear — FranPOS doesn’t expose the full catalog yet (vendor request open). Margin uses the item cost FranPOS records at sale time.")}
      </p>
    </div>
  );
}
