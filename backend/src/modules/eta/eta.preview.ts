/**
 * Pre-order ETA preview — single formula every customer-facing surface uses.
 *
 * List / merchant header / checkout stamp this range so all screens agree.
 * Order placement still uses the full critical-path engine (`computeEta`).
 *
 * Formula (must stay in sync with apps/customer_app/lib/etaPreview.ts):
 *   routeMinutes = max(MIN_LEG, round(distanceKm × 60 / 18))
 *   raw          = prepMinutes + routeMinutes
 *   etaMin       = raw + 5
 *   etaMax       = raw + 10
 *
 * Why not computeEta here:
 *   Discovery cards must not stack rider-assignment, apartment, peak-hour,
 *   and uncertainty margins — that inflated 1 km stores to 40–50+ mins.
 */

const AVG_CITY_KMPH = 18;
/** Floor for the store→customer leg (handoff + short hops). */
const MIN_LEG_MINUTES = 5;
const DEFAULT_PREP_MINUTES = 15;
const BUFFER_MIN_LOW = 5;
const BUFFER_MIN_HIGH = 10;
/** Cap kitchen prep on list cards so one slow menu item doesn't dominate. */
const MAX_LIST_PREP_MINUTES = 25;

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
  const distance =
    Number.isFinite(args.distanceKm) && (args.distanceKm ?? 0) > 0 ? Number(args.distanceKm) : 0;
  let prep =
    Number.isFinite(args.prepMinutes) && (args.prepMinutes ?? 0) > 0
      ? Math.round(Number(args.prepMinutes))
      : DEFAULT_PREP_MINUTES;
  prep = Math.min(prep, MAX_LIST_PREP_MINUTES);

  const routeMinutes =
    distance > 0
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
