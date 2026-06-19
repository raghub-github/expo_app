/** Bike Lite is always ₹11–₹12 below Bike (production rule). */
export const BIKE_LITE_DISCOUNT_INR = 12;
export const BIKE_LITE_MIN_DISCOUNT_INR = 11;

export function applyBikeLiteFareRule(quotes: Record<string, number>): Record<string, number> {
  const bike = quotes.bike;
  if (bike == null || !Number.isFinite(bike) || bike <= BIKE_LITE_MIN_DISCOUNT_INR) {
    return quotes;
  }
  const liteFare = Math.max(1, bike - BIKE_LITE_DISCOUNT_INR);
  return { ...quotes, "bike-lite": liteFare };
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
