/**
 * Customer-visible delivery ETA from store avg prep + distance.
 * Uses server-stamped range when present; otherwise derives from DB prep time.
 */

import type { MerchantSummary } from "@/services/merchant.service";
import { previewEtaRange } from "@/lib/etaPreview";
import { applyWeatherToEtaRange } from "@/services/weather.service";

export type MerchantEtaRange = {
  etaMinMinutes: number;
  etaMaxMinutes: number;
};

function pickPrepMinutes(merchant: MerchantSummary): number | null {
  const raw =
    merchant.avgPreparationTimeMinutes ??
    (merchant as Record<string, unknown>).avg_preparation_time_minutes;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function pickEtaRangeFromApi(merchant: MerchantSummary): MerchantEtaRange | null {
  const minRaw = merchant.etaMinMinutes ?? (merchant as Record<string, unknown>).eta_min_minutes;
  const maxRaw = merchant.etaMaxMinutes ?? (merchant as Record<string, unknown>).eta_max_minutes;
  const min = Number(minRaw);
  const max = Number(maxRaw);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return null;
  return { etaMinMinutes: min, etaMaxMinutes: max };
}

/** Resolve ETA range: API stamp → prep+distance preview → deliveryTime parse. */
export function resolveMerchantEtaRange(merchant: MerchantSummary): MerchantEtaRange {
  const fromApi = pickEtaRangeFromApi(merchant);
  if (fromApi) return fromApi;

  const prep = pickPrepMinutes(merchant);
  if (prep != null || merchant.distanceKm != null) {
    return previewEtaRange({
      distanceKm: merchant.distanceKm ?? null,
      prepMinutes: prep,
    });
  }

  const raw = merchant.deliveryTime?.trim() ?? "";
  const range = raw.match(/(\d+)\s*-\s*(\d+)\s*min/i);
  if (range) {
    return { etaMinMinutes: Number(range[1]), etaMaxMinutes: Number(range[2]) };
  }
  const single = raw.match(/(\d+)\s*min/i);
  if (single) {
    const m = Number(single[1]);
    return { etaMinMinutes: m, etaMaxMinutes: m };
  }

  return previewEtaRange({ distanceKm: null, prepMinutes: null });
}

export function formatMerchantDeliveryTime(
  merchant: MerchantSummary,
  opts?: { weatherDelayMinutes?: number; unit?: "min" | "mins" }
): string {
  let { etaMinMinutes, etaMaxMinutes } = resolveMerchantEtaRange(merchant);
  const delay = opts?.weatherDelayMinutes ?? 0;
  if (delay > 0) {
    const adjusted = applyWeatherToEtaRange(etaMinMinutes, etaMaxMinutes, delay);
    etaMinMinutes = adjusted.etaMinMinutes;
    etaMaxMinutes = adjusted.etaMaxMinutes;
  }
  const unit = opts?.unit ?? "mins";
  if (etaMaxMinutes - etaMinMinutes <= 1) return `${etaMaxMinutes} ${unit}`;
  return `${etaMinMinutes}-${etaMaxMinutes} ${unit}`;
}
