import {
  getAgentActionsForStore,
  getCustomersNeedingAttention,
  getCallStats,
  getKpiDeltas,
  getManagerFocus,
  getManagerScorecard,
  getMetrics,
  getOwnerRevenue,
  getSeries,
  getStoreRanking,
  getTeamRoster,
  getTopAction,
  getWebStats,
  getWeeklyBrief,
  storeComparison,
} from "@/components/dashboard/data.server";
import { parseMonth, parseScope, type Scope } from "@/components/dashboard/data";
import { apiFail, apiOk, apiRoute } from "@/lib/api/v1";
import { getWgMobileActor, type WgMobileActor } from "@/lib/mobile/woof-gang";
import type { WgMobileHome, WgStoreId } from "@urso/types";

export const dynamic = "force-dynamic";

// GET /api/v1/workspaces/woof-gang/home?store=&month=
//
// Managers are always pinned to their app_users.store_id. Owner and platform
// actors may narrow the dashboard with store=, but never select another tenant.
export const GET = apiRoute<Record<string, string>, WgMobileActor>(async ({ req, actor }) => {
  const requestedStore = parseScope(req.nextUrl.searchParams.get("store"));
  const scope: Scope = actor.role === "manager" && actor.storeId ? actor.storeId : requestedStore;
  const month = parseMonth(req.nextUrl.searchParams.get("month"));

  try {
    const [metrics, deltas, series, topAction, ownerRevenue, calls, web] = await Promise.all([
      getMetrics(scope, month),
      getKpiDeltas(scope, month),
      getSeries(scope, month),
      getTopAction(scope, month),
      getOwnerRevenue(scope, month),
      getCallStats(scope, month),
      getWebStats(scope, month),
    ]);

    const home: WgMobileHome = {
      workspace: "woof-gang",
      role: actor.role,
      storeId: scope,
      month,
      metrics,
      deltas,
      // Managers get the same register-sales basis as their web scorecard. The
      // owner-only books uplift (tips + commission income) never crosses the
      // manager mobile contract.
      ownerRevenue: actor.role === "manager"
        ? { total: metrics.revenue, source: "register", delta: deltas.revenue }
        : { total: ownerRevenue.total, source: ownerRevenue.source, delta: ownerRevenue.delta },
      calls,
      web,
      revenueSeries: series,
      topAction: {
        title: topAction.title,
        detail: topAction.detail,
        metric: topAction.metric,
        pending: topAction.pending,
      },
    };

    if (actor.role === "manager" && actor.storeId) {
      const [focus, scorecard, rankings, team, watchlist, actions] = await Promise.all([
        getManagerFocus(actor.storeId, month),
        getManagerScorecard(actor.storeId, month),
        getStoreRanking("revenue", month),
        getTeamRoster(actor.storeId, month),
        getCustomersNeedingAttention(actor.storeId),
        getAgentActionsForStore(actor.storeId),
      ]);
      home.manager = {
        focus: { title: focus.title, detail: focus.detail, metric: focus.metric, pending: focus.pending },
        scorecard: scorecard.map((row) => ({
          label: row.label,
          value: row.value,
          raw: row.raw,
          avgLabel: row.avgLabel,
          delta: row.delta,
          beatsAvg: row.beatsAvg,
        })),
        rankings,
        team: team.map((member) => ({
          id: member.id,
          name: member.name,
          revenue: member.revenue,
          appts: member.appts,
          rebook: member.rebook,
          attach: member.attach,
        })),
        watchlist: watchlist.map((customer) => ({
          name: customer.name,
          pet: customer.pet,
          lastVisit: customer.lastVisit,
          segment: customer.segment,
          next: customer.next,
        })),
        actions: actions.map((action) => ({
          id: action.id,
          title: action.title,
          metric: action.metric,
          status: action.status,
        })),
      };
    } else {
      const [brief, stores] = await Promise.all([getWeeklyBrief(scope), storeComparison(month)]);
      home.owner = {
        brief: {
          headline: brief.headline,
          recommendation: brief.recommendation,
          actionsOpen: brief.actionsOpen,
        },
        stores: Object.entries(stores).map(([id, store]) => ({
          id: id as WgStoreId,
          name: ({ wp: "Winter Park", wg: "Winter Garden", lv: "Lakeside Village", wm: "Windermere" })[id] ?? id,
          revenue: store.revenue,
          bookings: store.bookings,
          avgTicket: store.avgTicket,
          rebook: store.rebook,
          attach: store.attach,
          missedPct: store.missedPct,
        })),
      };
    }

    return apiOk(home);
  } catch (error) {
    // Database and RPC diagnostics stay in server logs/data monitoring. Mobile
    // clients receive a stable action-oriented response rather than driver text.
    console.error(`[api/v1/workspaces/woof-gang/home] ${error instanceof Error ? error.message : String(error)}`);
    return apiFail("Dashboard data is temporarily unavailable. Try again shortly.", 503);
  }
}, {
  authenticate: (req) => getWgMobileActor(req.headers.get("authorization")),
});
