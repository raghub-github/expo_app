/**
 * Publish order status to Redis so customer app WS picks it up instantly.
 */
import { getSql } from "@/lib/db/client";
import { getRedisClient } from "@/lib/redis";

const STATUS_TO_CUSTOMER: Record<string, string> = {
  picked_up: "READY_FOR_PICKUP",
  in_transit: "OUT_FOR_DELIVERY",
  delivered: "DELIVERED",
};

export async function publishOrderStatusChanged(
  orderCoreId: number,
  dashboardStatus: string
): Promise<void> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      NULLIF(TRIM(order_id), '') AS order_id,
      NULLIF(TRIM(formatted_order_id), '') AS formatted_order_id
    FROM orders_core
    WHERE id = ${orderCoreId}
    LIMIT 1
  `;
  const row = (rows as { order_id?: string | null; formatted_order_id?: string | null }[])[0];
  const channels = new Set(
    [row?.order_id, row?.formatted_order_id, String(orderCoreId)]
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
  );
  if (channels.size === 0) return;

  const customerStatus =
    STATUS_TO_CUSTOMER[dashboardStatus] ??
    String(dashboardStatus).toUpperCase().replace(/[\s-]+/g, "_");

  const redis = getRedisClient();
  if (!redis) return;
  if (redis.status !== "ready") {
    await redis.connect().catch(() => undefined);
  }
  const body = JSON.stringify({
    type: "status_changed",
    status: customerStatus,
    orderId: row?.order_id ?? row?.formatted_order_id ?? String(orderCoreId),
    orderIdText: row?.order_id ?? row?.formatted_order_id ?? String(orderCoreId),
    at: new Date().toISOString(),
    source: "dashboard",
  });
  await Promise.all(
    [...channels].map((id) => redis.publish(`order:${id}`, body).catch(() => undefined))
  );
}
