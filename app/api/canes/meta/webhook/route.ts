import { NextResponse } from "next/server";
import { canesConfigured } from "@/lib/canes/supabase";
import { leadgenIdsFromPayload, verifyMetaSignature } from "@/lib/canes/meta-form";
import { ingestMetaLeadgen } from "@/lib/canes/meta-leads";

// Meta Instant Forms (Lead Ads) webhook. GET is the hub.challenge handshake.
// POST is HMAC-SHA256 of the raw body with the App Secret, then Graph fetch of
// field_data. Fails closed: missing secrets or a bad signature write nothing.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.CANES_META_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CANES_META_APP_SECRET;
  const rawBody = await req.text();
  if (!verifyMetaSignature(req.headers.get("x-hub-signature-256"), rawBody, secret)) {
    console.warn("[canes] meta webhook rejected: bad signature");
    return new Response("Invalid signature", { status: 401 });
  }
  if (!canesConfigured() || !process.env.CANES_META_PAGE_ACCESS_TOKEN) {
    return NextResponse.json({ ok: false, retry: true }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  const ids = leadgenIdsFromPayload(payload);
  if (ids.length === 0) return NextResponse.json({ ok: true, skipped: "no_leadgen" });

  try {
    for (const id of ids) {
      const outcome = await ingestMetaLeadgen(id);
      if (outcome.handled === "busy") {
        return NextResponse.json({ ok: false, retry: true }, { status: 503 });
      }
      console.log(`[canes] meta webhook ${id}: ${outcome.handled}`);
    }
  } catch (err) {
    console.error("[canes] meta webhook processing failed:", err);
    return NextResponse.json({ ok: false, retry: true }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
