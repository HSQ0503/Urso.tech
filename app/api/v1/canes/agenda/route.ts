import { apiOk, apiRoute, denyUnlessConsole } from "@/lib/api/v1";
import { getAgenda } from "@/lib/canes/data";

// GET /api/v1/canes/agenda — upcoming estimate visits grouped by ET calendar
// day, the same read the Today page makes.
//
// Guarded for the same reason as /overview: the web page looks ungated only
// because the (app) layout bounces a plain technician before it renders. This
// payload is every upcoming visit business-wide with full lead rows — customer
// name, phone, address — so it is not a lesser exposure for carrying no money.
//
// The window is 2 days to match the web Today page (page.tsx calls getAgenda(2)).
// The domain default is 7, and taking it silently made mobile Today show a
// different horizon than the surface this claims to mirror.

export const dynamic = "force-dynamic";

const TODAY_PAGE_DAYS = 2;

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessConsole(actor);
  if (denied) return denied;

  const agenda = await getAgenda(TODAY_PAGE_DAYS);
  return apiOk(agenda);
});
