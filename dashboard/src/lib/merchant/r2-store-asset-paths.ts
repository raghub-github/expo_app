/**
 * R2 keys for store banner/gallery.
 *
 * Onboarding (AM child + partnersite register-store) uses the same layout:
 *   `{prefix}/{parentPk}/stores/{storePublicId}/onboarding/assets/{banner|gallery}/{file}`
 *
 * Post-onboarding mx/profile uses:
 *   `{prefix}/{parentPk}/stores/{storePublicId}/assets/{banners|gallery}/{file}`
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

/** Partnersite-aligned onboarding base: `.../stores/{GMMC}/onboarding/assets`. */
export function getStoreOnboardingAssetsBase(
  parentPk: number | string,
  storePublicId: string,
): string {
  const prefix = getR2MerchantObjectPrefix();
  const p = String(parentPk).trim();
  const code = String(storePublicId).trim();
  return `${prefix}/${p}/stores/${code}/onboarding/assets`;
}

/**
 * Post-onboarding profile media path (`assets/banners|gallery`).
 */
export function buildStoreProfileMediaR2Key(
  parentPk: number | string,
  storePublicId: string,
  type: "banner" | "gallery" | "banner_video",
  fileName: string
): string {
  const base = getStoreAssetsBase(parentPk, storePublicId);
  const folder = type === "banner" ? "banners" : type === "banner_video" ? "videos" : "gallery";
  const safe = String(fileName || "upload").replace(/^\/+/, "");
  return `${base}/${folder}/${safe}`;
}

/**
 * Same R2 folders partnersite uses during register-store Step 5:
 * `onboarding/assets/banner` | `onboarding/assets/gallery`.
 */
export function buildStoreOnboardingMediaR2Key(
  parentPk: number | string,
  storePublicId: string,
  type: "banner" | "gallery",
  fileName: string,
): string {
  const base = getStoreOnboardingAssetsBase(parentPk, storePublicId);
  const folder = type === "banner" ? "banner" : "gallery";
  const safe = String(fileName || "upload").replace(/^\/+/, "");
  return `${base}/${folder}/${safe}`;
}
