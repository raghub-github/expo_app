import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { customers, ordersCore, ordersRide } from "../../db/schema.js";
import { customerOrderRefWhere } from "../../lib/order-ref-resolve.js";
import { normalizeCustomerOrderStatus } from "../../lib/customer-order-status-resolve.js";
import { verifyRazorpaySignature, verifyRazorpayPaymentDetails } from "../../services/payment/razorpayService.js";
import { isRideFarePaymentPending } from "../../lib/ride-rider-payout-snapshot.js";

export async function confirmRideFarePaymentForCustomer(input: {
  customerSub: string;
  orderRef: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ ok: true; amountPaid: number }> {
  const db = getDb();

  const [customerRow] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerId, input.customerSub))
    .limit(1);
  const customerPk = customerRow?.id ?? null;
  if (customerPk == null) {
    throw Object.assign(new Error("Customer not found"), { statusCode: 403 });
  }

  const [orderRow] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      orderType: ordersCore.orderType,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      grandTotal: ordersCore.grandTotal,
      paymentStatus: ordersCore.paymentStatus,
      billingSnapshot: ordersCore.billingSnapshot,
      riderId: ordersCore.riderId,
    })
    .from(ordersCore)
    .where(customerOrderRefWhere(customerPk, input.orderRef))
    .limit(1);

  if (!orderRow?.id) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }
  if (String(orderRow.orderType ?? "") !== "person_ride") {
    throw Object.assign(new Error("Not a ride order"), { statusCode: 400 });
  }

  const statusUpper = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
  if (statusUpper !== "DELIVERED") {
    throw Object.assign(new Error("Ride fare can be paid only after the ride is completed"), {
      statusCode: 409,
    });
  }

  if (!isRideFarePaymentPending(orderRow.paymentStatus)) {
    throw Object.assign(new Error("Ride fare is already paid"), { statusCode: 409 });
  }

  const amountPaid = Math.round(Number(orderRow.grandTotal ?? 0));
  if (amountPaid <= 0) {
    throw Object.assign(new Error("Invalid ride fare amount"), { statusCode: 400 });
  }

  const signatureOk = verifyRazorpaySignature(
    input.razorpayOrderId,
    input.razorpayPaymentId,
    input.razorpaySignature
  );
  if (!signatureOk) {
    throw Object.assign(new Error("Invalid payment signature"), { statusCode: 400 });
  }

  try {
    const verified = await verifyRazorpayPaymentDetails(
      input.razorpayOrderId,
      input.razorpayPaymentId,
      input.razorpaySignature,
      amountPaid * 100
    );
    if (!verified.ok) {
      throw Object.assign(new Error(verified.message ?? "Could not verify payment"), {
        statusCode: 400,
      });
    }
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode) throw err;
    /* dummy / dev simulated payments may skip gateway fetch */
  }

  const now = new Date();
  const prevSnap =
    orderRow.billingSnapshot != null && typeof orderRow.billingSnapshot === "object"
      ? (orderRow.billingSnapshot as Record<string, unknown>)
      : {};

  await db.transaction(async (tx) => {
    await tx
      .update(ordersCore)
      .set({
        paymentStatus: "completed",
        billingSnapshot: {
          ...prevSnap,
          final_amount: amountPaid,
          ride_fare_paid_at: now.toISOString(),
        },
        updatedAt: now,
      })
      .where(eq(ordersCore.id, orderRow.id));

    await tx
      .update(ordersRide)
      .set({
        amountCollected: String(amountPaid),
        finalFare: String(amountPaid),
        updatedAt: now,
      })
      .where(eq(ordersRide.orderId, orderRow.id));
  });

  const riderId = orderRow.riderId != null ? Number(orderRow.riderId) : null;
  if (riderId != null && riderId > 0) {
    void import("../../lib/credit-rider-order-on-delivered.js")
      .then(({ creditRiderOrderEarningOnDelivered }) =>
        creditRiderOrderEarningOnDelivered({
          ordersCoreId: orderRow.id,
          riderId,
          orderType: "person_ride",
          orderIdText: orderRow.orderId?.trim() || String(orderRow.id),
        })
      )
      .catch((err) => {
        console.warn("[confirmRideFarePayment] rider wallet credit skipped:", err);
      });
  }

  return { ok: true, amountPaid };
}

export async function adminClearRiderPaymentHoldForOrder(input: {
  orderCoreId: number;
  actorEmail?: string | null;
}): Promise<{ ok: true; credited: boolean }> {
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      orderType: ordersCore.orderType,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      paymentStatus: ordersCore.paymentStatus,
      riderId: ordersCore.riderId,
      adminCleared: ordersRide.adminRiderPaymentClearedAt,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(eq(ordersCore.id, input.orderCoreId))
    .limit(1);

  if (!row?.id || !row.orderId) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }
  if (String(row.orderType ?? "") !== "person_ride") {
    throw Object.assign(new Error("Only person ride orders support this action"), { statusCode: 400 });
  }
  const statusUpper = normalizeCustomerOrderStatus(row.currentStatus, row.status);
  if (statusUpper !== "DELIVERED") {
    throw Object.assign(new Error("Ride must be delivered before clearing rider payment hold"), {
      statusCode: 409,
    });
  }
  if (row.adminCleared) {
    return { ok: true, credited: true };
  }

  const riderId = row.riderId != null ? Number(row.riderId) : null;
  if (riderId == null || riderId <= 0) {
    throw Object.assign(new Error("No rider assigned to this ride"), { statusCode: 409 });
  }

  await db
    .update(ordersRide)
    .set({
      adminRiderPaymentClearedAt: now,
      updatedAt: now,
    })
    .where(eq(ordersRide.orderId, row.id));

  let credited = false;
  try {
    const { creditRiderOrderEarningOnDelivered } = await import(
      "../../lib/credit-rider-order-on-delivered.js"
    );
    const result = await creditRiderOrderEarningOnDelivered({
      ordersCoreId: row.id,
      riderId,
      orderType: "person_ride",
      orderIdText: row.orderId.trim(),
    });
    credited = result.credited;
  } catch (err) {
    console.warn("[adminClearRiderPaymentHold] wallet credit skipped:", err);
  }

  return { ok: true, credited };
}
