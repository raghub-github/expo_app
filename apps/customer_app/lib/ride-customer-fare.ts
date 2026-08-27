/** Admin-set catalog offsets (Bike Lite vs Bike, EV Auto vs Auto). Default ₹5. */
export const CATALOG_FARE_OFFSET_FALLBACK_INR = 5;

/** @deprecated Use `CATALOG_FARE_OFFSET_FALLBACK_INR`. */
export const BIKE_LITE_DISCOUNT_INR = CATALOG_FARE_OFFSET_FALLBACK_INR;

export type RideCatalogFareOffset = {
  parentCatalogCode: string;
  discountInr: number;
};

export const DEFAULT_RIDE_CATALOG_FARE_OFFSETS: Record<string, RideCatalogFareOffset> = {
  "bike-lite": { parentCatalogCode: "bike", discountInr: CATALOG_FARE_OFFSET_FALLBACK_INR },
  ev_auto: { parentCatalogCode: "auto", discountInr: CATALOG_FARE_OFFSET_FALLBACK_INR },
};

export function mergeRideCatalogFareOffsets(
  fromApi?: Record<string, RideCatalogFareOffset> | null
): Record<string, RideCatalogFareOffset> {
  const out: Record<string, RideCatalogFareOffset> = { ...DEFAULT_RIDE_CATALOG_FARE_OFFSETS };
  if (!fromApi) return out;
  for (const [code, row] of Object.entries(fromApi)) {
    const parent = String(row?.parentCatalogCode ?? "").trim();
    const discount = Number(row?.discountInr);
    if (!parent || !Number.isFinite(discount) || discount < 0) continue;
    out[code] = { parentCatalogCode: parent, discountInr: discount };
  }
  return out;
}

/** Always subtract the admin offset from the parent catalog fare. */
export function applyCatalogFareOffsets(
  quotes: Record<string, number>,
  offsets: Record<string, RideCatalogFareOffset> = DEFAULT_RIDE_CATALOG_FARE_OFFSETS
): Record<string, number> {
  const next = { ...quotes };
  for (const [code, offset] of Object.entries(offsets)) {
    const parent = next[offset.parentCatalogCode];
    const discount = offset.discountInr;
    if (parent == null || !Number.isFinite(parent) || parent <= 0) continue;
    if (!Number.isFinite(discount) || discount <= 0) continue;
    if (parent <= discount) continue;
    next[code] = Math.max(1, Math.round(parent - discount));
  }
  return next;
}

/** @deprecated Use `applyCatalogFareOffsets`. */
export function applyBikeLiteFareRule(quotes: Record<string, number>): Record<string, number> {
  return applyCatalogFareOffsets(quotes);
}

export function catalogFareCompareParent(
  catalogCode: string,
  quotes: Record<string, number>,
  offsets: Record<string, RideCatalogFareOffset> = DEFAULT_RIDE_CATALOG_FARE_OFFSETS
): number | undefined {
  const parentCode = offsets[catalogCode]?.parentCatalogCode;
  if (!parentCode) return undefined;
  const parent = quotes[parentCode];
  return parent != null && parent > 0 ? parent : undefined;
}

export function sortRideOptionsByFare<T extends { id: string }>(
  options: T[],
  fares: Record<string, number>
): T[] {
  return [...options].sort((a, b) => {
    const fa = fares[a.id];
    const fb = fares[b.id];
    const aFare = fa != null && fa > 0 ? fa : Number.POSITIVE_INFINITY;
    const bFare = fb != null && fb > 0 ? fb : Number.POSITIVE_INFINITY;
    return aFare - bFare;
  });
}

/** Bike first, Bike Lite always second, remaining vehicles by lowest fare. */
export function sortRideOptionsBikeLiteSecond<T extends { id: string }>(
  options: T[],
  fares: Record<string, number>
): T[] {
  const bike = options.find((o) => o.id === "bike");
  const bikeLite = options.find((o) => o.id === "bike-lite");
  const rest = options.filter((o) => o.id !== "bike" && o.id !== "bike-lite");
  const sortedRest = sortRideOptionsByFare(rest, fares);
  return [bike, bikeLite, ...sortedRest].filter((o): o is T => o != null);
}
