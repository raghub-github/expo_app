import { Image } from "react-native";

export const MAPBOX_GL_VERSION = "3.8.0";
export const MAPBOX_RIDE_STYLE = "mapbox://styles/mapbox/streets-v12";

/** Rapido-style route stroke on book / tracking maps (Gatimitra green). */
export const ROUTE_LINE_COLOR = "#22C55E";
export const ROUTE_CASING_COLOR = "#FFFFFF";
export const ROUTE_PICKUP_COLOR = "#22C55E";
export const ROUTE_DROP_COLOR = "#EF4444";

/** Shared map bike marker — source of truth: public/img/mapbike.png */
export const MAPBIKE_IMAGE = require("../public/img/mapbike.png");

export function mapbikeMarkerUri(): string {
  return Image.resolveAssetSource(MAPBIKE_IMAGE).uri;
}
