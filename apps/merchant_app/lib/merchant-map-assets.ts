import { appAssetAbsoluteUrl } from "@/components/AppAssetImage";
import { MX } from "@/lib/appAssetKeys";
import { getAppAssetProxyUrl, getAppAssetUrl } from "@/store/appAssetsStore";
import { resolveImageUrl } from "@/services/outletApi";
import { resolveUrlForDevice } from "@/config/env";

/**
 * Absolute URL for Super Admin asset `merchant.map.bike` (client key `map.bike`).
 * Native MapView Image markers need a device-reachable https URL.
 */
export function mapbikeMarkerUri(): string {
  const raw =
    getAppAssetUrl(MX.map.bike) ??
    getAppAssetProxyUrl(MX.map.bike) ??
    null;
  if (raw?.trim()) {
    return resolveImageUrl(raw) ?? resolveUrlForDevice(raw.trim());
  }
  return appAssetAbsoluteUrl(MX.map.bike)?.trim() || "";
}
