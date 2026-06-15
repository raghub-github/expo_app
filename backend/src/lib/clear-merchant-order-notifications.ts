/**
 * Remove in-app "New order!" notifications once the order is acted on or completed.
 */
import type { Sql } from "postgres";

export async function clearMerchantStoreOrderNotifications(
  sql: Sql,
  args: {
    merchantStoreId: number;
    ordersFoodId: number;
    orderCoreId?: number | null;
    formattedOrderId?: string | null;
  }
): Promise<number> {
  const storeId = args.merchantStoreId;
  const foodId = args.ordersFoodId;
  const coreId = args.orderCoreId ?? null;
  const displayId = (args.formattedOrderId ?? "").trim();
  const actionPath = `/order/${foodId}`;

  const ids = new Set<number>();

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

  if (coreId != null) {
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
