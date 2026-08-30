import type { ImageSourcePropType } from "react-native";
import { appAssetSource } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";

const RIDE_ASSET_BY_KEY: Record<string, string> = {
  bike: CX.ride.bike,
  "bike-lite": CX.ride.bike,
  auto: CX.ride.auto,
  ev_auto: CX.ride.evAuto,
  cab: CX.ride.cab,
  cab_premium: CX.ride.cabPremium,
  travel: CX.ride.travel,
};

const MAP_ASSET_BY_KEY: Record<string, string> = {
  bike: CX.ride.mapBike,
  auto: CX.ride.mapAuto,
  cab: CX.ride.mapCab,
  cab_premium: CX.ride.mapCab,
  travel: CX.ride.mapTravel,
};

/** Bundled fallbacks when CMS map markers are not loaded yet. */
const BUNDLED_MAP_MARKER_BY_KEY: Record<string, ImageSourcePropType> = {
  bike: require("../../public/img/mapbike.png"),
  auto: require("../../public/img/mapauto.png"),
  cab: require("../../public/img/mapcab.png"),
  cab_premium: require("../../public/img/mapcab.png"),
  travel: require("../../public/img/map/travel.png"),
};

/** Bundled fallbacks for Book a Ride service tiles (instant paint before CMS). */
const BUNDLED_SERVICE_BY_ASSET_KEY: Record<string, ImageSourcePropType> = {
  [CX.ride.bike]: BUNDLED_MAP_MARKER_BY_KEY.bike!,
  [CX.ride.auto]: BUNDLED_MAP_MARKER_BY_KEY.auto!,
  [CX.ride.cab]: BUNDLED_MAP_MARKER_BY_KEY.cab!,
  [CX.ride.cabPremium]: BUNDLED_MAP_MARKER_BY_KEY.cab_premium!,
  [CX.ride.evAuto]: BUNDLED_MAP_MARKER_BY_KEY.auto!,
  [CX.ride.travel]: BUNDLED_MAP_MARKER_BY_KEY.auto!,
};

/** CMS URL for All Services / Intercity tiles. */
export function resolveRideServiceIcon(assetKey: string): ImageSourcePropType | null {
  return appAssetSource(assetKey);
}

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

function sourceForMap(
  imageKey: string,
  assetKey: string,
  fallbackAssetKey: string
): ImageSourcePropType | null {
  const cms =
    appAssetSource(assetKey) ??
    appAssetSource(fallbackAssetKey) ??
    appAssetSource(MAP_ASSET_BY_KEY.bike);
  if (cms) return cms;
  return BUNDLED_MAP_MARKER_BY_KEY[imageKey] ?? BUNDLED_MAP_MARKER_BY_KEY.bike ?? null;
}

export function resolveRideImage(imageKey: string): ImageSourcePropType | null {
  const assetKey = RIDE_ASSET_BY_KEY[imageKey] ?? RIDE_ASSET_BY_KEY.bike;
  return (
    appAssetSource(assetKey) ??
    appAssetSource(RIDE_ASSET_BY_KEY.bike) ??
    BUNDLED_SERVICE_BY_ASSET_KEY[assetKey!] ??
    BUNDLED_MAP_MARKER_BY_KEY[imageKey] ??
    BUNDLED_MAP_MARKER_BY_KEY.bike ??
    null
  );
}

export function resolveNearbyRiderMarkerImage(imageKey: string): ImageSourcePropType | null {
  const key = imageKey in MAP_ASSET_BY_KEY ? imageKey : "bike";
  const assetKey = MAP_ASSET_BY_KEY[key] ?? MAP_ASSET_BY_KEY.bike;
  return sourceForMap(key, assetKey, MAP_ASSET_BY_KEY.bike);
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
  if (id === "auto" || id === "ev_auto") return "auto";
  if (id === "cab-economy") return "cab";
  if (id === "cab-premium") return "cab_premium";
  return "bike";
}

/** Map icon from rider vehicle type (bike / auto / cab / …). */
export function resolveRiderVehicleMarkerImage(vehicleType: string): ImageSourcePropType | null {
  const key = VEHICLE_TYPE_TO_IMAGE_KEY[vehicleType.trim().toLowerCase()] ?? "bike";
  return resolveNearbyRiderMarkerImage(key);
}

export function resolveRideMapMarkerUri(imageKey: string): string {
  const src = resolveNearbyRiderMarkerImage(imageKey);
  if (src && typeof src === "object" && "uri" in src && typeof src.uri === "string") {
    return src.uri;
  }
  return "";
}
