import { parseMonth, parseScope, type Scope } from "@/components/dashboard/data";
import { apiFail, apiOk, apiRoute } from "@/lib/api/v1";
import { buildWgMobileSection, isOwnerOnlyWgSection } from "@/lib/mobile/woof-gang-dashboard";
import { getWgMobileActor, type WgMobileActor } from "@/lib/mobile/woof-gang";
import { WG_DASHBOARD_SECTIONS, type WgDashboardSection } from "@urso/types";

export const dynamic = "force-dynamic";

function parseSection(value: string | null): WgDashboardSection | null {
  return WG_DASHBOARD_SECTIONS.find((section) => section === value) ?? null;
}

export const GET = apiRoute<Record<string, string>, WgMobileActor>(async ({ req, actor }) => {
  const search = req.nextUrl.searchParams;
  const section = parseSection(search.get("section"));
  if (!section) return apiFail("Choose a valid Woof Gang dashboard section.", 400);
  if (actor.role === "manager" && isOwnerOnlyWgSection(section)) {
    return apiFail("This dashboard section is owner-only.", 403);
  }

  const requestedScope = parseScope(search.get("store"));
  const scope: Scope = actor.role === "manager" && actor.storeId ? actor.storeId : requestedScope;
  const month = parseMonth(search.get("month"));

  try {
    const data = await buildWgMobileSection(section, scope, month, actor, {
      query: search.get("q") ?? undefined,
      sort: search.get("sort") ?? undefined,
      direction: search.get("dir") ?? undefined,
      page: search.get("page") ?? undefined,
      compareMode: search.get("mode") ?? undefined,
      comparePreset: search.get("preset") ?? undefined,
      compareMetric: search.get("metric") ?? undefined,
      compareA: search.get("a") ?? undefined,
      compareB: search.get("b") ?? undefined,
    });
    return apiOk(data);
  } catch (error) {
    console.error(`[api/v1/workspaces/woof-gang/dashboard] ${section}: ${error instanceof Error ? error.message : String(error)}`);
    return apiFail("This dashboard section is temporarily unavailable. Try again shortly.", 503);
  }
}, {
  authenticate: (req) => getWgMobileActor(req.headers.get("authorization")),
});
