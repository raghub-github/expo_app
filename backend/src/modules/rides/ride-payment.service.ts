import { eq } from "drizzle-orm";
import { getDb, getSql } from "../../db/client.js";
import {
  debitCustomerGatiCashForRideFare,
  getCustomerGatiCashAvailable,
} from "../../lib/checkout-gaticash-wallet-ops.js";
import { customers, ordersCore, ordersCorePayments, ordersRide } from "../../db/schema.js";
import { customerOrderRefWhere } from "../../lib/order-ref-resolve.js";
import { normalizeCustomerOrderStatus } from "../../lib/customer-order-status-resolve.js";
import { verifyRazorpaySignature, verifyRazorpayPaymentDetails } from "../../services/payment/razorpayService.js";
import { isRideFarePaymentPending } from "../../lib/ride-rider-payout-snapshot.js";
import { assertRideCustomerPaymentCollectable } from "../../lib/settle-zero-payable-person-ride.js";
import { computeRideBillForCustomerOrder } from "./ride-bill.service.js";
import { insertRideCustomerPaymentSnapshot } from "../../lib/persist-ride-customer-payment-snapshot.js";
import { postOnlineRideSettlement } from "./settlement/rideSettlement.engine.js";
import { rideBillingToSettlementComponents } from "./settlement/billingToComponents.js";

function roundInr(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export async function confirmRideFarePaymentForCustomer(input: {
  customerSub: string;
  orderRef: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  gatiCashAmount?: number;
  couponCode?: string | null;
  platformOfferId?: number | null;
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

  const settledPayable = await assertRideCustomerPaymentCollectable(orderRow.id);

  const billRes = await computeRideBillForCustomerOrder(db, {
    customerPk,
    orderRef: input.orderRef,
    couponCode: input.couponCode,
    platformOfferId: input.platformOfferId,
  });
  if (!billRes.ok) {
    throw Object.assign(new Error(billRes.message), {
      statusCode: billRes.statusCode ?? 400,
      code: billRes.code,
    });
  }

  const fareDue = roundInr(Math.min(billRes.billing.final_amount, settledPayable) || settledPayable);
  if (fareDue <= 0) {
    throw Object.assign(new Error("Ride fare is already paid"), { statusCode: 409 });
  }

  const offerDiscount = roundInr(billRes.billing.discount_total);

  const requestedGatiCash = roundInr(input.gatiCashAmount ?? 0);
  const hasRazorpay = Boolean(
    input.razorpayOrderId?.trim() &&
      input.razorpayPaymentId?.trim() &&
      input.razorpaySignature?.trim()
  );

  if (requestedGatiCash <= 0.005 && !hasRazorpay) {
    const hasOffer =
      Boolean(input.couponCode?.trim()) ||
      (input.platformOfferId != null && input.platformOfferId > 0);
    if (fareDue > 0.005 || !hasOffer) {
      throw Object.assign(new Error("Payment details are required"), { statusCode: 400 });
    }
  }

  const sql = getSql();
  const walletAvailable =
    requestedGatiCash > 0.005
      ? await getCustomerGatiCashAvailable(sql, customerPk)
      : 0;
  const gatiCashApplied =
    requestedGatiCash > 0.005
      ? Math.min(requestedGatiCash, walletAvailable, fareDue)
      : 0;

  if (requestedGatiCash > 0.005 && gatiCashApplied + 0.005 < requestedGatiCash) {
    throw Object.assign(new Error("Insufficient GatiCash balance"), { statusCode: 400 });
  }

  const razorpayDue = roundInr(fareDue - gatiCashApplied);
  if (razorpayDue > 0.005) {
    if (!hasRazorpay) {
      throw Object.assign(new Error("Online payment is required for the remaining fare"), {
        statusCode: 400,
      });
    }
    const signatureOk = verifyRazorpaySignature(
      input.razorpayOrderId!,
      input.razorpayPaymentId!,
      input.razorpaySignature!
    );
    if (!signatureOk) {
      throw Object.assign(new Error("Invalid payment signature"), { statusCode: 400 });
    }

    try {
      const verified = await verifyRazorpayPaymentDetails(
        input.razorpayOrderId!,
        input.razorpayPaymentId!,
        input.razorpaySignature!,
        Math.round(razorpayDue * 100)
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
  }

  const now = new Date();
  const prevSnap =
    orderRow.billingSnapshot != null && typeof orderRow.billingSnapshot === "object"
      ? (orderRow.billingSnapshot as Record<string, unknown>)
      : {};
  const orderIdText = orderRow.orderId?.trim() || String(orderRow.id);

  if (gatiCashApplied > 0.005) {
    await debitCustomerGatiCashForRideFare(sql, {
      customerInternalId: customerPk,
      orderIdText,
      amount: gatiCashApplied,
    });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(ordersCore)
      .set({
        paymentStatus: "completed",
        grandTotal: String(fareDue),
        billingSnapshot: {
          ...prevSnap,
          ...billRes.snapshot,
          final_amount: fareDue,
          ride_fare_offer_discount: offerDiscount > 0.005 ? offerDiscount : undefined,
          ride_fare_coupon_code: input.couponCode?.trim() || undefined,
          ride_fare_platform_offer_id:
            input.platformOfferId != null ? input.platformOfferId : undefined,
          gatiCashAmount: gatiCashApplied > 0.005 ? gatiCashApplied : undefined,
          ride_fare_paid_at: now.toISOString(),
        },
        updatedAt: now,
      })
      .where(eq(ordersCore.id, orderRow.id));

    await tx
      .update(ordersRide)
      .set({
        amountCollected: String(fareDue),
        finalFare: String(fareDue),
        updatedAt: now,
      })
      .where(eq(ordersRide.orderId, orderRow.id));

    // Persist capture row so dashboard refunds/guard see the same SSOT as food.
    const razorpayPaymentId = input.razorpayPaymentId?.trim() || null;
    const razorpayOrderId = input.razorpayOrderId?.trim() || null;
    await tx.insert(ordersCorePayments).values({
      orderId: orderIdText,
      paymentGateway: razorpayPaymentId ? "razorpay" : gatiCashApplied > 0.005 ? "gati_cash" : "ride_fare",
      paymentMethod: razorpayPaymentId
        ? "UPI"
        : gatiCashApplied > 0.005
          ? "WALLET"
          : "ONLINE",
      transactionId: razorpayPaymentId || `ride_fare:${orderRow.id}:${now.getTime()}`,
      amount: String(fareDue),
      currency: "INR",
      paymentStatus: "PAID",
      gatewayResponse: {
        source: "person_ride_fare",
        razorpayPaymentId,
        razorpayOrderId,
        gatiCashApplied,
        amountPaid: fareDue,
      },
      paidAt: now,
    });
  });

  const snapshotId = await insertRideCustomerPaymentSnapshot(db, {
    orderCoreId: orderRow.id,
    orderIdText,
    customerId: customerPk,
    phase: "payment_confirmed",
    billing: billRes.billing,
    billingSnapshot: billRes.snapshot,
    offerContext: {
      couponCode: input.couponCode,
      platformOfferId: input.platformOfferId,
    },
    rideContext: {
      rideType:
        typeof prevSnap.rideType === "string"
          ? prevSnap.rideType
          : typeof (prevSnap as { ride_type?: string }).ride_type === "string"
            ? (prevSnap as { ride_type?: string }).ride_type
            : null,
    },
    paymentContext: {
      gatiCashApplied,
      razorpayAmount: razorpayDue,
      amountPaid: fareDue,
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
    },
    metadata: {
      ride_fare_offer_discount: offerDiscount > 0.005 ? offerDiscount : undefined,
    },
  });

  const riderId = orderRow.riderId != null ? Number(orderRow.riderId) : null;

  // Ride Settlement Engine — single source of truth for person_ride wallet
  // credit + immutable settlement. Do NOT also call credit-rider-order-on-delivered
  // for rides once settlement posts (legacy path is gated when settlement_id set).
  const pickupMeta =
    typeof prevSnap === "object"
      ? (prevSnap as Record<string, unknown>)
      : {};
  let settlementPosted = false;
  try {
    const settlement = await postOnlineRideSettlement({
      orderCoreId: orderRow.id,
      orderIdText,
      riderId: riderId ?? null,
      customerId: customerPk,
      billing: {
        customerBill: fareDue,
        components: rideBillingToSettlementComponents(billRes.billing, billRes.snapshot),
        billingSnapshotId: snapshotId,
        billingSnapshot: {
          ...(billRes.snapshot ?? {}),
          final_amount: fareDue,
        },
        couponCode: input.couponCode,
      },
      geo: {
        pickupLat: Number((pickupMeta as { pickupLat?: unknown }).pickupLat ?? 0),
        pickupLng: Number((pickupMeta as { pickupLon?: unknown }).pickupLon ?? 0),
        pickupPincode:
          typeof (pickupMeta as { pickupPincode?: unknown }).pickupPincode === "string"
            ? String((pickupMeta as { pickupPincode?: unknown }).pickupPincode)
            : null,
        pickupState:
          typeof (pickupMeta as { pickupState?: unknown }).pickupState === "string"
            ? String((pickupMeta as { pickupState?: unknown }).pickupState)
            : null,
      },
      paymentSplit: {
        gatiCashApplied,
        razorpayAmount: razorpayDue,
        razorpayOrderId: input.razorpayOrderId ?? null,
        razorpayPaymentId: input.razorpayPaymentId ?? null,
      },
    });
    settlementPosted = Boolean(settlement?.settlementId);
  } catch (err) {
    console.warn("[confirmRideFarePayment] settlement engine failed:", err);
  }

  // Fallback only when settlement failed to post — never double-credit.
  if (!settlementPosted && riderId != null && riderId > 0) {
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

  return { ok: true, amountPaid: fareDue };
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
