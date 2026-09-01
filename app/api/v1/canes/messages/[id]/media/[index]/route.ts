import { NextResponse } from "next/server";
import { apiFail, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { canesDb } from "@/lib/canes/supabase";
import { canesTwilioCreds } from "@/lib/canes/twilio";
import { downloadMessageMedia } from "@/lib/canes/message-media";

// GET /api/v1/canes/messages/:id/media/:index — stream one inbound MMS
// attachment to an authenticated inbox reader.
//
// Twilio media URLs require account authentication. The URL can therefore be
// stored with the message, but it cannot be handed directly to a browser or
// native Image without also leaking the Twilio auth token. This endpoint keeps
// the credential server-side and applies the same "leads" permission as the
// inbox and thread readers.

export const dynamic = "force-dynamic";

const TRUSTED_MEDIA_HOSTS = new Set([
  "api.twilio.com",
  "mms.twiliocdn.com",
  "s3-external-1.amazonaws.com",
]);

function mediaResponse(body: BodyInit, contentType: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": "inline",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "X-Urso-Api-Version": "1",
    },
  });
}

function trustedMediaUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && TRUSTED_MEDIA_HOSTS.has(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

export const GET = apiRoute<{ id: string; index: string }>(async ({ actor, params }) => {
  const denied = denyUnlessPagePermitted(actor, "leads");
  if (denied) return denied;

  const index = Number(params.index);
  if (!Number.isInteger(index) || index < 0) return apiFail("That attachment does not exist.", 404);

  const { data, error } = await canesDb()
    .from("messages")
    .select("media_urls")
    .eq("id", params.id)
    .maybeSingle();
  if (error) throw new Error(`message media lookup failed: ${error.message}`);

  const mediaUrls = Array.isArray(data?.media_urls)
    ? data.media_urls.filter((value): value is string => typeof value === "string")
    : [];
  const mediaUrl = mediaUrls[index];
  if (!mediaUrl) return apiFail("That attachment does not exist.", 404);

  if (mediaUrl.startsWith("canes-storage://")) {
    const stored = await downloadMessageMedia(mediaUrl);
    return stored
      ? mediaResponse(stored.bytes, stored.contentType)
      : apiFail("That attachment could not be loaded.", 404);
  }

  const url = trustedMediaUrl(mediaUrl);
  if (!url) return apiFail("That attachment is not from a trusted media host.", 422);

  const creds = canesTwilioCreds();
  if (url.hostname === "api.twilio.com" && (!creds.accountSid || !creds.authToken)) {
    return apiFail("Twilio media is not configured yet.", 503);
  }

  const headers = new Headers();
  if (url.hostname === "api.twilio.com") {
    const basic = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64");
    headers.set("Authorization", `Basic ${basic}`);
  }

  const upstream = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });
  if (!upstream.ok || !upstream.body) {
    return apiFail("That attachment could not be loaded.", upstream.status === 404 ? 404 : 502);
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  return mediaResponse(upstream.body, contentType);
});
