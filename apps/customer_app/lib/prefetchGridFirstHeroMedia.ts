import { Image } from "expo-image";
import type { GridFirstHeroMediaItem } from "@/lib/gridFirstHeroMedia";
import type { HomeBannerOffer } from "@/services/offers.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

const prefetched = new Set<string>();
/** URLs that successfully decoded in this app session — never re-hide as skeleton. */
const sessionReady = new Set<string>();

function absoluteUri(uri: string | null | undefined): string | null {
  const trimmed = uri?.trim();
  if (!trimmed) return null;
  return toAbsoluteImageUrl(trimmed) ?? trimmed;
}

/** Warm a single food-home visual into memory + disk before first paint. */
export function prefetchFoodHomeImageUri(uri: string | null | undefined): void {
  const absolute = absoluteUri(uri);
  if (!absolute) return;
  if (prefetched.has(absolute)) return;
  prefetched.add(absolute);
  void Image.prefetch(absolute, { cachePolicy: "memory-disk" });
}

export function markHeroMediaSessionReady(uri: string | null | undefined): void {
  const absolute = absoluteUri(uri);
  if (!absolute) return;
  sessionReady.add(absolute);
}

export function isHeroMediaSessionReady(uri: string | null | undefined): boolean {
  const absolute = absoluteUri(uri);
  if (!absolute) return false;
  return sessionReady.has(absolute);
}

export function prefetchGridFirstHeroMedia(items: GridFirstHeroMediaItem[] | undefined | null) {
  if (!items?.length) return;
  for (const item of items) {
    if (item.kind !== "image") continue;
    prefetchFoodHomeImageUri(item.url);
  }
}

/** Merchant offer art used when admin hero media is empty. */
export function prefetchFeaturedOfferHeroImages(offers: HomeBannerOffer[] | undefined | null) {
  if (!offers?.length) return;
  for (const offer of offers) {
    if (offer.kind !== "merchant") continue;
    for (const u of offer.item_image_urls ?? []) prefetchFoodHomeImageUri(u);
    prefetchFoodHomeImageUri(offer.item_image_url);
    prefetchFoodHomeImageUri(offer.offer_image_url);
  }
}
