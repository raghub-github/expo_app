/**
 * Resolve customer orders by canonical id, formatted id (GMF…), or legacy order_id (GM…).
 */

import { and, eq, or } from "drizzle-orm";
import { ordersCore } from "../db/schema.js";

export function parseOrderRefParam(orderIdParam: string): {
  isNumericId: boolean;
  orderIdNum: number;
} {
  const orderIdNum = parseInt(orderIdParam, 10);
  return { isNumericId: !Number.isNaN(orderIdNum), orderIdNum };
}

/** Drizzle WHERE: customer's order matching id | order_id | formatted_order_id. */
export function customerOrderRefWhere(customerPk: number, orderIdParam: string) {
  const { isNumericId, orderIdNum } = parseOrderRefParam(orderIdParam);
  if (isNumericId) {
    return and(eq(ordersCore.customerId, customerPk), eq(ordersCore.id, orderIdNum));
  }
  return and(
    eq(ordersCore.customerId, customerPk),
    or(eq(ordersCore.orderId, orderIdParam), eq(ordersCore.formattedOrderId, orderIdParam))
  );
}
