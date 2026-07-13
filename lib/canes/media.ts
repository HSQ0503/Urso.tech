import { randomUUID } from "crypto";
import { canesDb } from "@/lib/canes/supabase";
import type {
  JobMediaCategory,
  JobMediaItem,
  JobMediaVisibility,
} from "@/lib/canes/types";

// Private per-job photos (0011_job_media.sql). The bucket is never public: the
// server mints short-lived signed upload URLs after a job-access check, the
// browser uploads straight to Storage (large bodies never pass through a
// Server Action), and reads are signed per request. Callers are responsible
// for authorization — every function here trusts nothing from the browser
// except primitive metadata, and rebuilds storage paths itself.

export const JOB_MEDIA_BUCKET = "canes-job-media";
export const MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MEDIA_MAX_BYTES = 12 * 1024 * 1024;
const SIGNED_READ_TTL_SECONDS = 3600;

export const CREW_UPLOAD_CATEGORIES: JobMediaCategory[] = ["before", "after", "issue"];
export const OWNER_UPLOAD_CATEGORIES: JobMediaCategory[] = [
  "before",
  "after",
  "walkthrough",
  "reference",
  "issue",
];

export type MediaUploadRequest = {
  mimeType: string;
  sizeBytes: number;
  category: JobMediaCategory;
};

export type MediaUploadGrant = {
  mediaId: string;
  originalPath: string;
  thumbnailPath: string;
  originalUploadUrl: string;
  thumbnailUploadUrl: string;
};

export type MediaFinalizeInput = {
  jobId: string;
  mediaId: string;
  category: JobMediaCategory;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  capturedAt: string | null;
  caption?: string | null;
};

type MediaRow = {
  id: string;
  created_at: string;
  job_id: string;
  uploaded_by_account_id: string | null;
  media_type: "photo" | "video";
  category: JobMediaCategory;
  visibility: JobMediaVisibility;
  storage_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  captured_at: string | null;
  width: number | null;
  height: number | null;
  approved_at: string | null;
  deleted_at: string | null;
};

const MEDIA_COLUMNS =
  "id, created_at, job_id, uploaded_by_account_id, media_type, category, visibility, " +
  "storage_path, thumbnail_path, caption, captured_at, width, height, approved_at, deleted_at";

function extensionFor(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

// Paths are always rebuilt server-side from ids the server verified, so the
// browser can never choose where an object lands or which object it claims.
export function mediaPaths(
  jobId: string,
  mediaId: string,
  mimeType: string,
): { original: string; thumbnail: string } {
  const base = `jobs/${jobId}/${mediaId}`;
  return {
    original: `${base}/original.${extensionFor(mimeType)}`,
    thumbnail: `${base}/thumbnail.jpg`,
  };
}

export function validateMediaUpload(input: MediaUploadRequest): string | null {
  if (!MEDIA_MIME_TYPES.includes(input.mimeType)) {
    return "Only JPEG, PNG, or WebP photos can be uploaded.";
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return "The photo file looks empty. Try again.";
  }
  if (input.sizeBytes > MEDIA_MAX_BYTES) {
    return "That photo is too large even after compression. Try again.";
  }
  return null;
}

async function ensureBucket(): Promise<void> {
  const { error } = await canesDb().storage.createBucket(JOB_MEDIA_BUCKET, {
    public: false,
    fileSizeLimit: MEDIA_MAX_BYTES + 3 * 1024 * 1024,
    allowedMimeTypes: [...MEDIA_MIME_TYPES],
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`Media bucket creation failed: ${error.message}`);
  }
}

async function signedUploadUrl(path: string, retryOnMissingBucket = true): Promise<string> {
  const storage = canesDb().storage.from(JOB_MEDIA_BUCKET);
  const { data, error } = await storage.createSignedUploadUrl(path, { upsert: true });
  if (error) {
    // 0011 creates the bucket, but self-heal if Storage was provisioned after
    // the migration ran (or on a fresh project) instead of failing the upload.
    if (retryOnMissingBucket && /bucket not found/i.test(error.message)) {
      await ensureBucket();
      return signedUploadUrl(path, false);
    }
    throw new Error(`Upload authorization failed: ${error.message}`);
  }
  return data.signedUrl;
}

// Mint one grant per photo: id + paths + a signed upload URL for the original
// and the thumbnail. Nothing is written to the database until the browser
// finishes uploading and the server verifies the object actually exists.
export async function createMediaUploadGrant(
  jobId: string,
  input: MediaUploadRequest,
): Promise<MediaUploadGrant> {
  const mediaId = randomUUID();
  const paths = mediaPaths(jobId, mediaId, input.mimeType);
  const [originalUploadUrl, thumbnailUploadUrl] = await Promise.all([
    signedUploadUrl(paths.original),
    signedUploadUrl(paths.thumbnail),
  ]);
  return {
    mediaId,
    originalPath: paths.original,
    thumbnailPath: paths.thumbnail,
    originalUploadUrl,
    thumbnailUploadUrl,
  };
}

function sanitizeCapturedAt(value: string | null): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  if (time > Date.now() + 60_000) return null;
  return new Date(time).toISOString();
}

// Record the uploaded photo once the object is really in Storage. Retries are
// idempotent: storage_path is unique, so a second finalize returns the row the
// first one created instead of duplicating it.
export async function finalizeMediaUpload(
  input: MediaFinalizeInput,
  uploadedByAccountId: string | null,
): Promise<{ row: MediaRow | null; notice?: string }> {
  const invalid = validateMediaUpload(input);
  if (invalid) return { row: null, notice: invalid };

  const db = canesDb();
  const paths = mediaPaths(input.jobId, input.mediaId, input.mimeType);
  const folder = `jobs/${input.jobId}/${input.mediaId}`;
  const { data: objects, error: listError } = await db.storage
    .from(JOB_MEDIA_BUCKET)
    .list(folder);
  if (listError) return { row: null, notice: `Upload check failed: ${listError.message}` };
  const names = (objects ?? []).map((object) => object.name);
  if (!names.includes(paths.original.split("/").pop() ?? "")) {
    return { row: null, notice: "The upload did not complete. Try again." };
  }
  const hasThumbnail = names.includes("thumbnail.jpg");

  const { data: inserted, error } = await db
    .from("job_media")
    .insert({
      job_id: input.jobId,
      uploaded_by_account_id: uploadedByAccountId,
      media_type: "photo",
      category: input.category,
      visibility: "assigned_crew",
      storage_path: paths.original,
      thumbnail_path: hasThumbnail ? paths.thumbnail : null,
      mime_type: input.mimeType,
      size_bytes: Math.round(input.sizeBytes),
      width: input.width,
      height: input.height,
      caption: input.caption?.trim().slice(0, 500) || null,
      captured_at: sanitizeCapturedAt(input.capturedAt),
    })
    .select(MEDIA_COLUMNS)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await db
        .from("job_media")
        .select(MEDIA_COLUMNS)
        .eq("storage_path", paths.original)
        .maybeSingle();
      return { row: (existing as MediaRow | null) ?? null };
    }
    return { row: null, notice: error.message };
  }
  return { row: inserted as MediaRow | null };
}

export async function recordJobMediaActivity(
  jobId: string,
  accountId: string | null,
  eventType: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await canesDb().from("job_activity_events").insert({
    job_id: jobId,
    account_id: accountId,
    event_type: eventType,
    detail,
  });
  if (error) console.error(`[canes media] activity ${eventType} failed: ${error.message}`);
}

async function uploaderNames(accountIds: string[]): Promise<Map<string, string>> {
  if (accountIds.length === 0) return new Map();
  const { data } = await canesDb()
    .from("crew_accounts")
    .select("id, team_members (name)")
    .in("id", accountIds);
  const names = new Map<string, string>();
  for (const row of (data ?? []) as unknown as {
    id: string;
    team_members: { name: string } | null;
  }[]) {
    if (row.team_members?.name) names.set(row.id, row.team_members.name);
  }
  return names;
}

async function signedReadUrls(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data, error } = await canesDb()
    .storage.from(JOB_MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_READ_TTL_SECONDS);
  if (error) {
    console.error(`[canes media] signed read urls failed: ${error.message}`);
    return urls;
  }
  (data ?? []).forEach((entry, index) => {
    if (entry.signedUrl) urls.set(paths[index], entry.signedUrl);
  });
  return urls;
}

async function mapRows(rows: MediaRow[]): Promise<JobMediaItem[]> {
  const accountIds = [
    ...new Set(rows.map((row) => row.uploaded_by_account_id).filter(Boolean) as string[]),
  ];
  const readPaths = [
    ...new Set(rows.flatMap((row) => [row.storage_path, row.thumbnail_path].filter(Boolean) as string[])),
  ];
  const [names, urls] = await Promise.all([uploaderNames(accountIds), signedReadUrls(readPaths)]);
  return rows.map((row) => ({
    id: row.id,
    jobId: row.job_id,
    mediaType: row.media_type,
    category: row.category,
    visibility: row.visibility,
    caption: row.caption,
    capturedAt: row.captured_at,
    createdAt: row.created_at,
    width: row.width,
    height: row.height,
    uploadedBy: row.uploaded_by_account_id
      ? (names.get(row.uploaded_by_account_id) ?? "Technician")
      : null,
    approvedAt: row.approved_at,
    thumbnailUrl: urls.get(row.thumbnail_path ?? "") ?? urls.get(row.storage_path) ?? null,
    fullUrl: urls.get(row.storage_path) ?? null,
  }));
}

// Owner gallery: everything that isn't soft-deleted. Technician gallery:
// additionally excludes owner-only rows — the caller must already have
// verified the actor can access this job.
export async function listJobMedia(
  jobId: string,
  audience: "owner" | "technician",
): Promise<JobMediaItem[]> {
  let query = canesDb()
    .from("job_media")
    .select(MEDIA_COLUMNS)
    .eq("job_id", jobId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (audience === "technician") query = query.neq("visibility", "internal");
  const { data, error } = await query;
  if (error) {
    // 42P01 = job_media does not exist yet. Degrade to an empty gallery so the
    // crew and owner pages keep working if this code deploys before 0011 runs.
    if (error.code === "42P01") {
      console.warn("[canes media] job_media table missing — run 0011_job_media.sql");
      return [];
    }
    throw new Error(`Job media read failed: ${error.message}`);
  }
  return mapRows((data ?? []) as unknown as MediaRow[]);
}

export async function getJobMediaRow(mediaId: string): Promise<MediaRow | null> {
  const { data } = await canesDb()
    .from("job_media")
    .select(MEDIA_COLUMNS)
    .eq("id", mediaId)
    .maybeSingle();
  return (data as MediaRow | null) ?? null;
}
