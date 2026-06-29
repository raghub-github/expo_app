import type { MerchantCompensationEnginePayload } from "@/lib/merchant-cancellation-compensation-engine.types";

const CACHE_KEY = "merchant_compensation_engine_v1";

export function readMerchantCompensationCache(): MerchantCompensationEnginePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MerchantCompensationEnginePayload;
    if (!Array.isArray(parsed.scenarios)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeMerchantCompensationCache(payload: MerchantCompensationEnginePayload) {
  if (typeof window === "undefined") return;
  if (payload.migrationRequired) return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* storage full */
  }
}
