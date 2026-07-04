import type { NextRequest } from "next/server";
import { canesTwilioCreds } from "@/lib/canes/twilio";
import { toE164 } from "@/lib/canes/types";
import { escapeXml, xmlResponse } from "@/lib/twilio";

// Second leg of click-to-call (see initiateCall in app/CanesPressure/actions.ts):
// Twilio rings Sebastian first, then fetches this TwiML to dial the lead with
// the business number as caller ID. Twilio may fetch with GET or POST.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bridge(req: NextRequest): Response {
  const to = toE164(req.nextUrl.searchParams.get("to") ?? "");
  if (!to) return new Response("Invalid `to` number", { status: 400 });
  const { from } = canesTwilioCreds();
  const callerId = from ? ` callerId="${escapeXml(from)}"` : "";
  return xmlResponse(`<Response><Dial${callerId}>${escapeXml(to)}</Dial></Response>`);
}

export async function GET(req: NextRequest) {
  return bridge(req);
}

export async function POST(req: NextRequest) {
  return bridge(req);
}
