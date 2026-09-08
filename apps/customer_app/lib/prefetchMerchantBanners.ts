import type { MerchantSummary } from "@/services/merchant.service";
import { enqueueImagePrefetch } from "@/lib/prefetchQueue";
import { prefetchMerchantPrimaryBanners } from "@/lib/imageEngine";
import { resolveMerchantGalleryUris, resolveMerchantBannerUri } from "@/lib/merchantBanner";
import { warmMerchantHeroImage, prefetchMerchantHeroImageUri } from "@/lib/merchantHeroWarmCache";
import { readSyncMerchantsList } from "@/lib/merchantsListCache";
import { useLocationStore } from "@/store/locationStore";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";

/**
 * Banner-first warm for list screens.
 * Primary banners go through the high-priority image engine; gallery queues later.
 */
const MAX_GALLERY_MERCHANTS = 12;
const MAX_GALLERY_URIS = 24;

export function prefetchMerchantBanners(merchants: MerchantSummary[]) {
  for (const m of merchants.slice(0, 16)) {
    const banner = resolveMerchantBannerUri(m);
    if (banner) warmMerchantHeroImage(m.id, banner);
  }
  prefetchMerchantPrimaryBanners(merchants, { limit: 24 });

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

/** Jump visible store banners to the front — Food tap / food-home mount. */
export function prioritizeVisibleMerchantBanners(limit = 12): void {
  const coords = useLocationStore.getState().coords;
  if (coords?.latitude == null || coords?.longitude == null) return;
  const vegOnly = useDietaryPreferenceStore.getState().vegOnly;
  const list =
    readSyncMerchantsList(coords.latitude, coords.longitude, vegOnly) ??
    readSyncMerchantsList(coords.latitude, coords.longitude, false);
  if (!list?.length) return;
  // Immediate Image.prefetch (not queue) so first paint hits memory-disk.
  for (const m of list.slice(0, limit)) {
    const banner = resolveMerchantBannerUri(m);
    if (!banner) continue;
    warmMerchantHeroImage(m.id, banner);
    prefetchMerchantHeroImageUri(banner);
  }
}
