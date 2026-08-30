/**
 * GatiMitra live-navigation visuals — shared by Rider App and Customer App.
 * Mint-green route + circular live-location dot.
 */

export const NAV_ROUTE_BLUE = "#14b8a6";
export const NAV_ALT_ROUTE_BLUE = "#5eead4";
export const NAV_ROUTE_CASING = "#ffffff";
export const NAV_ROUTE_TRAVELED = "rgba(154, 160, 166, 0.45)";
/** Dashed line rider → route when off-path. */
export const NAV_OFF_ROUTE_CONNECTOR = "#64748B";
export const NAV_WRONG_WAY_ORANGE = "#EA580C";
export const NAV_ROUTE_WIDTH = 6;
export const NAV_ROUTE_GLOW = "rgba(20, 184, 166, 0.22)";
export const NAV_ROUTE_GLOW_WIDTH = 12;
export const NAV_ROUTE_CASING_WIDTH = 9;
export const NAV_ALT_ROUTE_WIDTH = 4.5;
export const NAV_TRAVELED_WIDTH = 5;
export const NAV_CONNECTOR_WIDTH = 2.5;
export const NAV_CONNECTOR_OPACITY = 0.55;
export const NAV_JOIN_DOT_COLOR = "#94a3b8";
/** Lower pitch keeps roads/labels visible while still feeling like navigation. */
export const NAV_FOLLOW_PITCH = 38;
export const NAV_FOLLOW_ZOOM = 16.2;
export const NAV_LOOK_AHEAD_M = 60;

export const NAV_RIDER_DOT_SIZE = 18;
export const NAV_RIDER_DOT_HALO_SIZE = 22;
export const NAV_RIDER_DOT_FILL = NAV_ROUTE_BLUE;
export const NAV_RIDER_DOT_HALO = NAV_ROUTE_GLOW;
export const NAV_RIDER_DOT_BORDER = "#ffffff";

/** HTML for Mapbox GL JS live-location marker (matches native NavRiderDotMarker). */
export function liveRiderDotMarkerHtml(): string {
  const halo = NAV_RIDER_DOT_HALO_SIZE;
  const dot = NAV_RIDER_DOT_SIZE;
  return (
    '<div style="width:' +
    halo +
    "px;height:" +
    halo +
    'px;display:flex;align-items:center;justify-content:center;pointer-events:none;position:relative;">' +
    '<div style="position:absolute;width:' +
    halo +
    "px;height:" +
    halo +
    "px;border-radius:" +
    halo / 2 +
    "px;background:" +
    NAV_RIDER_DOT_HALO +
    ';"></div>' +
    '<div style="width:' +
    dot +
    "px;height:" +
    dot +
    "px;border-radius:" +
    dot / 2 +
    "px;background:" +
    NAV_RIDER_DOT_FILL +
    ";border:3px solid " +
    NAV_RIDER_DOT_BORDER +
    ';box-shadow:0 1px 3px rgba(20,184,166,0.35);"></div>' +
    "</div>"
  );
}
