/**
 * R2 keys for store banner/gallery — aligned with partnersite `getMerchantAssetsPath` + subfolder:
 *   `{prefix}/{parentPk}/stores/{storePublicId}/assets/banners|gallery/{fileName}`
 * See partnersite `src/lib/r2-paths.ts` (`getMerchantAssetsPath`, mx profile upload).
 */

const R2_DOCS_PREFIX = "docs";

export function getR2MerchantObjectPrefix(): string {
  const env = process.env.R2_MERCHANT_OBJECT_PREFIX?.trim();
  if (env && env.length > 0) return env.replace(/\/+$/, "");
  return `${R2_DOCS_PREFIX}/merchants`;
}

/** `.../stores/{storePublicId}/assets` (no trailing slash). */
export function getStoreAssetsBase(parentPk: number | string, storePublicId: string): string {
  const prefix = getR2MerchantObjectPrefix();
  const p = String(parentPk).trim();
  const code = String(storePublicId).trim();
  return `${prefix}/${p}/stores/${code}/assets`;
}

/**
 * Same layout as partnersite POST `/api/upload/r2` with parent =
 * `getMerchantAssetsPath(storeId, parentId)/banners` or `.../gallery`.
 */
export function buildStoreProfileMediaR2Key(
  parentPk: number | string,
  storePublicId: string,
  type: "banner" | "gallery",
  fileName: string
): string {
  const base = getStoreAssetsBase(parentPk, storePublicId);
  const folder = type === "banner" ? "banners" : "gallery";
  const safe = String(fileName || "upload").replace(/^\/+/, "");
  return `${base}/${folder}/${safe}`;
}
