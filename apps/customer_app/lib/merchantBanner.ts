import type { MerchantSummary } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

function normalizeUri(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return toAbsoluteImageUrl(trimmed) ?? trimmed;
}

function uniqueUris(raw: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of raw) {
    const abs = normalizeUri(u);
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

/** Any usable list-card media URI (banner / gallery / logo), excluding empty. */
function resolveAnyMerchantMediaUri(merchant: MerchantSummary): string | null {
  const m = merchant as MerchantSummary & {
    logo_url?: string | null;
    imageUrl?: string | null;
    bannerUrl?: string | null;
  };
  return uniqueUris([
    m.banner_url,
    m.bannerUrl,
    m.displayImage,
    m.imageUrl,
    m.logo_url,
    ...(m.galleryImages ?? []),
  ])[0] ?? null;
}

/** Gallery URIs for carousel — every backend gallery URL except the banner duplicate. */
export function resolveMerchantGalleryUris(merchant: MerchantSummary): string[] {
  const banner = resolveMerchantBannerUri(merchant);
  return uniqueUris(merchant.galleryImages ?? []).filter((u) => u !== banner);
}

export function resolveMerchantCarouselBannerUri(merchant: MerchantSummary): string | null {
  return resolveMerchantBannerUri(merchant);
}

export function resolveMerchantCarouselGalleryUris(merchant: MerchantSummary): string[] {
  return resolveMerchantGalleryUris(merchant);
}

/** Hero banner URI — first available backend media so list cards never blank. */
export function resolveMerchantBannerUri(merchant: MerchantSummary): string | null {
  return resolveAnyMerchantMediaUri(merchant);
}

/** Warm CDN cache for list/grid cards before they mount. */
export function collectMerchantBannerUris(merchant: MerchantSummary): string[] {
  const banner = resolveMerchantBannerUri(merchant);
  const gallery = resolveMerchantGalleryUris(merchant);
  return uniqueUris([banner, ...gallery]);
}
