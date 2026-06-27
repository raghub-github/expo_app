import { useEffect, useState } from "react";
import { resolveNearbyRiderMarkerImage } from "@/features/ride/rideOptionAssets";
import { resolveMapImageDataUri } from "@/lib/map-webview-image-uri";
import { useAppAssetsStore } from "@/store/appAssetsStore";

/** Mapbox WebView marker icon — re-resolves when CMS app assets finish loading. */
export function useMapMarkerDataUri(imageKey: string): string | null {
  const assetsLoaded = useAppAssetsStore((s) => s.loaded);
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const source = resolveNearbyRiderMarkerImage(imageKey);
    if (!source) {
      setUri(null);
      return;
    }

    void resolveMapImageDataUri(source)
      .then((next) => {
        if (!cancelled) setUri(next);
      })
      .catch(() => {
        if (!cancelled) setUri(null);
      });

    return () => {
      cancelled = true;
    };
  }, [imageKey, assetsLoaded]);

  return uri;
}
