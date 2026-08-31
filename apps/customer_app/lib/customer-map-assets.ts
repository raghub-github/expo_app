import { appAssetAbsoluteUrl } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
import { NAV_ROUTE_BLUE, NAV_ROUTE_CASING } from "@gatimitra/map-tracking-engine";

export const MAPBOX_GL_VERSION = "3.8.0";
export const MAPBOX_RIDE_STYLE = "mapbox://styles/mapbox/streets-v12";

/** Live-tracking route stroke — same mint as Rider App. */
export const ROUTE_LINE_COLOR = NAV_ROUTE_BLUE;
export const ROUTE_CASING_COLOR = NAV_ROUTE_CASING;
/** Ride-book map route — thinner blue stroke (Rapido-style). */
export const ROUTE_BOOK_LINE_COLOR = "#2563EB";
export const ROUTE_BOOK_CASING_COLOR = "#FFFFFF";
export const ROUTE_PICKUP_COLOR = "#22C55E";
export const ROUTE_DROP_COLOR = "#EF4444";

export function mapbikeMarkerUri(): string {
  return appAssetAbsoluteUrl(CX.ride.mapBike) ?? "";
}

export function mapautoMarkerUri(): string {
  return appAssetAbsoluteUrl(CX.ride.mapAuto) ?? "";
}

export function mapcabMarkerUri(): string {
  return appAssetAbsoluteUrl(CX.ride.mapCab) ?? "";
}

export function maptravelMarkerUri(): string {
  return appAssetAbsoluteUrl(CX.ride.mapTravel) ?? "";
}
