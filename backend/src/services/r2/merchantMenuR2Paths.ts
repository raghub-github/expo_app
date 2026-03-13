/**
 * R2 key and URL conventions for merchant menu item images.
 *
 * Folder structure (fast access, clear hierarchy, easy delete/list by prefix):
 *   merchant-menu/
 *     stores/{store_id}/
 *       items/{item_id}/
 *         images/
 *           {uuid}.{ext}
 *
 * - store_id and item_id allow listing/deleting all images for an item or store.
 * - UUID filename avoids collisions and keeps keys short; no timestamp in path.
 * - Database stores: image_url = permanent public URL, r2_key = full object key.
 *
 * Permanent URL format (non-expiring when using R2 public bucket + custom domain):
 *   {R2_PUBLIC_BASE_URL}/merchant-menu/stores/{store_id}/items/{item_id}/images/{uuid}.{ext}
 */

const PREFIX = "merchant-menu/stores";
const IMAGES_FOLDER = "images";

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

function normalizeExt(ext: string): string {
  const lower = ext.toLowerCase();
  if (lower === "jpeg") return "jpg";
  return ALLOWED_EXT.has(lower) ? lower : "jpg";
}

/**
 * Build the R2 object key for a new menu item image.
 * Use this before upload so the same key is used for upload and DB.
 */
export function buildMenuItemImageKey(
  storeId: number | string,
  itemId: number | string,
  fileId: string,
  ext: string
): string {
  const safeExt = normalizeExt(ext);
  const storePart = String(storeId);
  const itemPart = String(itemId);
  return `${PREFIX}/${storePart}/items/${itemPart}/${IMAGES_FOLDER}/${fileId}.${safeExt}`;
}

/**
 * Build permanent public URL for an object key.
 * Use R2_PUBLIC_BASE_URL (e.g. https://cdn.yourdomain.com) so the URL never expires.
 */
export function buildPublicUrl(publicBaseUrl: string, r2Key: string): string {
  const base = publicBaseUrl.replace(/\/$/, "");
  return `${base}/${r2Key}`;
}

/**
 * R2 key prefix for all images of one menu item (for list/delete by prefix if needed).
 */
export function itemImagesPrefix(storeId: number | string, itemId: number | string): string {
  const storePart = String(storeId);
  const itemPart = String(itemId);
  return `${PREFIX}/${storePart}/items/${itemPart}/${IMAGES_FOLDER}/`;
}

/**
 * R2 key prefix for all menu media of one store (for bulk operations if needed).
 */
export function storeMenuPrefix(storeId: number | string): string {
  return `${PREFIX}/${String(storeId)}/`;
}
