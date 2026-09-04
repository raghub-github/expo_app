import type { MerchantSummary } from "@/services/merchant.service";
import { enqueueImagePrefetch } from "@/lib/prefetchQueue";
import { prefetchMerchantPrimaryBanners } from "@/lib/imageEngine";
import { resolveMerchantGalleryUris } from "@/lib/merchantBanner";

/**
 * Banner-first warm for list screens.
 * Primary banners go through the high-priority image engine; gallery queues later.
 */
const MAX_GALLERY_MERCHANTS = 12;
const MAX_GALLERY_URIS = 24;

export function prefetchMerchantBanners(merchants: MerchantSummary[]) {
  prefetchMerchantPrimaryBanners(merchants, { limit: 60 });

  const gallery: string[] = [];
  for (const m of merchants.slice(0, MAX_GALLERY_MERCHANTS)) {
    gallery.push(...resolveMerchantGalleryUris(m));
  }
  if (gallery.length === 0) return;
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      setTimeout(() => enqueueImagePrefetch(gallery, MAX_GALLERY_URIS), 400);
    });
  } else {
    setTimeout(() => enqueueImagePrefetch(gallery, MAX_GALLERY_URIS), 400);
  }
}
