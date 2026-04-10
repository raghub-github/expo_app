import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { DeliveryFeeRequest, DeliveryFeeResult } from "./deliveryRateCard.types.js";
import { loadDeliveryRateCardDataset } from "./deliveryRateCard.repository.js";
import { calculateDeliveryFee } from "./deliveryRateCard.engine.js";

type CacheEntry = { value: DeliveryFeeResult; expiresAt: number };
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function key(req: DeliveryFeeRequest): string {
  const city = (req.cityName ?? "").trim().toLowerCase();
  return [
    (req.serviceType ?? "FOOD").trim().toUpperCase(),
    city,
    req.pickup.lat.toFixed(4),
    req.pickup.lng.toFixed(4),
    req.drop.lat.toFixed(4),
    req.drop.lng.toFixed(4),
    req.distanceKm.toFixed(2),
    req.now.toISOString().slice(0, 13), // hour bucket
    (req.demandLevel ?? "UNKNOWN"),
  ].join("|");
}

export async function computeDeliveryFee(
  db: PostgresJsDatabase<Record<string, unknown>>,
  req: DeliveryFeeRequest,
  opts?: { skipCache?: boolean }
): Promise<DeliveryFeeResult> {
  const k = key(req);
  if (!opts?.skipCache) {
    const hit = cache.get(k);
    if (hit && Date.now() < hit.expiresAt) return hit.value;
  }

  const dataset = await loadDeliveryRateCardDataset(db);
  const result = calculateDeliveryFee(dataset, req);

  if (!opts?.skipCache) cache.set(k, { value: result, expiresAt: Date.now() + TTL_MS });
  return result;
}

