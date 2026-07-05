/**
 * R2 key layout for merchant menu item images (matches backend merchant-menu module).
 *   merchant-menu/stores/{store_id}/items/{item_public_id}/images/{uuid}.{ext}
 */

const PREFIX = "merchant-menu/stores";
const IMAGES_FOLDER = "images";
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

function normalizeExt(ext: string): string {
  const lower = ext.toLowerCase();
  if (lower === "jpeg") return "jpg";
  return ALLOWED_EXT.has(lower) ? lower : "jpg";
}

export function buildMenuItemImageKey(
  storeId: number | string,
  itemPublicId: number | string,
  fileId: string,
  ext: string,
): string {
  const safeExt = normalizeExt(ext);
  return `${PREFIX}/${String(storeId)}/items/${String(itemPublicId)}/${IMAGES_FOLDER}/${fileId}.${safeExt}`;
}
