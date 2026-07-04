import { NextRequest, NextResponse } from "next/server";
import { processInboundSms } from "@/lib/canes/inbound";

// Dev-only harness: exercise the full inbound-SMS pipeline (vendor parse,
// hold texts, YES confirmations, organic leads) without a Twilio number.
//   curl -X POST localhost:3000/api/canes/dev/simulate \
//     -H 'Content-Type: application/json' -d '{"from":"+15615550123","body":"YES"}'
// In production it requires the same bearer secret as the cron route.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const allowed =
    process.env.NODE_ENV === "development" ||
    (Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`);
  if (!allowed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let payload: { from?: string; body?: string };
  try {
    payload = (await req.json()) as { from?: string; body?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!payload.from || !payload.body) {
    return NextResponse.json({ error: "`from` and `body` are required" }, { status: 400 });
  }

  try {
    const outcome = await processInboundSms({ from: payload.from, body: payload.body });
    return NextResponse.json(outcome);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[canes] simulate failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
