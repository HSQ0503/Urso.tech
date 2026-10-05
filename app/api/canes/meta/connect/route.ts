import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Service-only setup: the browser never receives Meta credentials.
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const pageId = process.env.CANES_META_PAGE_ID;
  const appId = process.env.CANES_META_APP_ID;
  const token = process.env.CANES_META_PAGE_ACCESS_TOKEN;
  const appSecret = process.env.CANES_META_APP_SECRET;
  if (!pageId || !appId || !token || !appSecret) {
    return NextResponse.json({ error: "Meta connection settings are incomplete." }, { status: 503 });
  }

  type GraphResponse = {
    id?: string;
    name?: string;
    success?: boolean;
    data?: unknown;
    error?: { code?: number; message?: string };
  };
  let providerFailure: { status: number; code: number | null; operation: string; message?: string } | undefined;
  const graph = async (path: string, bearer = token, fields?: string[]): Promise<GraphResponse> => {
    const result = await fetch(`https://graph.facebook.com/${process.env.CANES_META_GRAPH_VERSION ?? "v26.0"}/${path}`, {
      method: fields ? "POST" : "GET",
      headers: { Authorization: `Bearer ${bearer}`, ...(fields ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      ...(fields ? { body: new URLSearchParams({ subscribed_fields: fields.join(",") }) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const body = await result.json() as GraphResponse;
    if (!result.ok || body.error) {
      let message = typeof body.error?.message === "string" ? body.error.message : undefined;
      for (const credential of [token, appSecret, secret]) {
        message = message?.replaceAll(credential, "<redacted>").replaceAll(encodeURIComponent(credential), "<redacted>");
      }
      providerFailure = {
        status: result.status,
        code: typeof body.error?.code === "number" ? body.error.code : null,
        operation: fields ? "subscribe" : path.startsWith("debug_token") ? "token_check" : path.startsWith("me?") ? "page_check" : "subscription_check",
        ...(message ? { message: message.slice(0, 500) } : {}),
      };
      throw new Error("Meta rejected the connection.");
    }
    return body;
  };
  const subscribedFields = (result: GraphResponse): string[] => {
    if (!Array.isArray(result.data)) return [];
    const app = result.data.find((item: unknown) => !!item && typeof item === "object" && "id" in item && item.id === appId) as { subscribed_fields?: unknown } | undefined;
    return Array.isArray(app?.subscribed_fields)
      ? app.subscribed_fields.filter((field: unknown): field is string => typeof field === "string")
      : [];
  };

  try {
    const inspected = await graph(`debug_token?input_token=${encodeURIComponent(token)}`, `${appId}|${appSecret}`);
    const identity = inspected.data as { is_valid?: boolean; app_id?: string; profile_id?: string; type?: string } | undefined;
    if (!identity?.is_valid || identity.app_id !== appId || identity.profile_id !== pageId || identity.type !== "PAGE") {
      return NextResponse.json({ error: "Meta token does not match the configured Canes Page and app." }, { status: 409 });
    }
    const page = await graph("me?fields=id,name");
    if (page.id !== pageId) return NextResponse.json({ error: "Meta Page identity mismatch." }, { status: 409 });
    const path = `${encodeURIComponent(pageId)}/subscribed_apps`;
    const current = subscribedFields(await graph(path));
    const changed = !current.includes("leadgen");
    if (changed) {
      const result = await graph(path, token, [...new Set([...current, "leadgen"])]);
      if (!result.success || !subscribedFields(await graph(path)).includes("leadgen")) {
        return NextResponse.json({ error: "Meta has not confirmed the lead subscription." }, { status: 502 });
      }
    }
    return NextResponse.json({ ok: true, connected: true, changed, page: { id: page.id, name: page.name }, appId });
  } catch {
    // Provider responses and network errors may contain credential-bearing URLs.
    return NextResponse.json({ error: "Meta connection failed. Check Page admin access, token validity, and Meta availability.", ...(providerFailure ? { meta: providerFailure } : {}) }, { status: 502 });
  }
}
