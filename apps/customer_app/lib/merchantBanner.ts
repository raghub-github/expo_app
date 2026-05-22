import type { MerchantSummary } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

/** Hero banner URI for cards — banner first, same order as GMRestaurantCardV2. */
export function resolveMerchantBannerUri(merchant: MerchantSummary): string | null {
  const raw =
    merchant.banner_url ??
    merchant.displayImage ??
    (merchant as MerchantSummary & { logo_url?: string | null }).logo_url ??
    null;
  return toAbsoluteImageUrl(raw) ?? (typeof raw === "string" && raw.trim() ? raw.trim() : null);
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
