/**
 * @gatimitra/map-tracking-engine
 *
 * Shared live-tracking primitives for Customer, Rider, and Merchant apps:
 * GPS filtering, geo math, route visibility, off-route / reroute thresholds,
 * marker animation timing, and map runtime selection (Expo Go vs native Mapbox).
 *
 * Rendering: Development builds and production must use the same native Mapbox
 * path (`@rnmapbox/maps`). Expo Go may use a lightweight fallback UI only.
 */

export * from "./geo";
export * from "./gps-filter";
export * from "./route-visibility";
export * from "./route-geometry";
export * from "./off-route";
export * from "./marker-animation";
export * from "./debug";
export * from "./map-runtime";
