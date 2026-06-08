import { Image } from "react-native";

/** GatiMitra mint-green bike marker asset (shared with customer app). */
export const MAPBIKE_IMAGE = require("../../assets/images/mapbike.png");

export function mapbikeAssetUri(): string {
  return Image.resolveAssetSource(MAPBIKE_IMAGE).uri;
}

/**
 * Label-rich basemap for rider home (settlements, roads, POIs).
 * Mapbox Standard hides place/POI/road labels unless `config.basemap` toggles are set —
 * streets-v12 shows them by default (Uber/Rapido-like).
 */
export const MAPBOX_HOME_STYLE = "mapbox://styles/mapbox/streets-v12";

/** Native navigation — driving-focused turn-by-turn styling. */
export const MAPBOX_NAV_STYLE = "mapbox://styles/mapbox/navigation-day-v1";

/** Detailed street map (labels, buildings, POIs) — navigation street mode. */
export const MAPBOX_STREET_STYLE = "mapbox://styles/mapbox/streets-v12";

export type NavMapViewMode = "navigation" | "street";

export function mapStyleForNavViewMode(mode: NavMapViewMode): string {
  // Reference UI uses a light labelled street map (Google Maps–like).
  return MAPBOX_STREET_STYLE;
}

/** ~14–16 shows village/town labels in rural India without excessive zoom. */
export const HOME_MAP_ZOOM = 15.2;

export const NAV_MAP_ZOOM = 15;
