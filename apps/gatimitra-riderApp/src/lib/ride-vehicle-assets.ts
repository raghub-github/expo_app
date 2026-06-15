import type { ImageSourcePropType } from "react-native";

const RIDE_IMAGE_BY_KEY: Record<string, ImageSourcePropType> = {
  bike: require("../../assets/images/ride/bike.png"),
  auto: require("../../assets/images/ride/auto.png"),
  cab: require("../../assets/images/ride/ride1.png"),
  cab_premium: require("../../assets/images/ride/cabpremium.png"),
  travel: require("../../assets/images/ride/travel.png"),
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
  return RIDE_IMAGE_BY_KEY[key] ?? RIDE_IMAGE_BY_KEY.bike;
}
