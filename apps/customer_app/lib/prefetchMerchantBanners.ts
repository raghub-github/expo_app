import type { MerchantSummary } from "@/services/merchant.service";
import { collectMerchantBannerUris } from "@/lib/merchantBanner";
import { enqueueImagePrefetch } from "@/lib/prefetchQueue";

/**
 * Only the first screenful or two of cards is worth warming — everything below
 * is paid for on scroll, by which time the queue has drained. This previously
 * fanned out every banner of every merchant in the response (50 merchants x 3-5
 * banners) as simultaneous downloads, spiking both the image memory cache and
 * the connection right as the home screen was trying to paint.
 */
const MAX_MERCHANTS = 8;
const MAX_URIS = 16;

export function prefetchMerchantBanners(merchants: MerchantSummary[]) {
  const uris: string[] = [];
  for (const m of merchants.slice(0, MAX_MERCHANTS)) {
    uris.push(...collectMerchantBannerUris(m));
  }
  enqueueImagePrefetch(uris, MAX_URIS);
}
