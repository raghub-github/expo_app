import { eq, sql as dsql } from "drizzle-orm";
import { getDb, getSql } from "../../db/client.js";
import {
  debitCustomerGatiCashForRideFare,
  getCustomerGatiCashAvailable,
} from "../../lib/checkout-gaticash-wallet-ops.js";
import { customers, ordersCore, ordersCorePayments, ordersRide } from "../../db/schema.js";
import { customerOrderRefWhere } from "../../lib/order-ref-resolve.js";
import { normalizeCustomerOrderStatus } from "../../lib/customer-order-status-resolve.js";
import {
  verifyRazorpaySignature,
  verifyRazorpayPaymentDetails,
  createRazorpayOrder,
} from "../../services/payment/razorpayService.js";
import { getEnv } from "../../config/env.js";
import { createHmac } from "node:crypto";
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

  const alreadySettled = await db.transaction(async (tx) => {
    // Exactly-once guard: lock the order row and re-check inside the tx so that
    // concurrent callback + webhook + reconciler finalizers serialize — only the
    // first settles; the rest observe paymentStatus already terminal and skip.
    const locked = await tx.execute<{ payment_status: string | null }>(dsql`
      SELECT payment_status FROM orders_core WHERE id = ${orderRow.id} FOR UPDATE
    `);
    const lockedRows = Array.isArray(locked)
      ? (locked as Array<{ payment_status: string | null }>)
      : ((locked as { rows?: Array<{ payment_status: string | null }> })?.rows ?? []);
    if (!isRideFarePaymentPending(lockedRows[0]?.payment_status)) {
      return true; // another finalizer already settled — idempotent no-op
    }

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

    return false; // we are the settler
  });

  // Another concurrent finalizer already settled this ride — idempotent success,
  // skip the (non-idempotent) snapshot + settlement engine to avoid duplication.
  if (alreadySettled) {
    return { ok: true, amountPaid: fareDue };
  }

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

/**
 * Create the Razorpay order for a DIRECT-ONLINE person-ride fare and durably
 * anchor it in payment_events (RIDE_FARE_PAYMENT_INITIATED). This is the
 * pre-payment record that lets the webhook + reconciler recover a captured fare
 * when the client callback is lost. The payable is computed server-side — the
 * client-supplied amount is never trusted.
 */
export async function createRideFarePaymentOrder(input: {
  customerSub: string;
  orderRef: string;
}): Promise<
  | { ok: true; orderId: string; keyId: string; amount: number; currency: string; dummy: boolean }
  | { ok: false; statusCode: number; code: string; message: string }
> {
  const db = getDb();
  const env = getEnv();

  const [customerRow] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerId, input.customerSub))
    .limit(1);
  const customerPk = customerRow?.id ?? null;
  if (customerPk == null) {
    return { ok: false, statusCode: 403, code: "CUSTOMER_REQUIRED", message: "Customer not found" };
  }

  const [orderRow] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      orderType: ordersCore.orderType,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      paymentStatus: ordersCore.paymentStatus,
    })
    .from(ordersCore)
    .where(customerOrderRefWhere(customerPk, input.orderRef))
    .limit(1);

  if (!orderRow?.id) return { ok: false, statusCode: 404, code: "ORDER_NOT_FOUND", message: "Order not found" };
  if (String(orderRow.orderType ?? "") !== "person_ride") {
    return { ok: false, statusCode: 400, code: "NOT_A_RIDE", message: "Not a ride order" };
  }
  const statusUpper = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
  if (statusUpper !== "DELIVERED") {
    return { ok: false, statusCode: 409, code: "RIDE_NOT_COMPLETED", message: "Ride not completed" };
  }
  if (!isRideFarePaymentPending(orderRow.paymentStatus)) {
    return { ok: false, statusCode: 409, code: "ALREADY_PAID", message: "Ride fare already paid" };
  }

  const settledPayable = await assertRideCustomerPaymentCollectable(orderRow.id);
  const billRes = await computeRideBillForCustomerOrder(db, {
    customerPk,
    orderRef: input.orderRef,
  });
  if (!billRes.ok) {
    return {
      ok: false,
      statusCode: billRes.statusCode ?? 400,
      code: billRes.code ?? "BILL_FAILED",
      message: billRes.message,
    };
  }
  const fareDue = roundInr(Math.min(billRes.billing.final_amount, settledPayable) || settledPayable);
  if (fareDue <= 0.005) {
    return { ok: false, statusCode: 409, code: "ZERO_PAYABLE", message: "No online fare payable" };
  }
  const amountPaise = Math.round(fareDue * 100);
  const orderIdText = orderRow.orderId?.trim() || String(orderRow.id);

  const dummyModeActive = env.PAYMENT_DUMMY_MODE || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET;

  let razorpayOrderId: string;
  let currency = "INR";
  if (dummyModeActive) {
    if (!env.PAYMENT_DUMMY_MODE && env.NODE_ENV !== "development") {
      return { ok: false, statusCode: 503, code: "GATEWAY_NOT_CONFIGURED", message: "Razorpay not configured" };
    }
    razorpayOrderId = `dummy_ride_${orderIdText}_${Date.now()}`;
  } else {
    const order = await createRazorpayOrder({
      amount: amountPaise,
      currency: "INR",
      receipt: `ride_${orderIdText}_${Date.now()}`,
      notes: {
        purpose: "ride_fare",
        business_order_id: orderIdText,
        customer_id: input.customerSub,
      },
    });
    razorpayOrderId = order.id;
    currency = order.currency;
  }

  // Durable anchor. Each create-order mints a new Razorpay order = a distinct
  // attempt; all attempts are retained in the append-only spine.
  try {
    const sqlc = getSql();
    await sqlc`
      INSERT INTO payment_events (
        razorpay_order_id, order_id, event_type, source, amount_paise, currency, payload
      ) VALUES (
        ${razorpayOrderId}, ${orderIdText}, 'RIDE_FARE_PAYMENT_INITIATED', 'client', ${amountPaise}, ${currency},
        ${JSON.stringify({
          flow: "ride_fare",
          business_order_id: orderIdText,
          order_core_id: orderRow.id,
          customer_sub: input.customerSub,
          customer_pk: customerPk,
          amount_inr: fareDue,
        })}::text::jsonb
      )
    `;
  } catch {
    /* anchor best-effort — webhook notes still enable recovery */
  }

  return {
    ok: true,
    orderId: razorpayOrderId,
    keyId: env.RAZORPAY_KEY_ID || "dummy_key",
    amount: amountPaise,
    currency,
    dummy: dummyModeActive,
  };
}

/**
 * Server-authoritative finalization for a direct-online ride fare, called by the
 * Razorpay webhook and the reconciler. Reuses the SAME canonical finalizer
 * (confirmRideFarePaymentForCustomer) via a synthesized signature — no second
 * settlement algorithm. Idempotent: an already-paid ride returns idempotent ok;
 * a gateway amount/verification failure never settles.
 */
export async function finalizeRideFarePaymentFromWebhook(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amountPaise?: number;
  notes?: Record<string, unknown> | null;
  source?: string;
}): Promise<{ ok: boolean; idempotent?: boolean; code?: string; amountPaid?: number }> {
  const razorpayOrderId = args.razorpayOrderId?.trim() ?? "";
  const razorpayPaymentId = args.razorpayPaymentId?.trim() ?? "";
  const source = args.source ?? "webhook";
  if (!razorpayOrderId || !razorpayPaymentId) return { ok: false, code: "INVALID_PAYLOAD" };

  // Resolve the ride + customer from webhook notes, else from the durable anchor.
  let orderRef = args.notes ? String(args.notes.business_order_id ?? args.notes.businessOrderId ?? "") : "";
  let customerSub = args.notes ? String(args.notes.customer_id ?? args.notes.customerId ?? "") : "";
  if (!orderRef || !customerSub) {
    const sqlc = getSql();
    const rows = await sqlc<Array<{ order_id: string | null; payload: Record<string, unknown> | null }>>`
      SELECT order_id, payload FROM payment_events
      WHERE razorpay_order_id = ${razorpayOrderId} AND event_type = 'RIDE_FARE_PAYMENT_INITIATED'
      ORDER BY created_at DESC LIMIT 1
    `;
    const p = (rows[0]?.payload ?? {}) as Record<string, unknown>;
    if (!orderRef) orderRef = String(rows[0]?.order_id ?? p.business_order_id ?? "");
    if (!customerSub) customerSub = String(p.customer_sub ?? "");
  }
  if (!orderRef || !customerSub) return { ok: false, code: "ANCHOR_NOT_FOUND" };

  const synthesizedSignature = createHmac("sha256", getEnv().RAZORPAY_KEY_SECRET ?? "")
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  try {
    const res = await confirmRideFarePaymentForCustomer({
      customerSub,
      orderRef,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: synthesizedSignature,
    });
    return { ok: true, idempotent: false, amountPaid: res.amountPaid, code: source };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    const message = (err as Error)?.message ?? "";
    if (statusCode === 409 && /already paid/i.test(message)) {
      return { ok: true, idempotent: true };
    }
    // Amount / gateway verification failure — never settle; caller escalates.
    if (statusCode === 400) return { ok: false, code: "AMOUNT_OR_VERIFY_FAILED" };
    return { ok: false, code: "SETTLE_FAILED" };
  }
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
