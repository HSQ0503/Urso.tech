import { NextResponse } from "next/server";
import { drainMetaIntros } from "@/lib/canes/lead-messaging";
import { canesConfigured } from "@/lib/canes/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canesConfigured()) return NextResponse.json({ skipped: true });
  try {
    return NextResponse.json(await drainMetaIntros(Date.now() + 50_000));
  } catch (error) {
    console.error("[canes] Meta introduction worker failed:", error);
    return NextResponse.json({ error: "Meta introduction worker failed." }, { status: 503 });
  }
}
