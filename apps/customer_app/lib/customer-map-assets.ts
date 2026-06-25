import { Image } from "react-native";

export const MAPBOX_GL_VERSION = "3.8.0";
export const MAPBOX_RIDE_STYLE = "mapbox://styles/mapbox/streets-v12";

/** Rapido-style route stroke on tracking maps (Gatimitra green). */
export const ROUTE_LINE_COLOR = "#22C55E";
export const ROUTE_CASING_COLOR = "#FFFFFF";
/** Ride-book map route — thinner blue stroke (Rapido-style). */
export const ROUTE_BOOK_LINE_COLOR = "#2563EB";
export const ROUTE_BOOK_CASING_COLOR = "#FFFFFF";
export const ROUTE_PICKUP_COLOR = "#22C55E";
export const ROUTE_DROP_COLOR = "#EF4444";

/** Shared map markers — source of truth under public/img/ */
export const MAPBIKE_IMAGE = require("../public/img/mapbike.png");
export const MAPAUTO_IMAGE = require("../public/img/mapauto.png");
export const MAPCAB_IMAGE = require("../public/img/mapcab.png");

export function mapbikeMarkerUri(): string {
  return Image.resolveAssetSource(MAPBIKE_IMAGE).uri;
}
