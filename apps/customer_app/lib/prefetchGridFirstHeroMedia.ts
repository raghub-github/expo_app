import { Image } from "expo-image";
import type { GridFirstHeroMediaItem } from "@/lib/gridFirstHeroMedia";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

const prefetched = new Set<string>();

export function prefetchGridFirstHeroMedia(items: GridFirstHeroMediaItem[] | undefined | null) {
  if (!items?.length) return;
  for (const item of items) {
    if (item.kind !== "image") continue;
    const uri = toAbsoluteImageUrl(item.url);
    if (!uri || prefetched.has(uri)) continue;
    prefetched.add(uri);
    void Image.prefetch(uri, { cachePolicy: "disk" });
  }
}
