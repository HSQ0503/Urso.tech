import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDiscoverySubmission } from "@/lib/email";

// Pre-meeting discovery form (app/discovery). Persists to discovery_submissions
// (the system of record) AND pings the founders via Resend. Both are best-effort
// and independent — a warm prospect filled out a long form, so we never want to
// lose it: as long as one path succeeds we return ok.

type Payload = {
  name?: string;
  email?: string;
  businessName?: string;
  locations?: string;
  structure?: string;
  revenueBand?: string;
  systems?: string;
  infoLocation?: string;
  contactChannels?: string;
  journey?: string;
  leakGuess?: string;
  wishVisibility?: string;
  gutDecisions?: string;
  currentReports?: string;
  worthIt?: string;
  anythingElse?: string;
};

const clean = (s?: string): string | null => {
  const t = s?.trim();
  return t ? t : null;
};

export async function POST(req: Request) {
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim() ?? "";

  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "That email looks off." }, { status: 400 });
  }

  // Persist (source of truth).
  let stored = false;
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("discovery_submissions").insert({
      name,
      email,
      business_name: clean(body.businessName),
      locations: clean(body.locations),
      structure: clean(body.structure),
      revenue_band: clean(body.revenueBand),
      systems: clean(body.systems),
      info_location: clean(body.infoLocation),
      contact_channels: clean(body.contactChannels),
      journey: clean(body.journey),
      leak_guess: clean(body.leakGuess),
      wish_visibility: clean(body.wishVisibility),
      gut_decisions: clean(body.gutDecisions),
      current_reports: clean(body.currentReports),
      worth_it: clean(body.worthIt),
      anything_else: clean(body.anythingElse),
    });
    if (error) throw error;
    stored = true;
  } catch (e) {
    console.error("[discovery] store failed:", e instanceof Error ? e.message : e);
  }

  // Notify (best-effort).
  const { sent } = await sendDiscoverySubmission({
    name,
    email,
    businessName: body.businessName?.trim(),
    locations: body.locations?.trim(),
    structure: body.structure?.trim(),
    revenueBand: body.revenueBand?.trim(),
    systems: body.systems?.trim(),
    infoLocation: body.infoLocation?.trim(),
    contactChannels: body.contactChannels?.trim(),
    journey: body.journey?.trim(),
    leakGuess: body.leakGuess?.trim(),
    wishVisibility: body.wishVisibility?.trim(),
    gutDecisions: body.gutDecisions?.trim(),
    currentReports: body.currentReports?.trim(),
    worthIt: body.worthIt?.trim(),
    anythingElse: body.anythingElse?.trim(),
  });

  if (!stored && !sent) {
    return NextResponse.json(
      { error: "We couldn't save that. Please try again, or email us directly." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
