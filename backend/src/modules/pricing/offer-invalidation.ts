/**
 * Invalidate offer pricing caches and broadcast store events.
 */
import { getSql } from "../../db/client.js";
import { clearBillingRuleCache } from "../billing/ruleCache.js";
import { publishStoreEvent } from "../realtime/publish.js";

export type OfferInvalidationEvent =
  | "offer_created"
  | "offer_updated"
  | "offer_deleted"
  | "offer_published"
  | "offer_disabled"
  | "offer_expired"
  | "offer_started";

export async function bumpStoreOfferCacheVersion(storeId: number): Promise<number> {
  const sql = getSql();
  try {
    const [row] = await sql<Array<{ v: string }>>`
      SELECT public.bump_store_offer_pricing_cache_version(${storeId})::text AS v
    `;
    return Number(row?.v ?? 1);
  } catch {
    const [fallback] = await sql<Array<{ v: string }>>`
      UPDATE merchant_stores
      SET offer_pricing_cache_version = COALESCE(offer_pricing_cache_version, 0) + 1
      WHERE id = ${storeId}
      RETURNING offer_pricing_cache_version::text AS v
    `;
    return Number(fallback?.v ?? 1);
  }
}

export async function invalidateOfferPricing(
  merchantStoreId: number,
  event: OfferInvalidationEvent,
  payload: Record<string, unknown> = {}
): Promise<{ cacheVersion: number }> {
  clearBillingRuleCache();
  const cacheVersion = await bumpStoreOfferCacheVersion(merchantStoreId);

  await publishStoreEvent(merchantStoreId, {
    type: event,
    cacheVersion,
    ...payload,
  });

  await publishStoreEvent(merchantStoreId, {
    type: "menu_refresh",
    reason: event,
    cacheVersion,
  });

  return { cacheVersion };
}

export async function syncOfferApplicability(offerPk: number): Promise<void> {
  const sql = getSql();
  try {
    await sql`SELECT public.sync_offer_applicability_from_metadata(${offerPk})`;
  } catch {
    /* migration not applied yet */
  }
}

export async function syncOfferLifecycleBatch(): Promise<number> {
  const sql = getSql();
  try {
    const [row] = await sql<Array<{ n: number }>>`
      SELECT public.sync_merchant_offer_lifecycle_batch() AS n
    `;
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}
