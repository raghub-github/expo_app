import { Image } from "expo-image";
import type { MerchantSummary } from "@/services/merchant.service";
import { resolveMerchantCarouselBannerUri } from "@/lib/merchantBanner";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

const uriByMerchantId = new Map<string, string>();
const prefetchedUris = new Set<string>();

export function normalizeHeroImageUri(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return (toAbsoluteImageUrl(trimmed) ?? trimmed).trim();
}

export function prefetchMerchantHeroImageUri(uri: string | null | undefined): void {
  const abs = normalizeHeroImageUri(uri);
  if (!abs || prefetchedUris.has(abs)) return;
  prefetchedUris.add(abs);
  void Image.prefetch(abs);
}

/** Remember banner URI from list cards so detail page can render on frame 1. */
export function warmMerchantHeroImage(
  merchantId: string,
  uri: string | null | undefined
): void {
  if (!merchantId) return;
  const abs = normalizeHeroImageUri(uri);
  if (!abs) return;
  uriByMerchantId.set(merchantId, abs);
  prefetchMerchantHeroImageUri(abs);
}

export function getWarmMerchantHeroUri(merchantId: string): string | null {
  if (!merchantId) return null;
  return uriByMerchantId.get(merchantId) ?? null;
}

export function buildMerchantDetailParams(
  merchantId: string,
  merchant?: MerchantSummary | null
): { id: string; banner?: string } {
  const banner =
    (merchant ? resolveMerchantCarouselBannerUri(merchant) : null) ??
    getWarmMerchantHeroUri(merchantId);
  if (banner) warmMerchantHeroImage(merchantId, banner);
  return banner ? { id: merchantId, banner } : { id: merchantId };
}

export function resolveInstantMerchantHeroUri(
  merchantId: string,
  routeBanner: string | null | undefined,
  fallbackBanner: string | null | undefined
): string | null {
  return (
    normalizeHeroImageUri(routeBanner) ??
    getWarmMerchantHeroUri(merchantId) ??
    normalizeHeroImageUri(fallbackBanner)
  );
}
