import { NextRequest, NextResponse } from "next/server";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { createOrganicLead, findLeadByPhone, logLeadEvent } from "@/lib/canes/inbound";
import { alertOwner } from "@/lib/canes/twilio";
import { fmtEt, fmtPhone, toE164 } from "@/lib/canes/types";

// Public intake endpoint for the branded request-a-quote form (the GHL form
// replacement). Both the on-site form at /CanesPressure/request and any later
// embed POST here; every submission becomes a website lead through the same
// inbound path, so speed-to-lead automation and the owner alert fire exactly
// as they do for an inbound text. No auth on purpose (it is CORS-embeddable),
// so a honeypot + length caps carry the abuse guard.
export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX = { name: 120, phone: 40, email: 160, address: 240, service: 80, message: 1000, website: 100 };

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";

function clip(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function truthy(v: unknown): boolean {
  return v === true || v === "true" || v === "on" || v === "1" || v === "yes";
}

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  let raw: Record<string, unknown> = {};
  try {
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      raw = (await req.json()) as Record<string, unknown>;
    } else {
      const form = await req.formData();
      raw = Object.fromEntries([...form.entries()]);
    }
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  // Honeypot: a real person never fills a hidden field. Bots do. Answer a
  // silent success so scripts get no signal that they were caught.
  if (clip(raw.website, MAX.website)) return json({ ok: true });

  const name = clip(raw.name, MAX.name);
  const email = clip(raw.email, MAX.email);
  const address = clip(raw.address, MAX.address);
  const service = clip(raw.service, MAX.service);
  const message = clip(raw.message, MAX.message);
  const phone = toE164(clip(raw.phone, MAX.phone));
  const consent = truthy(raw.consent);

  // Consent is deliberately optional (A2P compliance: opting in to SMS may
  // not be a condition of submitting the form). Its state is recorded either
  // way so the owner knows whether this contact may be texted.
  const errors: Record<string, string> = {};
  if (!name) errors.name = "Please enter your name.";
  if (!phone) errors.phone = "Please enter a valid US phone number.";
  if (Object.keys(errors).length > 0 || !phone) return json({ ok: false, errors }, 400);

  // Off the demo fixtures nothing should be written; the UI still shows success.
  if (!canesConfigured()) return json({ ok: true, demo: true });

  try {
    const consentLine = consent
      ? `SMS consent given via website request on ${fmtEt(new Date().toISOString())} ET.`
      : `No SMS consent given with the website request on ${fmtEt(new Date().toISOString())} ET (checkbox left unchecked) — do not text unless they text first.`;
    const note = [
      "Website quote request.",
      service ? `Service: ${service}.` : "",
      message,
      consentLine,
    ]
      .filter(Boolean)
      .join(" ");

    const existing = await findLeadByPhone(phone);
    if (existing) {
      // Dedupe by phone: never spawn a second card for a number we already
      // know. Fill only the blanks so nothing Sebastian corrected by hand is
      // clobbered, then log the fresh request so it shows on the timeline.
      const patch: Record<string, unknown> = { last_activity_at: new Date().toISOString() };
      if (!existing.name && name) patch.name = name;
      if (!existing.email && email) patch.email = email;
      if (!existing.address && address) patch.address = address;
      if (!existing.service && service) patch.service = service;
      patch.notes = existing.notes ? `${existing.notes}\n\n${note}` : note;
      await canesDb().from("leads").update(patch).eq("id", existing.id);
      await logLeadEvent(existing.id, "website_request", `New website quote request. ${consentLine}`);
      // A known number is still a fresh opportunity — page the owner the same
      // way an inbound text would, so a returning customer never sits unseen.
      await alertOwner(
        `New website quote request from ${existing.name ?? fmtPhone(phone)}. ` +
          `Open: ${APP_URL}/CanesPressure/leads/${existing.id}`,
      );
    } else {
      // Brand-new number: reuse the shared inbound path so the hold text,
      // cold-lead notification, and owner alert all fire, then enrich the fresh
      // lead with the website source and the fields the form collected.
      const lead = await createOrganicLead(phone, {
        via: "text",
        context: message || "Website quote request",
      });
      if (!lead) {
        // Insert failed (or a UNIQUE race on the phone) — do NOT tell the
        // customer they'll be contacted when nothing was recorded.
        return json(
          { ok: false, error: "Something went wrong. Please text us at (561) 652-6652 instead." },
          500,
        );
      }
      await canesDb()
        .from("leads")
        .update({
          source: "website",
          name: name || null,
          email: email || null,
          address: address || null,
          service: service || null,
          notes: note,
        })
        .eq("id", lead.id);
      await logLeadEvent(lead.id, consent ? "consent" : "website_request", consentLine);
    }

    return json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[canes] lead intake failed:", msg);
    return json({ ok: false, error: "Something went wrong. Please text us at (561) 652-6652 instead." }, 500);
  }
}
