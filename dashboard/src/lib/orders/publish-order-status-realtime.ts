/**
 * Publish order status to Redis so customer + rider apps pick it up instantly.
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
      NULLIF(TRIM(formatted_order_id), '') AS formatted_order_id,
      rider_id,
      NULLIF(TRIM(order_type), '') AS order_type
    FROM orders_core
    WHERE id = ${orderCoreId}
    LIMIT 1
  `;
  const row = (
    rows as {
      order_id?: string | null;
      formatted_order_id?: string | null;
      rider_id?: number | null;
      order_type?: string | null;
    }[]
  )[0];
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
  const orderIdText = row?.order_id ?? row?.formatted_order_id ?? String(orderCoreId);
  const at = new Date().toISOString();
  const body = JSON.stringify({
    type: "status_changed",
    status: customerStatus,
    orderId: orderIdText,
    orderIdText,
    orderType: row?.order_type ?? null,
    at,
    source: "dashboard",
  });
  await Promise.all(
    [...channels].map((id) => redis.publish(`order:${id}`, body).catch(() => undefined))
  );

  // Rider active-order screens poll + listen on rider:{id} — clear live job when admin completes.
  const riderId =
    row?.rider_id != null && Number.isFinite(Number(row.rider_id))
      ? Number(row.rider_id)
      : null;
  if (riderId != null && riderId > 0) {
    const riderBody = JSON.stringify({
      type: "status_changed",
      status: customerStatus,
      orderId: orderIdText,
      orderIdText,
      riderId,
      at,
      source: "dashboard",
    });
    await redis.publish(`rider:${riderId}`, riderBody).catch(() => undefined);
  }
}
