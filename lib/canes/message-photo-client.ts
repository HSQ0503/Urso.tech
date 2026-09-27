import { MESSAGE_PHOTO_MAX_BYTES, MESSAGE_PHOTO_MAX_EDGE } from "@urso/types";

export async function prepareMessagePhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image to attach.");
  if (file.size > 50 * 1024 * 1024) throw new Error("Choose a photo smaller than 50 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable in this browser.");
    for (let attempt = 0; attempt < 4; attempt++) {
      const edge = Math.round(MESSAGE_PHOTO_MAX_EDGE * 0.75 ** attempt);
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8 - attempt * 0.15));
      if (blob && blob.size > 0 && blob.size <= MESSAGE_PHOTO_MAX_BYTES) {
        return new File([blob], "photo.jpg", { type: "image/jpeg" });
      }
    }
    throw new Error("That photo could not be made small enough to send.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
