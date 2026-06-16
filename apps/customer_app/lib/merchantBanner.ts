import type { MerchantSummary } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

/** Hero banner for carousel — banner_url / displayImage only (not gallery fallback). */
export function resolveMerchantCarouselBannerUri(merchant: MerchantSummary): string | null {
  const candidates = [merchant.banner_url, merchant.displayImage];
  for (const raw of candidates) {
    const abs = toAbsoluteImageUrl(raw) ?? (typeof raw === "string" ? raw.trim() : "");
    if (abs) return abs;
  }
  return null;
}

/** Gallery URIs for carousel — excludes hero banner duplicate. */
export function resolveMerchantCarouselGalleryUris(merchant: MerchantSummary): string[] {
  const hero = resolveMerchantCarouselBannerUri(merchant);
  const raw = merchant.galleryImages ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of raw) {
    const abs = toAbsoluteImageUrl(u) ?? (typeof u === "string" ? u.trim() : "");
    if (!abs || seen.has(abs) || abs === hero) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

/** Hero banner URI — banner → displayImage → gallery[0] → logo. */
export function resolveMerchantBannerUri(merchant: MerchantSummary): string | null {
  const candidates = [
    merchant.banner_url,
    merchant.displayImage,
    merchant.galleryImages?.[0],
    (merchant as MerchantSummary & { logo_url?: string | null }).logo_url,
  ];
  for (const raw of candidates) {
    const abs = toAbsoluteImageUrl(raw) ?? (typeof raw === "string" ? raw.trim() : "");
    if (abs) return abs;
  }
  return null;
}

export function resolveMerchantGalleryUris(merchant: MerchantSummary): string[] {
  const banner = resolveMerchantBannerUri(merchant);
  const raw = merchant.galleryImages ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of raw) {
    const abs = toAbsoluteImageUrl(u) ?? (typeof u === "string" ? u.trim() : "");
    if (!abs || seen.has(abs) || abs === banner) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

/** Warm CDN cache for list/grid cards before they mount. */
export function collectMerchantBannerUris(merchant: MerchantSummary): string[] {
  const banner = resolveMerchantBannerUri(merchant);
  const gallery = resolveMerchantGalleryUris(merchant);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [banner, ...gallery]) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}
