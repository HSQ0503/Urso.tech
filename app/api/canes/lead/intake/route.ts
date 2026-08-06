import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import {
  completeOrganicLead,
  createOrganicLead,
  findLeadByPhone,
  logLeadEvent,
} from "@/lib/canes/inbound";
import { alertOwner } from "@/lib/canes/twilio";
import { fmtEt, fmtPhone, toE164 } from "@/lib/canes/types";
import { pushNewLead } from "@/lib/canes/push-events";

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
  "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
};

const MAX = {
  name: 120,
  phone: 40,
  email: 160,
  address: 240,
  service: 80,
  message: 1000,
  website: 100,
  submissionId: 160,
};

const RATE_LIMIT = { requests: 8, windowSeconds: 15 * 60 };
const MAX_BODY_BYTES = 32_768;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";

class RequestBodyTooLargeError extends Error {}

async function readRequestBody(req: NextRequest): Promise<Uint8Array> {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RequestBodyTooLargeError("Request body is too large.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function clip(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function truthy(v: unknown): boolean {
  return v === true || v === "true" || v === "on" || v === "1" || v === "yes";
}

function json(body: unknown, status = 200, headers?: Record<string, string>): NextResponse {
  return NextResponse.json(body, { status, headers: { ...CORS, ...headers } });
}

function normalizeIp(value: string): string | null {
  let candidate = value.trim();
  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  }
  if (candidate.startsWith("::ffff:")) candidate = candidate.slice(7);
  return isIP(candidate) ? candidate : null;
}

function trustedClientIp(req: NextRequest): string | null {
  // Forwarded IP headers are attacker-controlled unless the deployment is
  // behind a proxy we explicitly trust. Vercel sets/normalizes its forwarding
  // chain; use the final valid hop so a client-prepended first value cannot
  // choose its own rate-limit bucket. Self-hosted proxies require an opt-in.
  if (process.env.VERCEL !== "1" && process.env.CANES_TRUST_PROXY !== "1") return null;
  const header =
    (process.env.VERCEL === "1" ? req.headers.get("x-vercel-forwarded-for") : null) ??
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip");
  if (!header) return null;
  const candidates = header.split(",").map(normalizeIp).filter((value): value is string => Boolean(value));
  return candidates.at(-1) ?? null;
}

function privateHash(value: string): string {
  const secret =
    process.env.CANES_INTAKE_HASH_SECRET ??
    process.env.CANES_SUPABASE_SECRET_KEY ??
    "canes-intake-unconfigured";
  return createHmac("sha256", secret).update(value).digest("hex");
}

type IntakeClaim = {
  state: "acquired" | "in_progress" | "completed" | "failed" | "conflict" | "rate_limited";
  lead_id?: string | null;
  created_lead?: boolean | null;
  response?: Record<string, unknown> | null;
  retry_after_seconds?: number;
};

async function runSubmissionEffect(
  submissionKey: string,
  effectKey: string,
  effect: () => Promise<void>,
): Promise<void> {
  const db = canesDb();
  const { data, error } = await db.rpc("claim_public_lead_effect", {
    p_submission_key: submissionKey,
    p_effect_key: effectKey,
  });
  if (error) throw new Error(`public lead effect claim failed: ${error.message}`);
  if (data !== true) return;

  try {
    await effect();
    const { error: finishError } = await db.rpc("finish_public_lead_effect", {
      p_submission_key: submissionKey,
      p_effect_key: effectKey,
      p_error: null,
    });
    if (finishError) console.error(`[canes] public lead effect completion failed: ${finishError.message}`);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    const { error: finishError } = await db.rpc("finish_public_lead_effect", {
      p_submission_key: submissionKey,
      p_effect_key: effectKey,
      p_error: message,
    });
    if (finishError) console.error(`[canes] public lead effect failure record failed: ${finishError.message}`);
    throw caught;
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "Request body is too large." }, 413);
  }

  let raw: Record<string, unknown> = {};
  try {
    const body = await readRequestBody(req);
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      const parsed = JSON.parse(new TextDecoder().decode(body)) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return json({ ok: false, error: "Invalid request body." }, 400);
      }
      raw = parsed as Record<string, unknown>;
    } else {
      const parser = new Request(req.url, {
        method: "POST",
        headers: req.headers,
        body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
      });
      const form = await parser.formData();
      raw = Object.fromEntries([...form.entries()]);
    }
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json({ ok: false, error: error.message }, 413);
    }
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

  const normalizedPayload = JSON.stringify({ name, phone, email, address, service, message, consent });
  const payloadHash = createHash("sha256").update(normalizedPayload).digest("hex");
  const suppliedSubmissionId = clip(
    raw.submissionId ?? raw.submission_id ?? req.headers.get("idempotency-key"),
    MAX.submissionId,
  );
  // A caller-provided idempotency key survives page reloads. Existing forms
  // without one still get stable day-scoped retry protection from the exact
  // normalized payload. Hash both forms so opaque client identifiers never
  // become database identifiers.
  const submissionMaterial = suppliedSubmissionId
    ? `provided:${suppliedSubmissionId}`
    : `derived:${new Date().toISOString().slice(0, 10)}:${normalizedPayload}`;
  const submissionKey = `website:${createHash("sha256").update(submissionMaterial).digest("hex")}`;
  const ipIdentity = trustedClientIp(req) ?? `untrusted-phone:${phone}`;
  const ipHash = privateHash(ipIdentity);
  const db = canesDb();

  const { data: claimData, error: claimError } = await db.rpc("claim_public_lead_submission", {
    p_submission_key: submissionKey,
    p_payload_hash: payloadHash,
    p_ip_hash: ipHash,
    p_max_requests: RATE_LIMIT.requests,
    p_window_seconds: RATE_LIMIT.windowSeconds,
  });
  if (claimError) {
    console.error(`[canes] lead intake claim failed: ${claimError.message}`);
    return json({ ok: false, error: "Please try again in a moment." }, 503);
  }

  const claim = claimData as IntakeClaim;
  if (claim.state === "completed") return json(claim.response ?? { ok: true });
  if (claim.state === "in_progress") return json({ ok: true, processing: true }, 202);
  if (claim.state === "failed") {
    return json(
      claim.response ?? {
        ok: false,
        error: "Something went wrong. Please text us at (561) 652-6652 instead.",
      },
      500,
    );
  }
  if (claim.state === "conflict") {
    return json({ ok: false, error: "That submission key was already used for different details." }, 409);
  }
  if (claim.state === "rate_limited") {
    const retryAfter = Math.max(1, claim.retry_after_seconds ?? RATE_LIMIT.windowSeconds);
    return json(
      { ok: false, error: "Too many requests. Please wait a few minutes and try again." },
      429,
      { "Retry-After": String(retryAfter) },
    );
  }

  let claimedLeadId: string | null = claim.lead_id ?? null;
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
    const submissionEventId = submissionKey;

    const existing = await findLeadByPhone(phone);
    if (claim.created_lead === true) {
      if (!existing || (claimedLeadId && existing.id !== claimedLeadId)) {
        throw new Error("claimed website lead no longer exists");
      }
      claimedLeadId = existing.id;
      await completeOrganicLead(existing, {
        via: "text",
        eventId: submissionEventId,
        suppressPush: true,
        publicSubmissionKey: submissionKey,
      });
      const { error: enrichError } = await db.rpc("apply_public_lead_created_enrichment", {
        p_submission_key: submissionKey,
        p_lead_id: existing.id,
        p_name: name,
        p_email: email,
        p_address: address,
        p_service: service,
        p_note: note,
      });
      if (enrichError) throw new Error(`website lead enrichment failed: ${enrichError.message}`);
      await logLeadEvent(
        existing.id,
        consent ? "consent" : "website_request",
        consentLine,
        `${submissionKey}:consent`,
      );
      await pushNewLead(
        { ...existing, name: name || null },
        "new_lead",
        submissionEventId,
      );
    } else if (existing) {
      claimedLeadId = existing.id;
      const { error: bindError } = await db.rpc("bind_public_lead_submission", {
        p_submission_key: submissionKey,
        p_payload_hash: payloadHash,
        p_lead_id: existing.id,
        p_created_lead: false,
      });
      if (bindError) throw new Error(`website lead bind failed: ${bindError.message}`);
      // Dedupe by phone: never spawn a second card for a number we already
      // know. Fill only the blanks so nothing Sebastian corrected by hand is
      // clobbered, then log the fresh request so it shows on the timeline.
      const { error: updateError } = await db.rpc("apply_public_lead_existing_update", {
        p_submission_key: submissionKey,
        p_lead_id: existing.id,
        p_name: name,
        p_email: email,
        p_address: address,
        p_service: service,
        p_note: note,
        p_event_detail: `New website quote request. ${consentLine}`,
      });
      if (updateError) throw new Error(`website lead update failed: ${updateError.message}`);
      // A known number is still a fresh opportunity — page the owner the same
      // way an inbound text would, so a returning customer never sits unseen.
      await runSubmissionEffect(submissionKey, "existing-lead-owner-alert", async () => {
        const result = await alertOwner(
          `New website quote request from ${existing.name ?? fmtPhone(phone)}. ` +
            `Open: ${APP_URL}/CanesPressure/leads/${existing.id}`,
        );
        if (!result.ok) throw new Error(result.error ?? result.skipped ?? "Owner alert failed");
      });
      await pushNewLead(
        { ...existing, name: existing.name || name || null },
        "website_request",
        submissionEventId,
      );
    } else {
      // Brand-new number: reuse the shared inbound path so the hold text,
      // cold-lead notification, and owner alert all fire, then enrich the fresh
      // lead with the website source and the fields the form collected.
      const lead = await createOrganicLead(phone, {
        via: "text",
        context: message || "Website quote request",
        eventId: submissionEventId,
        suppressPush: true,
        publicSubmissionKey: submissionKey,
        onCreated: async (createdLead) => {
          const { error: bindError } = await db.rpc("bind_public_lead_submission", {
            p_submission_key: submissionKey,
            p_payload_hash: payloadHash,
            p_lead_id: createdLead.id,
            p_created_lead: true,
          });
          if (bindError) throw new Error(`website lead bind failed: ${bindError.message}`);
          claimedLeadId = createdLead.id;
        },
      });
      if (!lead) {
        // Do not complete the public claim as successful when no CRM record
        // exists. The catch path persists a terminal failure response, so a
        // browser retry cannot replay any earlier owner alerts.
        throw new Error("website lead creation returned no lead");
      }
      claimedLeadId = lead.id;
      const { error: enrichError } = await db.rpc("apply_public_lead_created_enrichment", {
        p_submission_key: submissionKey,
        p_lead_id: lead.id,
        p_name: name,
        p_email: email,
        p_address: address,
        p_service: service,
        p_note: note,
      });
      if (enrichError) throw new Error(`website lead enrichment failed: ${enrichError.message}`);
      await logLeadEvent(
        lead.id,
        consent ? "consent" : "website_request",
        consentLine,
        `${submissionKey}:consent`,
      );
      await pushNewLead(
        { ...lead, name: name || null },
        "new_lead",
        submissionEventId,
      );
    }

    const response = { ok: true };
    const { error: finishError } = await db.rpc("finish_public_lead_submission", {
      p_submission_key: submissionKey,
      p_payload_hash: payloadHash,
      p_lead_id: claimedLeadId,
      p_response: response,
      p_error: null,
    });
    if (finishError) throw new Error(`website lead completion failed: ${finishError.message}`);
    return json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[canes] lead intake failed:", msg);
    const response = {
      ok: false,
      error: "Something went wrong. Please text us at (561) 652-6652 instead.",
    };
    const { error: finishError } = await db.rpc("finish_public_lead_submission", {
      p_submission_key: submissionKey,
      p_payload_hash: payloadHash,
      p_lead_id: claimedLeadId,
      p_response: response,
      p_error: msg,
    });
    if (finishError) console.error(`[canes] lead intake failure record failed: ${finishError.message}`);
    return json(response, 500);
  }
}
