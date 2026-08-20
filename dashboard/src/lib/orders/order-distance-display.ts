import {
  resolveStoreMapLngLat,
  toMapLngLat,
} from "@/lib/orders/parse-order-map-coords";

const EARTH_RADIUS_KM = 6371;

function toFiniteKm(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function roundKm(km: number): number {
  return Math.round(km * 100) / 100;
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLon = Math.sin(dLon / 2);
  const h =
    sinHalfLat * sinHalfLat + Math.cos(lat1) * Math.cos(lat2) * sinHalfLon * sinHalfLon;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Same 1-decimal label the customer app uses on store / checkout
 * (`toFixed(1)` / `fmtKm`). Sub-1 km shows meters.
 */
export function formatOrderDistanceKmLabel(distanceKm: number | null | undefined): string {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm <= 0) return "—";
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  const x = Math.round(distanceKm * 10) / 10;
  const s = Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1);
  return `${s} km`;
}

/** Convert meters-as-km (e.g. 3720 stored as 3720.00) when pins are clearly local. */
function normalizeTripKm(value: unknown, airKm: number | null): number | null {
  const stored = toFiniteKm(value);
  if (stored == null || stored <= 0) return null;
  if (stored >= 80 && airKm != null && airKm < 50) {
    const asKm = stored / 1000;
    if (asKm > 0) return roundKm(asKm);
  }
  return roundKm(stored);
}

/**
 * Order-details Distance must match the customer app billed trip:
 * checkout `serverBill.distanceKm` / store-quote road km frozen on
 * `billing_snapshot.distanceKm`, then `orders_core.distance_km`.
 *
 * Do not replace a billed road km with pin-to-pin haversine — that is
 * why dashboard previously diverged from the customer app.
 */
export function resolveOrderDetailsDistanceKm(input: {
  billedKm?: unknown;
  storedKm?: unknown;
  merchantLat?: unknown;
  merchantLon?: unknown;
  pickupLat?: unknown;
  pickupLon?: unknown;
  pickupGeocoded?: string | null;
  dropLat?: unknown;
  dropLon?: unknown;
}): number | null {
  const origin = resolveStoreMapLngLat({
    merchantLat: input.merchantLat,
    merchantLon: input.merchantLon,
    pickupLat: input.pickupLat,
    pickupLon: input.pickupLon,
    pickupGeocoded: input.pickupGeocoded,
  });
  const dest = toMapLngLat(input.dropLat, input.dropLon);
  const airKm =
    origin && dest
      ? (() => {
          const km = haversineKm(origin, dest);
          return km > 0 && Number.isFinite(km) ? km : null;
        })()
      : null;

  const billed = normalizeTripKm(input.billedKm, airKm);
  if (billed != null) return billed;

  const stored = normalizeTripKm(input.storedKm, airKm);
  if (stored != null) return stored;

  return airKm != null ? roundKm(airKm) : null;
}
