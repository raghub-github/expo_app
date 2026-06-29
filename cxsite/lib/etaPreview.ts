/**
 * Customer-app ETA preview — mirrors backend `previewEtaRange`.
 *   raw      = prepMinutes + max(8, round(distanceKm × 60 / 18))
 *   minRange = round(raw + 5)
 *   maxRange = round(raw + 10)
 */
const AVG_CITY_KMPH = 18
const MIN_LEG_MINUTES = 8
const BUFFER_MIN_LOW = 5
const BUFFER_MIN_HIGH = 10

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
  const prep =
    Number.isFinite(args.prepMinutes) && (args.prepMinutes ?? 0) > 0
      ? Math.round(Number(args.prepMinutes))
      : 18
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
