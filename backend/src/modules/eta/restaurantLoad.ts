/**
 * Restaurant load helpers — counts in-flight orders at a store so the ETA
 * engine can apply a kitchen-load buffer (step function over active_orders).
 *
 * Cached for 20s to avoid hammering orders_core on every checkout / preview
 * call. A single store rarely changes load class within that window, and
 * the engine's buffer steps are coarse (5/12/20 min) so sub-second freshness
 * is not required.
 */

import { getSql } from "../../db/client.js";
import { cacheGet, cacheSet } from "@gatimitra/redis";

type LoadEntry = { activeOrders: number; expiresAt: number };
const LOAD_CACHE = new Map<number, LoadEntry>();
const LOAD_TTL_MS = 20_000;
const LOAD_TTL_SEC = 20;

/**
 * Active orders at a store = anything placed but not yet delivered, cancelled,
 * or refunded. The status set matches the merchant kitchen's open queue.
 * We bound the window to the last 4 hours so an old stuck row doesn't
 * permanently inflate the load.
 */
export async function getActiveOrdersForStore(storeId: number): Promise<number> {
  if (!storeId || !Number.isFinite(storeId)) return 0;

  // 1. In-process cache for hot stores within a single replica.
  const cached = LOAD_CACHE.get(storeId);
  if (cached && cached.expiresAt > Date.now()) return cached.activeOrders;

  // 2. Redis — shared across replicas. 20 s TTL bounds staleness across nodes
  //    and prevents every replica from hitting orders_core simultaneously.
  const redisKey = `store_load:${storeId}`;
  try {
    const remote = await cacheGet<number>(redisKey);
    if (typeof remote === "number" && Number.isFinite(remote) && remote >= 0) {
      LOAD_CACHE.set(storeId, { activeOrders: remote, expiresAt: Date.now() + LOAD_TTL_MS });
      return remote;
    }
  } catch {
    /* Redis down — fall through to DB. */
  }

  // 3. Authoritative DB lookup. Populates both layers on success.
  const sql = getSql();
  try {
    const rows = await sql<Array<{ active_orders: string | number }>>`
      SELECT COUNT(*)::text AS active_orders
      FROM orders_core
      WHERE merchant_store_id = ${storeId}
        AND current_status NOT IN ('DELIVERED','CANCELLED','REJECTED','REFUNDED','COMPLETED')
        AND created_at > NOW() - INTERVAL '4 hours'
    `;
    const n = Number(rows[0]?.active_orders ?? 0);
    const value = Number.isFinite(n) && n >= 0 ? n : 0;
    LOAD_CACHE.set(storeId, { activeOrders: value, expiresAt: Date.now() + LOAD_TTL_MS });
    void cacheSet(redisKey, value, LOAD_TTL_SEC).catch(() => undefined);
    return value;
  } catch (err) {
    // current_status enum mismatch or migration drift — log + fall back to 0
    // so a metric query failure can't 500 every checkout call.
    console.warn(
      "[eta] getActiveOrdersForStore failed — defaulting to 0",
      { storeId, err: (err as Error).message },
    );
    return 0;
  }
}

/**
 * Step function that maps active_orders → kitchen load buffer.
 * Numbers come straight from the v2 spec; tune via the eta_load_samples table
 * once we have a few thousand orders' worth of accuracy data.
 */
export function kitchenLoadBufferMinutes(activeOrders: number): number {
  if (!Number.isFinite(activeOrders) || activeOrders < 0) return 0;
  if (activeOrders <= 5) return 0;
  if (activeOrders <= 15) return 5;
  if (activeOrders <= 30) return 12;
  return 20;
}

/** Persist one load sample for ML training / accuracy audits. */
export async function recordLoadSample(args: {
  storeId: number;
  activeOrders: number;
  kitchenStatus?: string | null;
  prepEfficiency?: number | null;
}): Promise<void> {
  const sql = getSql();
  try {
    await sql`
      INSERT INTO eta_load_samples (store_id, active_orders, kitchen_status, prep_efficiency)
      VALUES (${args.storeId}, ${args.activeOrders}, ${args.kitchenStatus ?? null},
              ${args.prepEfficiency != null ? args.prepEfficiency.toFixed(3) : null})
    `;
  } catch {
    // best-effort sample; never block a quote on telemetry write
  }
}
