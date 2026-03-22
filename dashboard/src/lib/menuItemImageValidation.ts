/**
 * Server-side validation for menu item images (dashboard API routes).
 * Same rules as backend/src/utils/menuItemImageValidation.ts
 */
import imageSize from "image-size";

export const MENU_ITEM_IMAGE_MIN_SIDE = 400;
export const MENU_ITEM_IMAGE_MAX_SIDE = 2000;
export const MENU_ITEM_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export type ImageValidationResult =
  | { ok: true; width: number; height: number }
  | { ok: false; error: string };

export function validateMenuItemSquareImage(buffer: Buffer): ImageValidationResult {
  if (!buffer?.length) return { ok: false, error: "Empty file" };
  if (buffer.length > MENU_ITEM_IMAGE_MAX_BYTES) {
    return { ok: false, error: `File size exceeds ${MENU_ITEM_IMAGE_MAX_BYTES / (1024 * 1024)}MB` };
  }
  try {
    const r = imageSize(buffer);
    const w = r.width ?? 0;
    const h = r.height ?? 0;
    if (!w || !h) return { ok: false, error: "Could not read image dimensions" };
    if (w !== h) {
      return { ok: false, error: `Image must be square (1:1 ratio). Got ${w}×${h} px` };
    }
    if (w < MENU_ITEM_IMAGE_MIN_SIDE) {
      return {
        ok: false,
        error: `Minimum size is ${MENU_ITEM_IMAGE_MIN_SIDE}×${MENU_ITEM_IMAGE_MIN_SIDE} px (got ${w}×${h})`,
      };
    }
    if (w > MENU_ITEM_IMAGE_MAX_SIDE) {
      return {
        ok: false,
        error: `Maximum size is ${MENU_ITEM_IMAGE_MAX_SIDE}×${MENU_ITEM_IMAGE_MAX_SIDE} px (got ${w}×${h})`,
      };
    }
    return { ok: true, width: w, height: h };
  } catch {
    return { ok: false, error: "Invalid or unsupported image file" };
  }
}

/** Build permanent CDN URL when R2_PUBLIC_BASE_URL is configured (no expiry). */
export function publicUrlForR2Key(r2Key: string): string | null {
  const base = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) return null;
  return `${base}/${r2Key.replace(/^\//, "")}`;
}
