import { Image } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";

const MIN_SIDE = 400;
const MAX_SIDE = 2000;
const MAX_BYTES = 10 * 1024 * 1024;

export type NormalizedImageFile = { uri: string; type: string; name: string };

/**
 * Center square crop, resize side into [400, 2000], JPEG, keep under 10 MB.
 */
export async function normalizeMenuItemImageUri(
  uri: string
): Promise<{ ok: true; file: NormalizedImageFile } | { ok: false; error: string }> {
  let w: number;
  let h: number;
  try {
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
    });
    w = dims.width;
    h = dims.height;
  } catch {
    return { ok: false, error: "Could not read image dimensions. Try another photo." };
  }
  if (!w || !h) {
    return { ok: false, error: "Could not read image dimensions." };
  }

  const side = Math.min(w, h);
  const originX = Math.round((w - side) / 2);
  const originY = Math.round((h - side) / 2);
  const outDim = Math.min(Math.max(side, MIN_SIDE), MAX_SIDE);

  let compress = 0.92;
  for (let attempt = 0; attempt < 6; attempt++) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [
        { crop: { originX, originY, width: side, height: side } },
        { resize: { width: outDim, height: outDim } },
      ],
      { compress, format: ImageManipulator.SaveFormat.JPEG }
    );
    const response = await fetch(result.uri);
    const blob = await response.blob();
    const size = blob.size;
    if (size > 0 && size <= MAX_BYTES) {
      return {
        ok: true,
        file: { uri: result.uri, type: "image/jpeg", name: "menu-item-menu.jpg" },
      };
    }
    compress -= 0.12;
  }

  return {
    ok: false,
    error: `Image is still over ${MAX_BYTES / (1024 * 1024)} MB after processing. Try a smaller photo.`,
  };
}
