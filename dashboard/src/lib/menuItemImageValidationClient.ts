/**
 * Browser-side checks for menu item images (matches server rules in menuItemImageValidation.ts).
 */

export const MENU_ITEM_IMAGE_MIN_SIDE = 400;
export const MENU_ITEM_IMAGE_MAX_SIDE = 2000;
export const MENU_ITEM_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export async function validateMenuItemImageFile(
  file: File
): Promise<{ valid: true } | { valid: false; error: string }> {
  const type = file.type?.toLowerCase();
  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  if (!type || !allowed.includes(type)) {
    return { valid: false, error: "Use PNG, JPEG, or WebP." };
  }
  if (file.size > MENU_ITEM_IMAGE_MAX_BYTES) {
    return {
      valid: false,
      error: `Image must be ${MENU_ITEM_IMAGE_MAX_BYTES / (1024 * 1024)} MB or smaller.`,
    };
  }
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        resolve({ valid: false, error: "Could not read image dimensions." });
        return;
      }
      if (w !== h) {
        resolve({ valid: false, error: `Image must be square (1:1). Got ${w}×${h} px.` });
        return;
      }
      if (w < MENU_ITEM_IMAGE_MIN_SIDE) {
        resolve({
          valid: false,
          error: `Minimum size is ${MENU_ITEM_IMAGE_MIN_SIDE}×${MENU_ITEM_IMAGE_MIN_SIDE} px (got ${w}×${h}).`,
        });
        return;
      }
      if (w > MENU_ITEM_IMAGE_MAX_SIDE) {
        resolve({
          valid: false,
          error: `Maximum size is ${MENU_ITEM_IMAGE_MAX_SIDE}×${MENU_ITEM_IMAGE_MAX_SIDE} px (got ${w}×${h}).`,
        });
        return;
      }
      resolve({ valid: true });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ valid: false, error: "Could not read image file." });
    };
    img.src = url;
  });
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("load"));
    };
    img.src = url;
  });
}

/**
 * Center-crop to square, then scale side to [MIN_SIDE, MAX_SIDE], re-encode as JPEG under max bytes.
 * Use when the user taps "Auto-fix" after a failed validation (wrong aspect, too small/large, etc.).
 */
export async function normalizeMenuItemImageFile(
  file: File
): Promise<{ ok: true; file: File } | { ok: false; error: string }> {
  const type = file.type?.toLowerCase();
  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  if (!type || !allowed.includes(type)) {
    return { ok: false, error: "Use PNG, JPEG, or WebP." };
  }
  let img: HTMLImageElement;
  try {
    img = await loadImageFromFile(file);
  } catch {
    return { ok: false, error: "Could not read image file." };
  }
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) {
    return { ok: false, error: "Could not read image dimensions." };
  }

  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = (h - side) / 2;
  const outDim = Math.min(Math.max(side, MENU_ITEM_IMAGE_MIN_SIDE), MENU_ITEM_IMAGE_MAX_SIDE);

  const canvas = document.createElement("canvas");
  canvas.width = outDim;
  canvas.height = outDim;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { ok: false, error: "Your browser cannot process this image." };
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, outDim, outDim);

  let quality = 0.92;
  let blob: Blob | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob) {
      return { ok: false, error: "Could not encode image." };
    }
    if (blob.size <= MENU_ITEM_IMAGE_MAX_BYTES) {
      break;
    }
    quality -= 0.12;
  }
  if (!blob || blob.size > MENU_ITEM_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      error: `Image is still over ${MENU_ITEM_IMAGE_MAX_BYTES / (1024 * 1024)} MB after processing. Try a smaller source image.`,
    };
  }

  const base = file.name.replace(/\.[^.]+$/, "") || "menu-item";
  const out = new File([blob], `${base}-menu.jpg`, { type: "image/jpeg" });
  return { ok: true, file: out };
}
