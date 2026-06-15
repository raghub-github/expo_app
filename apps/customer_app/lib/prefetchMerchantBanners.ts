import { Image } from "expo-image";
import type { MerchantSummary } from "@/services/merchant.service";
import { collectMerchantBannerUris } from "@/lib/merchantBanner";

const prefetched = new Set<string>();

export function prefetchMerchantBanners(merchants: MerchantSummary[]) {
  for (const m of merchants) {
    for (const uri of collectMerchantBannerUris(m)) {
      if (prefetched.has(uri)) continue;
      prefetched.add(uri);
      void Image.prefetch(uri);
    }
  }
}
