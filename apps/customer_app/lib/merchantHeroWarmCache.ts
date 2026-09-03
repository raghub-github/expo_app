import { Image } from "expo-image";
import type { MerchantSummary } from "@/services/merchant.service";
import { resolveMerchantCarouselBannerUri } from "@/lib/merchantBanner";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { markHeroMediaSessionReady } from "@/lib/prefetchGridFirstHeroMedia";

const uriByMerchantId = new Map<string, string>();
const prefetchedUris = new Set<string>();

export function normalizeHeroImageUri(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const abs = (toAbsoluteImageUrl(trimmed) ?? trimmed).trim();
  if (!abs) return null;
  // Truncated attachment-proxy URLs (query stripped by the router) cannot load.
  if (abs.includes("/v1/attachments/proxy") && !/[?&]key=/.test(abs)) return null;
  return abs;
}

export function prefetchMerchantHeroImageUri(uri: string | null | undefined): void {
  const abs = normalizeHeroImageUri(uri);
  if (!abs) return;
  if (prefetchedUris.has(abs)) {
    markHeroMediaSessionReady(abs);
    return;
  }
  prefetchedUris.add(abs);
  void Image.prefetch(abs, { cachePolicy: "memory-disk" })
    .then(() => markHeroMediaSessionReady(abs))
    .catch(() => {
      prefetchedUris.delete(abs);
    });
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

export function encodeMerchantBannerParam(uri: string): string {
  try {
    return encodeURIComponent(uri);
  } catch {
    return uri;
  }
}

export function decodeMerchantBannerParam(
  raw: string | string[] | null | undefined
): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const decoded = decodeURIComponent(trimmed);
    return normalizeHeroImageUri(decoded) ?? normalizeHeroImageUri(trimmed);
  } catch {
    return normalizeHeroImageUri(trimmed);
  }
}

export function buildMerchantDetailParams(
  merchantId: string,
  merchant?: MerchantSummary | null
): { id: string; banner?: string } {
  const banner =
    (merchant ? resolveMerchantCarouselBannerUri(merchant) : null) ??
    getWarmMerchantHeroUri(merchantId);
  if (banner) warmMerchantHeroImage(merchantId, banner);
  // Encode so `?key=` / `&` on attachment-proxy URLs survive expo-router params.
  return banner
    ? { id: merchantId, banner: encodeMerchantBannerParam(banner) }
    : { id: merchantId };
}

export function resolveInstantMerchantHeroUri(
  merchantId: string,
  routeBanner: string | string[] | null | undefined,
  fallbackBanner: string | null | undefined
): string | null {
  // Prefer the URI already shown on the list card — route params can strip `?key=`.
  return (
    getWarmMerchantHeroUri(merchantId) ??
    decodeMerchantBannerParam(routeBanner) ??
    normalizeHeroImageUri(fallbackBanner)
  );
}
