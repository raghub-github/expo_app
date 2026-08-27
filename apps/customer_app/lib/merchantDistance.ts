/**
 * Single canonical formatter for the CUSTOMER-FACING MERCHANT / STORE operational
 * distance (the backend-authoritative route distance for the active delivery location).
 *
 * Policy (matches the pre-existing card UI — RestaurantCard / NearFastDeliveryMeta):
 *   - missing / non-positive / rounds to 0 m → null (caller may show "Near & Fast")
 *   - < 1 km  → whole metres, e.g. "850 m"
 *   - >= 1 km → one decimal kilometre, e.g. "1.2 km", "8.0 km"
 *
 * Presentation only: the underlying value is NOT rounded before formatting, so the
 * precise route distance stays intact for fare/serviceability upstream.
 *
 * Do NOT use this for ride/navigation trip stats or location-search "place" distances —
 * those are genuinely different concepts and keep their own formatters.
 */
function formatMerchantDistanceKm(km?: number | null): string | null {
  if (km == null || !Number.isFinite(km) || km <= 0) return null;
  if (km < 1) {
    const meters = Math.round(km * 1000);
    if (meters < 1) return null;
    return `${meters} m`;
  }
  return `${km.toFixed(1)} km`;
}

export { formatMerchantDistanceKm };
export default formatMerchantDistanceKm;
