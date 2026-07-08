import Link from "next/link";
import type { Overview } from "@/lib/canes/data";
import { fmtMoney } from "@/lib/canes/types";

// Three money tiles — the week's cash picture at a glance, exact to the cent.

export function MoneyRow({ money }: { money: Overview["money"] }) {
  const tiles = [
    {
      label: "Collected this week",
      cents: money.collectedThisWeekCents,
      href: "/CanesPressure/insights",
    },
    {
      label: "Won this week",
      cents: money.wonThisWeekCents,
      href: "/CanesPressure/insights",
    },
    {
      label: "Booked next 7 days",
      cents: money.bookedNext7DaysCents,
      href: "/CanesPressure/schedule",
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-3">
      {tiles.map((t) => (
        <Link key={t.label} href={t.href} className="cp-card cp-card-hover block px-4 py-3.5">
          <p className="cp-mono">{t.label}</p>
          <p className="mt-1 text-[22px] font-bold leading-tight tabular-nums">{fmtMoney(t.cents)}</p>
        </Link>
      ))}
    </section>
  );
}
