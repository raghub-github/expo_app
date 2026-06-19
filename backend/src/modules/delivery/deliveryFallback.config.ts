import { getEnv } from "../../config/env.js";
import { getSql } from "../../db/client.js";

export type DeliveryFallbackRates = {
  baseInr: number;
  perKmInr: number;
  minFeeInr: number;
};

const DEFAULTS: DeliveryFallbackRates = {
  baseInr: 25,
  perKmInr: 5,
  minFeeInr: 0,
};

let cached: { at: number; value: DeliveryFallbackRates } | null = null;
const CONFIG_CACHE_MS = 60_000;

function parseNum(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function loadFromDb(): Promise<Partial<DeliveryFallbackRates>> {
  const sql = getSql();
  const rows = (await sql`
    SELECT config_key, config_value
    FROM system_config
    WHERE category = 'delivery'
      AND config_key IN (
        'delivery.fallback_base_inr',
        'delivery.fallback_per_km_inr',
        'delivery.min_fee_inr'
      )
  `) as Array<{ config_key: string; config_value: string }>;

  const map = new Map(rows.map((r) => [r.config_key, r.config_value]));
  const out: Partial<DeliveryFallbackRates> = {};
  if (map.has("delivery.fallback_base_inr")) {
    out.baseInr = parseNum(map.get("delivery.fallback_base_inr"), DEFAULTS.baseInr);
  }
  if (map.has("delivery.fallback_per_km_inr")) {
    out.perKmInr = parseNum(map.get("delivery.fallback_per_km_inr"), DEFAULTS.perKmInr);
  }
  if (map.has("delivery.min_fee_inr")) {
    out.minFeeInr = parseNum(map.get("delivery.min_fee_inr"), DEFAULTS.minFeeInr);
  }
  return out;
}

/** Platform fallback: base + per_km × distance when geo slabs don't apply. DB → env → code defaults. */
export async function getDeliveryFallbackRates(): Promise<DeliveryFallbackRates> {
  if (cached && Date.now() - cached.at < CONFIG_CACHE_MS) return cached.value;

  const env = getEnv();
  try {
    const db = await loadFromDb();
    const value: DeliveryFallbackRates = {
      baseInr: db.baseInr ?? env.DELIVERY_DEFAULT_BASE_INR ?? DEFAULTS.baseInr,
      perKmInr: db.perKmInr ?? env.DELIVERY_DEFAULT_PER_KM_INR ?? DEFAULTS.perKmInr,
      minFeeInr: db.minFeeInr ?? env.DELIVERY_MIN_FEE_INR ?? DEFAULTS.minFeeInr,
    };
    cached = { at: Date.now(), value };
    return value;
  } catch {
    return {
      baseInr: env.DELIVERY_DEFAULT_BASE_INR ?? DEFAULTS.baseInr,
      perKmInr: env.DELIVERY_DEFAULT_PER_KM_INR ?? DEFAULTS.perKmInr,
      minFeeInr: env.DELIVERY_MIN_FEE_INR ?? DEFAULTS.minFeeInr,
    };
  }
}

export function invalidateDeliveryFallbackConfigCache(): void {
  cached = null;
}

export function computeDeliveryFallbackFee(
  distanceKm: number,
  rates: DeliveryFallbackRates
): number {
  const computed = Math.round((rates.baseInr + distanceKm * rates.perKmInr) * 100) / 100;
  if (rates.minFeeInr > 0.005) {
    return Math.max(computed, Math.round(rates.minFeeInr * 100) / 100);
  }
  return computed;
}
