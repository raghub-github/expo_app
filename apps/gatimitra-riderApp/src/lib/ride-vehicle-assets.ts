import type { ImageSourcePropType } from "react-native";
import { appAssetSource } from "@/src/components/AppAssetImage";
import { RX } from "@/src/lib/appAssetKeys";

const RIDE_ASSET_BY_KEY: Record<string, string> = {
  bike: RX.ride.bike,
  auto: RX.ride.auto,
  cab: RX.ride.cab,
  cab_premium: RX.ride.cabPremium,
  travel: RX.ride.travel,
};

const RIDE_TYPE_TO_IMAGE_KEY: Record<string, string> = {
  bike: "bike",
  "bike-lite": "bike",
  auto: "auto",
  "cab-economy": "cab",
  "cab-premium": "cab_premium",
  travel: "travel",
};

export function resolveRideCatalogImageKey(rideType: string | null | undefined): string {
  const raw = (rideType ?? "").trim().toLowerCase();
  return RIDE_TYPE_TO_IMAGE_KEY[raw] ?? "bike";
}

export function resolveRideVehicleImage(rideType: string | null | undefined): ImageSourcePropType {
  const key = resolveRideCatalogImageKey(rideType);
  const assetKey = RIDE_ASSET_BY_KEY[key] ?? RIDE_ASSET_BY_KEY.bike;
  return appAssetSource(assetKey) ?? appAssetSource(RX.ride.bike) ?? { uri: "" };
}
