import { apiOk, apiRoute } from "@/lib/api/v1";
import { getCanonicalMobileSession } from "@/lib/mobile/woof-gang";
import type { MobileSession } from "@urso/types";

export const dynamic = "force-dynamic";

// GET /api/v1/mobile/session — canonical cross-workspace identity. The API
// derives every role and scope from a live backing record; no mobile-supplied
// workspace, role, or store value affects this response.
export const GET = apiRoute<Record<string, string>, MobileSession>(
  async ({ actor }) => apiOk(actor),
  {
    authenticate: (req) => getCanonicalMobileSession(req.headers.get("authorization")),
  },
);
