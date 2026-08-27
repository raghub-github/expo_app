import { CX } from "@/lib/appAssetKeys";
import { getAppAssetUrl } from "@/store/appAssetsStore";

/** CMS slots for the Book a Ride offer carousel (max 6). */
export const RIDE_HOME_BANNER_KEYS = [
  CX.ride.banner,
  CX.ride.banner2,
  CX.ride.banner3,
  CX.ride.banner4,
  CX.ride.banner5,
  CX.ride.banner6,
] as const;

/** Uploaded slots in order. One image → reused on every offer. */
export function filledRideHomeBannerKeys(
  getUrl: (key: string) => string | null = getAppAssetUrl
): string[] {
  const filled = RIDE_HOME_BANNER_KEYS.filter((key) => Boolean(getUrl(key)));
  return filled.length > 0 ? [...filled] : [CX.ride.banner];
}

/** 1 image: all offers. 2+: round-robin across offers. */
export function rideHomeBannerKeyForIndex(index: number, keys: readonly string[]): string {
  if (keys.length <= 1) return keys[0] ?? CX.ride.banner;
  return keys[index % keys.length] ?? CX.ride.banner;
}
