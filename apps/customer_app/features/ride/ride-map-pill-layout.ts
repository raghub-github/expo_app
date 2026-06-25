import { Dimensions } from "react-native";

export const RIDE_MAP_PILL_WIDTH = 148;
export const RIDE_MAP_PILL_HEIGHT = 36;
/** @deprecated Use RIDE_MAP_PIN_WIDTH — kept for overlap math width. */
export const RIDE_MAP_DOT_SIZE = 34;
export const RIDE_MAP_PIN_WIDTH = 34;
export const RIDE_MAP_PIN_HEIGHT = 42;
export const RIDE_MAP_STEM_HEIGHT = 6;
export const RIDE_MAP_STACK_HEIGHT =
  RIDE_MAP_PILL_HEIGHT + RIDE_MAP_STEM_HEIGHT + RIDE_MAP_PIN_HEIGHT;

const PILL_GAP = 10;

export type ScreenPoint = { x: number; y: number };
export type MapSize = { width: number; height: number };

export type InwardBias = "left" | "right" | "none";

export type MarkerOverlayLayout = {
  pillLeft: number;
  pillTop: number;
  dotLeft: number;
  dotTop: number;
};

function layoutMarkerOverlayAtPin(pin: ScreenPoint, bias: InwardBias): MarkerOverlayLayout {
  const dotLeft = pin.x - RIDE_MAP_PIN_WIDTH / 2;
  const dotTop = pin.y - RIDE_MAP_PIN_HEIGHT;
  let pillLeft = pin.x - RIDE_MAP_PILL_WIDTH / 2;
  if (bias === "left") pillLeft += 10;
  if (bias === "right") pillLeft -= 10;
  const pillTop =
    pin.y - RIDE_MAP_PIN_HEIGHT - RIDE_MAP_STEM_HEIGHT - RIDE_MAP_PILL_HEIGHT;

  return { pillLeft, pillTop, dotLeft, dotTop };
}

function stacksOverlap(a: MarkerOverlayLayout, b: MarkerOverlayLayout): boolean {
  const aRight = Math.max(a.pillLeft + RIDE_MAP_PILL_WIDTH, a.dotLeft + RIDE_MAP_PIN_WIDTH);
  const aBottom = Math.max(a.pillTop + RIDE_MAP_STACK_HEIGHT, a.dotTop + RIDE_MAP_PIN_HEIGHT);
  const bRight = Math.max(b.pillLeft + RIDE_MAP_PILL_WIDTH, b.dotLeft + RIDE_MAP_PIN_WIDTH);
  const bBottom = Math.max(b.pillTop + RIDE_MAP_STACK_HEIGHT, b.dotTop + RIDE_MAP_PIN_HEIGHT);

  const aLeft = Math.min(a.pillLeft, a.dotLeft);
  const aTop = Math.min(a.pillTop, a.dotTop);
  const bLeft = Math.min(b.pillLeft, b.dotLeft);
  const bTop = Math.min(b.pillTop, b.dotTop);

  return !(
    aRight + PILL_GAP <= bLeft ||
    bRight + PILL_GAP <= aLeft ||
    aBottom + PILL_GAP <= bTop ||
    bBottom + PILL_GAP <= aTop
  );
}

function separateOverlappingStacksFree(
  pickup: MarkerOverlayLayout,
  drop: MarkerOverlayLayout
): { pickup: MarkerOverlayLayout; drop: MarkerOverlayLayout } {
  let p = { ...pickup };
  let d = { ...drop };

  for (let i = 0; i < 4 && stacksOverlap(p, d); i += 1) {
    if (p.pillTop <= d.pillTop) {
      p = { ...p, pillTop: p.pillTop - 16 };
      d = { ...d, pillTop: d.pillTop + 16 };
    } else {
      d = { ...d, pillTop: d.pillTop - 16 };
      p = { ...p, pillTop: p.pillTop + 16 };
    }
  }

  return { pickup: p, drop: d };
}

/** Nudge pill stacks apart vertically when they collide on screen. */
export function separateOverlappingStacks(
  pickup: MarkerOverlayLayout,
  drop: MarkerOverlayLayout,
  map: MapSize
): { pickup: MarkerOverlayLayout; drop: MarkerOverlayLayout } {
  return separateOverlappingStacksFree(pickup, drop);
}

export function resolveMarkerOverlays(
  pickupPin: ScreenPoint | null,
  dropPin: ScreenPoint | null,
  _map: MapSize,
  pickupBias: InwardBias,
  dropBias: InwardBias
): { pickup: MarkerOverlayLayout | null; drop: MarkerOverlayLayout | null } {
  if (!pickupPin && !dropPin) return { pickup: null, drop: null };
  if (pickupPin && !dropPin) {
    return { pickup: layoutMarkerOverlayAtPin(pickupPin, pickupBias), drop: null };
  }
  if (!pickupPin && dropPin) {
    return { pickup: null, drop: layoutMarkerOverlayAtPin(dropPin, dropBias) };
  }

  const pickup = layoutMarkerOverlayAtPin(pickupPin!, pickupBias);
  const drop = layoutMarkerOverlayAtPin(dropPin!, dropBias);
  return separateOverlappingStacksFree(pickup, drop);
}

/** Typical bottom sheet height ratio on ride-book (used before onLayout). */
export const RIDE_BOOK_SHEET_HEIGHT_RATIO = 0.48;

/** Edge padding inside the map viewport (sheet sits below the map, not over it). */
export function rideMapFitPadding(options?: {
  topInset?: number;
}): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const { width } = Dimensions.get("window");
  const topInset = options?.topInset ?? 0;
  const side = Math.ceil(Math.max(40, width * 0.06));
  const top = Math.ceil(topInset + 72);
  const bottom = 52;

  return { top, right: side, bottom, left: side };
}

/** Max zoom cap for fitBounds — lets Mapbox pick natural zoom; only prevents over-zoom on short trips. */
export function rideMapFitMaxZoom(_tripKm?: number | null): number {
  return 15;
}

/** @deprecated Use rideMapFitMaxZoom — low values forced fitBounds to zoom out too far. */
export function rideRouteFitMaxZoom(tripKm: number | null | undefined): number {
  return rideMapFitMaxZoom(tripKm);
}

/** Pickup/drop bounds with a little breathing room at the edges. */
export function endpointsBoundsFitPoints(
  endpoints: { latitude: number; longitude: number }[]
): { latitude: number; longitude: number }[] {
  if (endpoints.length < 2) return endpoints;
  let minLat = endpoints[0]!.latitude;
  let maxLat = endpoints[0]!.latitude;
  let minLng = endpoints[0]!.longitude;
  let maxLng = endpoints[0]!.longitude;
  for (const p of endpoints) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }
  const latPad = Math.max((maxLat - minLat) * 0.14, 0.008);
  const lngPad = Math.max((maxLng - minLng) * 0.14, 0.008);
  return [
    ...endpoints,
    { latitude: minLat - latPad, longitude: minLng - lngPad },
    { latitude: minLat - latPad, longitude: maxLng + lngPad },
    { latitude: maxLat + latPad, longitude: minLng - lngPad },
    { latitude: maxLat + latPad, longitude: maxLng + lngPad },
  ];
}

/** Bounding-box fit points — route polyline + endpoints with edge breathing room. */
export function routeBoundsFitPoints(
  route: { latitude: number; longitude: number }[],
  endpoints: { latitude: number; longitude: number }[]
): { latitude: number; longitude: number }[] {
  const points = [...endpoints];
  let minLat = endpoints[0]?.latitude ?? route[0]?.latitude ?? 0;
  let maxLat = minLat;
  let minLng = endpoints[0]?.longitude ?? route[0]?.longitude ?? 0;
  let maxLng = minLng;

  const scan = (p: { latitude: number; longitude: number }) => {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  };

  endpoints.forEach(scan);
  route.forEach(scan);

  const latPad = Math.max((maxLat - minLat) * 0.14, 0.008);
  const lngPad = Math.max((maxLng - minLng) * 0.14, 0.008);

  points.push(
    { latitude: minLat - latPad, longitude: minLng - lngPad },
    { latitude: minLat - latPad, longitude: maxLng + lngPad },
    { latitude: maxLat + latPad, longitude: minLng - lngPad },
    { latitude: maxLat + latPad, longitude: maxLng + lngPad }
  );

  return points;
}
