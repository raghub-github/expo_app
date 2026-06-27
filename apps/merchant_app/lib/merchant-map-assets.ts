import { appAssetAbsoluteUrl } from "@/components/AppAssetImage";
import { MX } from "@/lib/appAssetKeys";

export function mapbikeMarkerUri(): string {
  return appAssetAbsoluteUrl(MX.map.bike) ?? "";
}
