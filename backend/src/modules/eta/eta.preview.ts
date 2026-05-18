/**
 * Pre-order ETA preview — ONE formula every customer-facing surface uses.
 *
 * Why this exists:
 *   The customer app was showing 3 different ETAs for the same store at the
 *   same time — "30 min" on the list, "~10 min · 30 mins" on the merchant
 *   detail, and "45-55 mins" on checkout. Each surface had its own formula.
 *
 *   This module exposes a single deterministic computation that backend
 *   responses stamp as `etaMinMinutes` / `etaMaxMinutes`. Every customer
 *   surface then renders those exact numbers, so all screens for one store
 *   always agree.
 *
 * Formula (stays in lock-step with `computeEta` in eta.engine.ts but lighter):
 *   raw      = prepMinutes + max(8, round(distanceKm × 60 / 18))   // 18 km/h
 *   minRange = round(raw + 5)
 *   maxRange = round(raw + 10)
 *
 * The 5–10 buffer keeps the customer-visible range honest without needing
 * traffic/weather/peak-hour signals (those still kick in on the persisted
 * order snapshot via computeEta).
 */

const AVG_CITY_KMPH = 18;
const MIN_LEG_MINUTES = 8;
const BUFFER_MIN_LOW = 5;
const BUFFER_MIN_HIGH = 10;

export type EtaPreviewRange = {
  etaMinMinutes: number;
  etaMaxMinutes: number;
  /** Optional internal split for debugging — never shown to customers. */
  internal: { prepMinutes: number; routeMinutes: number };
};

export function previewEtaRange(args: {
  distanceKm: number | null | undefined;
  prepMinutes: number | null | undefined;
}): EtaPreviewRange {
  const distance = Number.isFinite(args.distanceKm) && (args.distanceKm ?? 0) > 0
    ? Number(args.distanceKm)
    : 0;
  const prep = Number.isFinite(args.prepMinutes) && (args.prepMinutes ?? 0) > 0
    ? Math.round(Number(args.prepMinutes))
    : 18;
  const routeMinutes = distance > 0
    ? Math.max(MIN_LEG_MINUTES, Math.round((distance * 60) / AVG_CITY_KMPH))
    : MIN_LEG_MINUTES;
  const raw = prep + routeMinutes;
  return {
    etaMinMinutes: raw + BUFFER_MIN_LOW,
    etaMaxMinutes: raw + BUFFER_MIN_HIGH,
    internal: { prepMinutes: prep, routeMinutes },
  };
}

/** Convenience: human-friendly label "45-55 mins" / "55 mins" when range is tight. */
export function formatEtaLabel(range: EtaPreviewRange): string {
  if (range.etaMaxMinutes - range.etaMinMinutes <= 1) return `${range.etaMaxMinutes} mins`;
  return `${range.etaMinMinutes}-${range.etaMaxMinutes} mins`;
}
