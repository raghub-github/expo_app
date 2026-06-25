import type { ImageSourcePropType } from "react-native";
import { MAPAUTO_IMAGE, MAPBIKE_IMAGE, MAPCAB_IMAGE } from "@/lib/customer-map-assets";

/** List / sheet assets keyed by catalog image_key from backend. */
const RIDE_IMAGE_BY_KEY: Record<string, ImageSourcePropType> = {
  bike: require("../../public/img/bike.png"),
  auto: require("../../public/img/auto.png"),
  cab: require("../../public/img/ride1.png"),
  cab_premium: require("../../public/img/cabpremium.png"),
  travel: require("../../public/img/travel.png"),
};

/** Map marker PNGs on ride-booking maps (bike / auto / cab). */
const MAP_MARKER_IMAGE_BY_KEY: Record<string, ImageSourcePropType> = {
  bike: MAPBIKE_IMAGE,
  auto: MAPAUTO_IMAGE,
  cab: MAPCAB_IMAGE,
  cab_premium: MAPCAB_IMAGE,
  travel: require("../../public/img/map/travel.png"),
};

/** Rider DB vehicle_type → catalog image_key for map marker. */
const VEHICLE_TYPE_TO_IMAGE_KEY: Record<string, string> = {
  bike: "bike",
  ev_bike: "bike",
  cycle: "bike",
  auto: "auto",
  cng_auto: "auto",
  ev_auto: "auto",
  e_rickshaw: "auto",
  car: "cab",
  taxi: "cab",
  ev_car: "cab",
};

export function resolveRideImage(imageKey: string): ImageSourcePropType {
  return RIDE_IMAGE_BY_KEY[imageKey] ?? RIDE_IMAGE_BY_KEY.bike;
}

export function resolveNearbyRiderMarkerImage(imageKey: string): ImageSourcePropType {
  return MAP_MARKER_IMAGE_BY_KEY[imageKey] ?? MAP_MARKER_IMAGE_BY_KEY.bike;
}

/** Map marker for selected ride option (bike / auto / cab / cab_premium). */
export function resolveSelectedRideMapMarkerImageKey(
  rideId: string | null | undefined,
  imageKey?: string | null
): string {
  const fromCatalog = imageKey?.trim();
  if (fromCatalog) return fromCatalog;
  const id = (rideId ?? "").trim().toLowerCase();
  if (id === "bike" || id === "bike-lite") return "bike";
  if (id === "auto") return "auto";
  if (id === "cab-economy") return "cab";
  if (id === "cab-premium") return "cab_premium";
  return "bike";
}

/** Map icon from rider vehicle type (bike / auto / cab / …). */
export function resolveRiderVehicleMarkerImage(vehicleType: string): ImageSourcePropType {
  const key = VEHICLE_TYPE_TO_IMAGE_KEY[vehicleType.trim().toLowerCase()] ?? "bike";
  return resolveNearbyRiderMarkerImage(key);
}
