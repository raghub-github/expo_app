/**
 * Remove in-app "New order!" notifications once the order is acted on or completed.
 */
import type { Sql } from "postgres";

export async function clearMerchantStoreOrderNotifications(
  sql: Sql,
  args: {
    merchantStoreId: number;
    ordersFoodId?: number | null;
    orderCoreId?: number | null;
    formattedOrderId?: string | null;
  }
): Promise<number> {
  const storeId = args.merchantStoreId;
  const foodId = args.ordersFoodId ?? null;
  const coreId = args.orderCoreId ?? null;
  const displayId = (args.formattedOrderId ?? "").trim();
  const ids = new Set<number>();

  if (foodId != null && foodId > 0) {
    const actionPath = `/order/${foodId}`;
    const byFood = await sql<{ id: number }[]>`
      DELETE FROM merchant_store_notifications
      WHERE store_id = ${storeId}
        AND type = 'order'
        AND (
          order_id = ${foodId}
          OR action_url = ${actionPath}
          OR action_url LIKE ${`%${actionPath}`}
        )
      RETURNING id
    `;
    for (const r of byFood) ids.add(r.id);
  }

  if (coreId != null && coreId > 0) {
    const byCore = await sql<{ id: number }[]>`
      DELETE FROM merchant_store_notifications
      WHERE store_id = ${storeId}
        AND type = 'order'
        AND order_id = ${coreId}
      RETURNING id
    `;
    for (const r of byCore) ids.add(r.id);
  }

  if (displayId) {
    const byBody = await sql<{ id: number }[]>`
      DELETE FROM merchant_store_notifications
      WHERE store_id = ${storeId}
        AND type = 'order'
        AND body ILIKE ${`%${displayId}%`}
      RETURNING id
    `;
    for (const r of byBody) ids.add(r.id);
  }

  return ids.size;
}

/**
 * Resolve food/core ids from order ref text, then clear inbox rows.
 * Used by domain event handlers when only orderId + storeId are known.
 */
export async function clearMerchantStoreOrderNotificationsByOrderRef(
  sql: Sql,
  args: {
    merchantStoreId: number;
    orderIdText: string;
    formattedOrderId?: string | null;
  }
): Promise<number> {
  const orderId = args.orderIdText.trim();
  const shortId = (args.formattedOrderId ?? "").trim();
  if (!orderId && !shortId) return 0;

  const rows = (await sql`
    SELECT
      ofood.id AS food_id,
      oc.id AS core_id,
      COALESCE(NULLIF(TRIM(oc.formatted_order_id), ''), oc.order_id) AS display_id
    FROM orders_core oc
    LEFT JOIN orders_food ofood ON ofood.order_id = oc.id
    WHERE
      (${orderId} <> '' AND (oc.order_id = ${orderId} OR oc.formatted_order_id = ${orderId}))
      OR (${shortId} <> '' AND (oc.order_id = ${shortId} OR oc.formatted_order_id = ${shortId}))
    LIMIT 1
  `) as Array<{ food_id: number | null; core_id: number; display_id: string | null }>;

  const row = rows[0];
  if (!row) {
    if (shortId || orderId) {
      return clearMerchantStoreOrderNotifications(sql, {
        merchantStoreId: args.merchantStoreId,
        formattedOrderId: shortId || orderId,
      });
    }
    return 0;
  }

  return clearMerchantStoreOrderNotifications(sql, {
    merchantStoreId: args.merchantStoreId,
    ordersFoodId: row.food_id,
    orderCoreId: row.core_id,
    formattedOrderId: row.display_id ?? (shortId || orderId),
  });
}

/** Clear when order leaves the "new / pending accept" pipeline. */
export function shouldClearOrderNotifications(newStatus: string): boolean {
  const s = String(newStatus ?? "").trim().toUpperCase();
  return (
    s !== "CREATED" &&
    s !== "NEW" &&
    s !== "ORDER_PLACED" &&
    s !== "PENDING"
  );
}
