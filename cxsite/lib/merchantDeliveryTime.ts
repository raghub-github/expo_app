import { previewEtaRange } from '@/lib/etaPreview'

export type MerchantEtaInput = {
  etaMinMinutes?: number | null
  etaMaxMinutes?: number | null
  eta_min_minutes?: number | null
  eta_max_minutes?: number | null
  avgPreparationTimeMinutes?: number | null
  avg_preparation_time_minutes?: number | null
  distanceKm?: number | null
  distance_km?: number | null
  deliveryTime?: string | null
  delivery_time?: string | null
}

function pickPrepMinutes(merchant: MerchantEtaInput): number | null {
  const raw =
    merchant.avgPreparationTimeMinutes ?? merchant.avg_preparation_time_minutes
  if (raw == null) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function pickEtaRangeFromApi(merchant: MerchantEtaInput): {
  etaMinMinutes: number
  etaMaxMinutes: number
} | null {
  const minRaw = merchant.etaMinMinutes ?? merchant.eta_min_minutes
  const maxRaw = merchant.etaMaxMinutes ?? merchant.eta_max_minutes
  const min = Number(minRaw)
  const max = Number(maxRaw)
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return null
  return { etaMinMinutes: min, etaMaxMinutes: max }
}

export function resolveMerchantEtaRange(merchant: MerchantEtaInput): {
  etaMinMinutes: number
  etaMaxMinutes: number
} {
  const fromApi = pickEtaRangeFromApi(merchant)
  if (fromApi) return fromApi

  const prep = pickPrepMinutes(merchant)
  const distanceKm = merchant.distanceKm ?? merchant.distance_km ?? null
  if (prep != null || distanceKm != null) {
    return previewEtaRange({ distanceKm, prepMinutes: prep })
  }

  const raw = (merchant.deliveryTime ?? merchant.delivery_time ?? '').trim()
  const range = raw.match(/(\d+)\s*-\s*(\d+)\s*min/i)
  if (range) {
    return { etaMinMinutes: Number(range[1]), etaMaxMinutes: Number(range[2]) }
  }
  const single = raw.match(/(\d+)\s*min/i)
  if (single) {
    const m = Number(single[1])
    return { etaMinMinutes: m, etaMaxMinutes: m }
  }

  return previewEtaRange({ distanceKm: null, prepMinutes: null })
}

export function formatMerchantDeliveryTime(
  merchant: MerchantEtaInput,
  opts?: { unit?: 'min' | 'mins' }
): string {
  const { etaMinMinutes, etaMaxMinutes } = resolveMerchantEtaRange(merchant)
  const unit = opts?.unit ?? 'mins'
  if (etaMaxMinutes - etaMinMinutes <= 1) return `${etaMaxMinutes} ${unit}`
  return `${etaMinMinutes}-${etaMaxMinutes} ${unit}`
}
