import { Dimensions } from "react-native";

export const RIDE_MAP_PILL_WIDTH = 148;
export const RIDE_MAP_PILL_HEIGHT = 36;
export const RIDE_MAP_DOT_SIZE = 22;
export const RIDE_MAP_STEM_HEIGHT = 5;
export const RIDE_MAP_STACK_HEIGHT =
  RIDE_MAP_PILL_HEIGHT + RIDE_MAP_STEM_HEIGHT + RIDE_MAP_DOT_SIZE;

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
  const dotLeft = pin.x - RIDE_MAP_DOT_SIZE / 2;
  const dotTop = pin.y - RIDE_MAP_DOT_SIZE / 2;
  let pillLeft = pin.x - RIDE_MAP_PILL_WIDTH / 2;
  if (bias === "left") pillLeft += 10;
  if (bias === "right") pillLeft -= 10;
  const pillTop =
    pin.y - RIDE_MAP_DOT_SIZE / 2 - RIDE_MAP_STEM_HEIGHT - RIDE_MAP_PILL_HEIGHT;

  return { pillLeft, pillTop, dotLeft, dotTop };
}

function stacksOverlap(a: MarkerOverlayLayout, b: MarkerOverlayLayout): boolean {
  const aRight = Math.max(a.pillLeft + RIDE_MAP_PILL_WIDTH, a.dotLeft + RIDE_MAP_DOT_SIZE);
  const aBottom = Math.max(a.pillTop + RIDE_MAP_STACK_HEIGHT, a.dotTop + RIDE_MAP_DOT_SIZE);
  const bRight = Math.max(b.pillLeft + RIDE_MAP_PILL_WIDTH, b.dotLeft + RIDE_MAP_DOT_SIZE);
  const bBottom = Math.max(b.pillTop + RIDE_MAP_STACK_HEIGHT, b.dotTop + RIDE_MAP_DOT_SIZE);

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
export const RIDE_BOOK_SHEET_HEIGHT_RATIO = 0.46;

/** Edge padding so the full route stays inside the visible map (never under sheet / FABs). */
export function rideMapFitPadding(options?: {
  topInset?: number;
  /** Bottom sheet height — actual or estimated (px). */
  bottomSheetHeightPx?: number;
}): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const { width, height: screenHeight } = Dimensions.get("window");
  const topInset = options?.topInset ?? 0;
  const sheetHeight =
    options?.bottomSheetHeightPx ??
    Math.round(screenHeight * RIDE_BOOK_SHEET_HEIGHT_RATIO);
  // Sheet uses marginTop:-18 over map; reserve overlap + FAB column clearance
  const sheetOverlapPx = Math.max(32, Math.round(sheetHeight * 0.08));

  const side = Math.ceil(Math.max(56, width * 0.12));
  const top = Math.ceil(topInset + RIDE_MAP_STACK_HEIGHT + 52);
  // FAB column (~72) + pill stack + sheet overlap + breathing room
  const bottom = Math.ceil(RIDE_MAP_STACK_HEIGHT + 88 + sheetOverlapPx + 36);

  return { top, right: side, bottom, left: side };
}

/** Lower max zoom on longer trips so the entire route fits like Rapido. */
export function rideRouteFitMaxZoom(tripKm: number | null | undefined): number {
  if (tripKm == null || !Number.isFinite(tripKm) || tripKm <= 0) return 15;
  if (tripKm > 35) return 10;
  if (tripKm > 22) return 11;
  if (tripKm > 14) return 12;
  if (tripKm > 8) return 13;
  if (tripKm > 4) return 14;
  return 15;
}

/** Bounding-box corner points — stable fit for long winding polylines. */
export function routeBoundsFitPoints(
  route: { latitude: number; longitude: number }[],
  endpoints: { latitude: number; longitude: number }[]
): { latitude: number; longitude: number }[] {
  const points = [...endpoints];
  if (route.length >= 2) {
    let minLat = route[0]!.latitude;
    let maxLat = route[0]!.latitude;
    let minLng = route[0]!.longitude;
    let maxLng = route[0]!.longitude;
    for (const c of route) {
      minLat = Math.min(minLat, c.latitude);
      maxLat = Math.max(maxLat, c.latitude);
      minLng = Math.min(minLng, c.longitude);
      maxLng = Math.max(maxLng, c.longitude);
    }
    points.push(
      { latitude: minLat, longitude: minLng },
      { latitude: minLat, longitude: maxLng },
      { latitude: maxLat, longitude: minLng },
      { latitude: maxLat, longitude: maxLng }
    );
  }
  return points;
}
