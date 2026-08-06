/**
 * Count delivered orders for NEW vs EXISTING coupon/offer targeting.
 */
import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ordersCore } from "../../db/schema.js";

export async function countDeliveredOrdersForCustomer(
  db: PostgresJsDatabase<Record<string, unknown>>,
  customerId: number
): Promise<number> {
  if (!(customerId > 0)) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ordersCore)
    .where(and(eq(ordersCore.customerId, customerId), eq(ordersCore.status, "delivered")));
  return Number(row?.n ?? 0) || 0;
}

/** Derive NEW / EXISTING from delivered order count when client omits userSegment. */
export function userSegmentFromOrderCount(deliveredCount: number): "NEW" | "EXISTING" {
  return deliveredCount > 0 ? "EXISTING" : "NEW";
}
