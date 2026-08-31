import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { ordersCore, ordersRide } from "../db/schema.js";
import { normalizeCustomerOrderStatus } from "./customer-order-status-resolve.js";
import { isRideFareAwaitingCustomerPayment, resolvePersonRideCustomerPayable } from "./ride-customer-payable.js";
import { reconcileAndSettlePersonRideCustomerPayable } from "./settle-zero-payable-person-ride.js";

function isCashRidePaymentMethod(method?: string | null): boolean {
  const m = String(method ?? "").trim().toLowerCase();
  return m === "cash" || m === "cod";
}

export function isCustomerRideFareDue(input: {
  orderType?: string | null;
  status?: string | null;
  currentStatus?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  grandTotal?: unknown;
  checkoutMetadata?: unknown;
  billingSnapshot?: unknown;
}): boolean {
  if (String(input.orderType ?? "").trim() !== "person_ride") return false;
  const appStatus = normalizeCustomerOrderStatus(input.currentStatus, input.status);
  if (appStatus !== "DELIVERED") return false;
  if (isCashRidePaymentMethod(input.paymentMethod)) return false;
  const customerPayable = resolvePersonRideCustomerPayable({
    grandTotal: input.grandTotal,
    checkoutMetadata: input.checkoutMetadata,
    billingSnapshot: input.billingSnapshot,
  });
  return isRideFareAwaitingCustomerPayment({
    paymentStatus: input.paymentStatus,
    customerPayable,
  });
}

export async function findCustomerOutstandingRideFare(customerPk: number): Promise<{
  orderCoreId: number;
  orderId: string;
  formattedOrderId: string | null;
  grandTotal: number;
} | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      paymentStatus: ordersCore.paymentStatus,
      paymentMethod: ordersCore.paymentMethod,
      grandTotal: ordersCore.grandTotal,
      checkoutMetadata: ordersCore.checkoutMetadata,
      billingSnapshot: ordersCore.billingSnapshot,
      cancelledAt: ordersRide.cancelledAt,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(
      and(
        eq(ordersCore.customerId, customerPk),
        eq(ordersCore.orderType, "person_ride"),
        eq(ordersCore.status, "delivered"),
        isNull(ordersRide.cancelledAt)
      )
    )
    .orderBy(desc(ordersCore.updatedAt))
    .limit(1);

  if (!row?.id || !row.orderId) return null;

  const settled = await reconcileAndSettlePersonRideCustomerPayable(row.id);
  if (!settled.paymentRequired) return null;

  if (
    !isCustomerRideFareDue({
      orderType: "person_ride",
      status: row.status,
      currentStatus: row.currentStatus,
      paymentStatus: settled.paymentStatus,
      paymentMethod: row.paymentMethod,
      grandTotal: settled.customerPayable,
      checkoutMetadata: row.checkoutMetadata,
      billingSnapshot: row.billingSnapshot,
    })
  ) {
    return null;
  }

  return {
    orderCoreId: row.id,
    orderId: row.orderId.trim(),
    formattedOrderId: row.formattedOrderId?.trim() || null,
    grandTotal: settled.customerPayable,
  };
}
