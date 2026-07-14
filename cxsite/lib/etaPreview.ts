/**
 * ETA preview — mirrors backend `previewEtaRange`.
 *   routeMinutes = max(5, round(distanceKm × 60 / 18))
 *   raw          = min(prep, 25) + routeMinutes
 *   etaMin       = raw + 5
 *   etaMax       = raw + 10
 */
const AVG_CITY_KMPH = 18
const MIN_LEG_MINUTES = 5
const DEFAULT_PREP_MINUTES = 15
const BUFFER_MIN_LOW = 5
const BUFFER_MIN_HIGH = 10
const MAX_LIST_PREP_MINUTES = 25

export type EtaPreviewRange = {
  etaMinMinutes: number
  etaMaxMinutes: number
}

export function previewEtaRange(args: {
  distanceKm: number | null | undefined
  prepMinutes: number | null | undefined
}): EtaPreviewRange {
  const distance =
    Number.isFinite(args.distanceKm) && (args.distanceKm ?? 0) > 0 ? Number(args.distanceKm) : 0
  let prep =
    Number.isFinite(args.prepMinutes) && (args.prepMinutes ?? 0) > 0
      ? Math.round(Number(args.prepMinutes))
      : DEFAULT_PREP_MINUTES
  prep = Math.min(prep, MAX_LIST_PREP_MINUTES)
  const routeMinutes =
    distance > 0
      ? Math.max(MIN_LEG_MINUTES, Math.round((distance * 60) / AVG_CITY_KMPH))
      : MIN_LEG_MINUTES
  const raw = prep + routeMinutes
  return {
    etaMinMinutes: raw + BUFFER_MIN_LOW,
    etaMaxMinutes: raw + BUFFER_MIN_HIGH,
  }
}

export function formatEtaRange(range: EtaPreviewRange, unit: 'min' | 'mins' = 'mins'): string {
  if (range.etaMaxMinutes - range.etaMinMinutes <= 1) {
    return `${range.etaMaxMinutes} ${unit}`
  }
  return `${range.etaMinMinutes}-${range.etaMaxMinutes} ${unit}`
}

export function formatEtaForStore(args: {
  distanceKm: number | null | undefined
  prepMinutes: number | null | undefined
}): string {
  return formatEtaRange(previewEtaRange(args))
}
