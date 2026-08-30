import { and, eq, or } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { ordersCore, ordersRide } from "../../db/schema.js";
import { normalizeCustomerOrderStatus } from "../../lib/customer-order-status-resolve.js";
import { isRideFarePaymentPending } from "../../lib/ride-rider-payout-snapshot.js";
import { assertRideCustomerPaymentCollectable } from "../../lib/settle-zero-payable-person-ride.js";
import { computeRideBillForCustomerOrder } from "./ride-bill.service.js";

/**
 * Rider chooses how the passenger will pay for a COMPLETED person ride.
 *
 * Business flow (decided with product): the payment method is NOT locked at booking.
 * When the rider swipes to complete and reaches the collect-payment step, they pick
 * CASH or ONLINE. This endpoint records that choice on orders_core.payment_method so
 * the downstream, already-built settlement engines run the correct path:
 *   - cash   → POST .../ride/confirm-cash-collected → postCashRideSettlement (wallet
 *              DEBIT = company receivable only; rider keeps the cash).
 *   - online → rider-presented QR → webhook → postOnlineRideSettlement (wallet CREDIT
 *              = rider earnings; platform keeps its share of the online-collected fare).
 *
 * The choice is only allowed while the fare is still PENDING and NOT yet settled — once
 * a settlement exists the method is frozen (one-winner lock; see §54–55 of the spec).
 * Idempotent: re-selecting the same method on an unsettled ride is a no-op success.
 */

export type RidePaymentMethodChoice = "cash" | "online";

export type SelectRidePaymentMethodInput = {
  riderId: number;
  orderRef: string;
  method: RidePaymentMethodChoice;
};

export type SelectRidePaymentMethodResult = {
  ok: true;
  orderId: string;
  paymentMethod: RidePaymentMethodChoice;
  /** Final, backend-computed amount the passenger owes (immutable at this point). */
  customerBill: number;
  changed: boolean;
};

function riderOrderRefWhere(riderId: number, orderRef: string) {
  const trimmed = orderRef.trim();
  const isNumeric = /^\d+$/.test(trimmed);
  if (isNumeric) {
    return and(eq(ordersCore.riderId, riderId), eq(ordersCore.id, Number(trimmed)));
  }
  return and(
    eq(ordersCore.riderId, riderId),
    or(eq(ordersCore.orderId, trimmed), eq(ordersCore.formattedOrderId, trimmed))
  );
}

export async function selectRidePaymentMethodForRider(
  input: SelectRidePaymentMethodInput
): Promise<SelectRidePaymentMethodResult> {
  const db = getDb();
  const riderId = Number(input.riderId);
  if (!Number.isFinite(riderId) || riderId <= 0) {
    throw Object.assign(new Error("Invalid rider session"), { statusCode: 403 });
  }
  const method = input.method;
  if (method !== "cash" && method !== "online") {
    throw Object.assign(new Error("Invalid payment method"), { statusCode: 400 });
  }

  const [orderRow] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      customerId: ordersCore.customerId,
      orderType: ordersCore.orderType,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      paymentStatus: ordersCore.paymentStatus,
      paymentMethod: ordersCore.paymentMethod,
      riderId: ordersCore.riderId,
      settlementId: ordersRide.settlementId,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(riderOrderRefWhere(riderId, input.orderRef))
    .limit(1);

  if (!orderRow?.id) {
    throw Object.assign(new Error("Ride order not found"), { statusCode: 404 });
  }
  if (String(orderRow.orderType ?? "") !== "person_ride") {
    throw Object.assign(new Error("Not a ride order"), { statusCode: 400 });
  }
  if (Number(orderRow.riderId) !== riderId) {
    throw Object.assign(new Error("You are not the assigned rider for this order"), {
      statusCode: 403,
    });
  }
  const status = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
  if (status !== "DELIVERED") {
    throw Object.assign(
      new Error("Payment method can be chosen only after the ride is completed"),
      { statusCode: 409 }
    );
  }

  // One-winner lock: once settled, the method is frozen.
  if (orderRow.settlementId || !isRideFarePaymentPending(orderRow.paymentStatus)) {
    throw Object.assign(new Error("Ride fare is already settled"), {
      statusCode: 409,
      code: "ALREADY_SETTLED",
    });
  }

  await assertRideCustomerPaymentCollectable(orderRow.id);

  const customerPk = orderRow.customerId != null ? Number(orderRow.customerId) : 0;
  if (!Number.isFinite(customerPk) || customerPk <= 0) {
    throw Object.assign(new Error("Order has no linked customer"), { statusCode: 400 });
  }

  const billRes = await computeRideBillForCustomerOrder(db, {
    customerPk,
    orderRef: input.orderRef,
  });
  if (!billRes.ok) {
    throw Object.assign(new Error(billRes.message), {
      statusCode: billRes.statusCode ?? 400,
      code: billRes.code,
    });
  }
  const customerBill = Math.round(billRes.billing.final_amount * 100) / 100;

  const currentMethod = String(orderRow.paymentMethod ?? "").trim().toLowerCase();
  const changed = currentMethod !== method;
  if (changed) {
    await db
      .update(ordersCore)
      .set({ paymentMethod: method })
      .where(eq(ordersCore.id, orderRow.id));
  }

  const orderIdText = orderRow.orderId?.trim() || String(orderRow.id);
  return { ok: true, orderId: orderIdText, paymentMethod: method, customerBill, changed };
}
