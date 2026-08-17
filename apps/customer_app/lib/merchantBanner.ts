import type { MerchantSummary } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import {
  isFoodHeroImageUrl,
  resolveMerchantFoodHeroPrimaryUri,
  resolveMerchantFoodHeroUris,
} from "@/lib/merchantHeroMedia";

/** Hero banner for carousel — food photos only (skips parent logos / placeholders). */
export function resolveMerchantCarouselBannerUri(merchant: MerchantSummary): string | null {
  return resolveMerchantFoodHeroPrimaryUri(merchant);
}

/** Gallery URIs for carousel — food photos only, excludes hero duplicate. */
export function resolveMerchantCarouselGalleryUris(merchant: MerchantSummary): string[] {
  const hero = resolveMerchantCarouselBannerUri(merchant);
  return resolveMerchantFoodHeroUris(merchant).filter((u) => u !== hero);
}

/** Hero banner URI — food photo → gallery → logo fallback for detail screens. */
export function resolveMerchantBannerUri(merchant: MerchantSummary): string | null {
  const food = resolveMerchantFoodHeroPrimaryUri(merchant);
  if (food) return food;
  const logo = (merchant as MerchantSummary & { logo_url?: string | null }).logo_url;
  const candidates = [logo];
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
    if (!isFoodHeroImageUrl(abs) && abs !== banner) continue;
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
