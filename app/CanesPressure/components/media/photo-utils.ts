// Client-side photo preparation. Everything is re-encoded to JPEG through a
// canvas before upload: a 12 MP field photo becomes a ~1–2 MB original plus a
// small thumbnail, EXIF (including GPS) is stripped, and iPhone HEIC becomes
// broadly viewable. Capture time survives separately in the database.

const ORIGINAL_MAX_PX = 2048;
const THUMBNAIL_MAX_PX = 480;

export type PreparedPhoto = {
  original: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  capturedAt: string | null;
};

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      `${file.name || "That file"} is not a photo this browser can read. Use a JPEG or PNG.`,
    );
  }
}

function scaled(bitmap: ImageBitmap, maxPx: number): { width: number; height: number } {
  const ratio = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  return {
    width: Math.max(1, Math.round(bitmap.width * ratio)),
    height: Math.max(1, Math.round(bitmap.height * ratio)),
  };
}

async function encodeJpeg(bitmap: ImageBitmap, maxPx: number, quality: number): Promise<Blob> {
  const { width, height } = scaled(bitmap, maxPx);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo processing is unavailable in this browser.");
  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("The photo could not be processed. Try again.");
  return blob;
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await decode(file);
  try {
    const [original, thumbnail] = await Promise.all([
      encodeJpeg(bitmap, ORIGINAL_MAX_PX, 0.85),
      encodeJpeg(bitmap, THUMBNAIL_MAX_PX, 0.7),
    ]);
    const size = scaled(bitmap, ORIGINAL_MAX_PX);
    return {
      original,
      thumbnail,
      width: size.width,
      height: size.height,
      capturedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    };
  } finally {
    bitmap.close();
  }
}

// PUT straight to the signed Storage URL. x-upsert lets a retry overwrite a
// half-written object instead of failing, so finalize stays idempotent.
export async function uploadToSignedUrl(url: string, blob: Blob): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "image/jpeg", "x-upsert": "true" },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(`The upload failed (${response.status}). Check your signal and try again.`);
  }
}
