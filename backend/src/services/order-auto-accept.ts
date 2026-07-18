import type { Sql } from "postgres";
import { getSql, withSqlRetry } from "../db/client.js";
import { patchMerchantFoodOrderStatus } from "../modules/merchant-partner/merchant-food-orders.service.js";
import { resolveStorePrepWithBuffer } from "../lib/order-prep-time.js";

const AUTO_ACCEPT_REASON = "Auto accepted";

type AutoAcceptLog = {
  info: (o: object, msg?: string) => void;
  error: (o: object, msg?: string) => void;
};

type AutoAcceptTarget = {
  food_id: number;
  merchant_store_id: number;
  avg_preparation_time_minutes: number | null;
  prep_buffer_minutes: number;
};

async function fetchAutoAcceptTargets(
  sql: Sql,
  options: { merchantStoreId?: number; limit?: number } = {}
): Promise<AutoAcceptTarget[]> {
  const limit = Math.max(1, Math.min(100, options.limit ?? 50));
  const storeId = options.merchantStoreId;

  if (storeId != null && Number.isFinite(storeId) && storeId > 0) {
    return (await sql`
      SELECT
        f.id AS food_id,
        f.merchant_store_id,
        ms.avg_preparation_time_minutes,
        COALESCE(ss.preparation_buffer_minutes, 0) AS prep_buffer_minutes
      FROM orders_food f
      INNER JOIN merchant_store_settings ss ON ss.store_id = f.merchant_store_id
      INNER JOIN merchant_stores ms ON ms.id = f.merchant_store_id
      WHERE f.merchant_store_id = ${storeId}
        AND ss.auto_accept_orders = TRUE
        AND upper(COALESCE(f.order_status, '')) IN ('CREATED', 'NEW', 'PLACED')
        AND f.cancelled_at IS NULL
        AND (NOW() - f.created_at) >= make_interval(
          secs => GREATEST(0, COALESCE(ss.auto_accept_time_seconds, 30))
        )
      ORDER BY f.created_at ASC
      LIMIT ${limit}
    `) as AutoAcceptTarget[];
  }

  return (await sql`
    SELECT
      f.id AS food_id,
      f.merchant_store_id,
      ms.avg_preparation_time_minutes,
      COALESCE(ss.preparation_buffer_minutes, 0) AS prep_buffer_minutes
    FROM orders_food f
    INNER JOIN merchant_store_settings ss ON ss.store_id = f.merchant_store_id
    INNER JOIN merchant_stores ms ON ms.id = f.merchant_store_id
    WHERE ss.auto_accept_orders = TRUE
      AND upper(COALESCE(f.order_status, '')) IN ('CREATED', 'NEW', 'PLACED')
      AND f.cancelled_at IS NULL
      AND (NOW() - f.created_at) >= make_interval(
        secs => GREATEST(0, COALESCE(ss.auto_accept_time_seconds, 30))
      )
    ORDER BY f.created_at ASC
    LIMIT ${limit}
  `) as AutoAcceptTarget[];
}

function resolveAutoAcceptPrepMinutes(target: AutoAcceptTarget): number {
  return resolveStorePrepWithBuffer(
    target.avg_preparation_time_minutes,
    target.prep_buffer_minutes
  );
}

async function acceptOneTarget(
  sql: Sql,
  target: AutoAcceptTarget,
  log: AutoAcceptLog
): Promise<boolean> {
  const storeId = Number(target.merchant_store_id);
  const foodId = Number(target.food_id);
  if (!Number.isFinite(storeId) || storeId <= 0 || !Number.isFinite(foodId) || foodId <= 0) {
    return false;
  }

  try {
    await patchMerchantFoodOrderStatus(sql, storeId, foodId, "ACCEPTED", null, {
      actionSource: "system",
      actionMode: "auto",
      preparationTimeMinutes: resolveAutoAcceptPrepMinutes(target),
    });
    log.info({ storeId, foodId, reason: AUTO_ACCEPT_REASON }, "order_auto_accepted");
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("invalid_transition") || msg.includes("order_not_found")) {
      return false;
    }
    log.error({ err, storeId, foodId }, "order_auto_accept_failed");
    return false;
  }
}

/**
 * Auto-accept CREATED food orders for stores with auto_accept_orders enabled.
 * Runs server-side — merchant does not need the partner site or app open.
 */
export async function runOrderAutoAcceptTick(log: AutoAcceptLog): Promise<void> {
  const now = new Date().toISOString();

  try {
    await withSqlRetry(async () => {
      const sql = getSql();
      const targets = await fetchAutoAcceptTargets(sql, { limit: 50 });
      let accepted = 0;
      for (const target of targets) {
        const ok = await acceptOneTarget(sql, target, log);
        if (ok) accepted += 1;
      }
      if (accepted > 0) {
        log.info({ accepted, scanned: targets.length, now }, "order_auto_accept_tick");
      }
    });
  } catch (e) {
    log.error({ err: e, now }, "order_auto_accept_tick_failed");
  }
}

/** Flush eligible auto-accept orders for one store (portal sync). */
export async function syncOrderAutoAcceptForStore(
  merchantStoreId: number,
  log: AutoAcceptLog
): Promise<{ accepted: number }> {
  const sql = getSql();
  const now = new Date().toISOString();

  try {
    const targets = await fetchAutoAcceptTargets(sql, {
      merchantStoreId,
      limit: 50,
    });
    let accepted = 0;
    for (const target of targets) {
      const ok = await acceptOneTarget(sql, target, log);
      if (ok) accepted += 1;
    }
    if (accepted > 0) {
      log.info({ accepted, merchantStoreId, now }, "order_auto_accept_store_sync");
    }
    return { accepted };
  } catch (e) {
    log.error({ err: e, merchantStoreId, now }, "order_auto_accept_store_sync_failed");
    return { accepted: 0 };
  }
}
