/**
 * Customer-app ETA preview — MIRROR of backend `previewEtaRange` in
 * backend/src/modules/eta/eta.preview.ts. The two files MUST stay in sync.
 *
 * Formula:
 *   routeMinutes = max(5, round(distanceKm × 60 / 18))
 *   raw          = min(prep, 25) + routeMinutes
 *   etaMin       = raw + 5
 *   etaMax       = raw + 10
 *
 * Use this everywhere a customer-visible pre-order ETA is rendered.
 * Order placement uses the full backend ETA engine separately.
 */

const AVG_CITY_KMPH = 18;
const MIN_LEG_MINUTES = 5;
const DEFAULT_PREP_MINUTES = 15;
const BUFFER_MIN_LOW = 5;
const BUFFER_MIN_HIGH = 10;
const MAX_LIST_PREP_MINUTES = 25;

export type EtaPreviewRange = {
  etaMinMinutes: number;
  etaMaxMinutes: number;
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
  };
}

/**
 * "45-55 mins" / "55 mins" — collapses to a single number when the range is
 * tight enough to be silly.
 */
export function formatEtaRange(range: EtaPreviewRange): string {
  if (range.etaMaxMinutes - range.etaMinMinutes <= 1) return `${range.etaMaxMinutes} mins`;
  return `${range.etaMinMinutes}-${range.etaMaxMinutes} mins`;
}

/**
 * Helper that accepts the raw (distanceKm, prep) and returns the formatted
 * label in one shot — saves callers from re-importing both functions.
 */
export function formatEtaForStore(args: {
  distanceKm: number | null | undefined;
  prepMinutes: number | null | undefined;
}): string {
  return formatEtaRange(previewEtaRange(args));
}
