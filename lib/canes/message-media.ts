import { randomUUID } from "node:crypto";
import { canesDb } from "@/lib/canes/supabase";

// Private MMS attachment storage. Twilio receives a one-hour signed URL for
// delivery; conversation history stores only the opaque canes-storage ref, so
// photos remain viewable later through the authenticated media proxy.

export const MESSAGE_MEDIA_BUCKET = "canes-message-media";
export const MESSAGE_MEDIA_MAX_BYTES = 4 * 1024 * 1024;
const MESSAGE_MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const DELIVERY_URL_TTL_SECONDS = 60 * 60;

type StoredMessageMedia = {
  ref: string;
  path: string;
};

function extensionFor(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export function validateMessageMedia(file: File): string | null {
  if (!(MESSAGE_MEDIA_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "Choose a JPEG, PNG, or WebP photo.";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return "That photo looks empty. Try again.";
  if (file.size > MESSAGE_MEDIA_MAX_BYTES) return "That photo is too large. Choose one under 4 MB.";
  return null;
}

async function ensureMessageMediaBucket(): Promise<void> {
  const { error } = await canesDb().storage.createBucket(MESSAGE_MEDIA_BUCKET, {
    public: false,
    fileSizeLimit: MESSAGE_MEDIA_MAX_BYTES,
    allowedMimeTypes: [...MESSAGE_MEDIA_MIME_TYPES],
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`message media bucket creation failed: ${error.message}`);
  }
}

async function upload(path: string, file: File, retryOnMissingBucket: boolean): Promise<void> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await canesDb().storage.from(MESSAGE_MEDIA_BUCKET).upload(path, bytes, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (!error) return;
  if (retryOnMissingBucket && /bucket not found/i.test(error.message)) {
    await ensureMessageMediaBucket();
    return upload(path, file, false);
  }
  throw new Error(`message media upload failed: ${error.message}`);
}

export async function storeMessageMedia(file: File): Promise<StoredMessageMedia> {
  const path = `messages/${randomUUID()}.${extensionFor(file.type)}`;
  await upload(path, file, true);
  return { ref: `canes-storage://${MESSAGE_MEDIA_BUCKET}/${path}`, path };
}

function pathFromRef(ref: string): string | null {
  try {
    const url = new URL(ref);
    if (url.protocol !== "canes-storage:" || url.hostname !== MESSAGE_MEDIA_BUCKET) return null;
    const path = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    return path.startsWith("messages/") && !path.includes("..") ? path : null;
  } catch {
    return null;
  }
}

export async function signedMessageMediaUrl(ref: string): Promise<string | null> {
  const path = pathFromRef(ref);
  if (!path) return null;
  const { data, error } = await canesDb()
    .storage.from(MESSAGE_MEDIA_BUCKET)
    .createSignedUrl(path, DELIVERY_URL_TTL_SECONDS);
  if (error || !data.signedUrl) return null;
  return data.signedUrl;
}

export async function downloadMessageMedia(
  ref: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const path = pathFromRef(ref);
  if (!path) return null;
  const { data, error } = await canesDb().storage.from(MESSAGE_MEDIA_BUCKET).download(path);
  if (error || !data) return null;
  return { bytes: await data.arrayBuffer(), contentType: data.type || "application/octet-stream" };
}

export async function removeMessageMedia(path: string): Promise<void> {
  if (!path.startsWith("messages/") || path.includes("..")) return;
  const { error } = await canesDb().storage.from(MESSAGE_MEDIA_BUCKET).remove([path]);
  if (error) console.error(`[canes message media] cleanup failed for ${path}: ${error.message}`);
}
