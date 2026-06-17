import type {
  PenaltyCatalogChannel,
  RiderPenaltyEnginePayload,
} from "@/lib/rider-cancellation-penalty-engine.types";

const CACHE_PREFIX = "rider_penalty_engine_v2";

function cacheKey(channel: PenaltyCatalogChannel): string {
  return `${CACHE_PREFIX}_${channel}`;
}

export function readRiderPenaltyCache(
  channel: PenaltyCatalogChannel = "web"
): RiderPenaltyEnginePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(channel));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RiderPenaltyEnginePayload;
    if (!Array.isArray(parsed.scenarios)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeRiderPenaltyCache(payload: RiderPenaltyEnginePayload) {
  if (typeof window === "undefined") return;
  if (payload.migrationRequired) return;
  const channel = payload.channel ?? "web";
  try {
    sessionStorage.setItem(cacheKey(channel), JSON.stringify(payload));
  } catch {
    /* storage full — ignore */
  }
}
