import type { ImagePickerAsset } from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { MESSAGE_PHOTO_MAX_BYTES, MESSAGE_PHOTO_MAX_EDGE } from "@urso/types";

export type MessagePhoto = {
  uri: string;
  mimeType: "image/jpeg";
  fileName: string;
  fileSize: number;
};

export async function prepareMessagePhoto(asset: ImagePickerAsset): Promise<MessagePhoto> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const edge = Math.round(MESSAGE_PHOTO_MAX_EDGE * 0.75 ** attempt);
    const context = ImageManipulator.manipulate(asset.uri);
    try {
      if (Math.max(asset.width, asset.height) > edge) {
        context.resize(asset.width >= asset.height ? { width: edge } : { height: edge });
      }
      const image = await context.renderAsync();
      try {
        const saved = await image.saveAsync({
          format: SaveFormat.JPEG,
          compress: 0.8 - attempt * 0.15,
          base64: true,
        });
        if (!saved.base64) throw new Error("The photo could not be prepared.");
        const padding = saved.base64.endsWith("==") ? 2 : saved.base64.endsWith("=") ? 1 : 0;
        const fileSize = saved.base64.length * 3 / 4 - padding;
        if (fileSize > 0 && fileSize <= MESSAGE_PHOTO_MAX_BYTES) {
          return { uri: saved.uri, mimeType: "image/jpeg", fileName: "photo.jpg", fileSize };
        }
      } finally {
        image.release();
      }
    } finally {
      context.release();
    }
  }
  throw new Error("That photo could not be made small enough to send.");
}
