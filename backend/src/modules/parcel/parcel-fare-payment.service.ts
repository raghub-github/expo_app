/**
 * Parcel fare payment — customer can pay online (UPI / GatiCash) even if they
 * booked cash/COD. Rider cash confirm is a separate path that also marks paid.
 */

import { eq } from "drizzle-orm";
import { getDb, getSql } from "../../db/client.js";
import {
  debitCustomerGatiCashForRideFare,
  getCustomerGatiCashAvailable,
} from "../../lib/checkout-gaticash-wallet-ops.js";
import {
  generateGatiCashTxnId,
  isModernGatiCashTxnId,
  readStoredGatiCashTxnId,
} from "../../lib/gaticash-txn-id.js";
import { customers, ordersCore, ordersParcel } from "../../db/schema.js";
import { customerOrderRefWhere } from "../../lib/order-ref-resolve.js";
import { normalizeCustomerOrderStatus } from "../../lib/customer-order-status-resolve.js";

function isParcelNonPayableTerminal(status: string): boolean {
  const s = String(status ?? "").toUpperCase();
  return s === "CANCELLED" || s === "FAILED" || s === "PAYMENT_FAILED";
}
import {
  verifyRazorpaySignature,
  verifyRazorpayPaymentDetails,
} from "../../services/payment/razorpayService.js";

function roundInr(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function isPaymentPending(paymentStatus?: string | null): boolean {
  const ps = String(paymentStatus ?? "")
    .trim()
    .toLowerCase();
  return ps !== "paid" && ps !== "completed" && ps !== "captured";
}

function resolveParcelPayable(row: {
  grandTotal?: string | null;
  fareAmount?: string | null;
  finalFare?: string | null;
  estimatedFare?: string | null;
  billingSnapshot?: unknown;
}): number {
  const snap =
    row.billingSnapshot != null && typeof row.billingSnapshot === "object"
      ? (row.billingSnapshot as Record<string, unknown>)
      : {};
  const candidates = [
    Number(row.grandTotal),
    Number(row.finalFare),
    Number(snap.final_amount),
    Number(snap.parcel_fare),
    Number(row.estimatedFare),
    Number(row.fareAmount),
  ];
  for (const n of candidates) {
    if (Number.isFinite(n) && n > 0) return roundInr(n);
  }
  return 0;
}

function snapNum(snap: Record<string, unknown>, key: string): number {
  const n = Number(snap[key]);
  return Number.isFinite(n) ? roundInr(n) : 0;
}

export type ParcelFareBillLine = {
  key: string;
  label: string;
  amount: number;
  kind: "fare" | "charge" | "waiting" | "tax" | "discount" | "total";
};

/**
 * Customer-facing parcel fare breakdown from billing_snapshot (+ payable total).
 *
 * PLATFORM_FEE rules use the admin name on charges[].label (seeded as "Booking fee")
 * AND also fill platform_fee. Never show both "Platform fee" and "Booking fee".
 */
export function buildParcelFareBillBreakdown(input: {
  billingSnapshot?: unknown;
  finalAmount: number;
  parcelFareFallback?: number;
}): {
  parcelFare: number;
  waitingCharge: number;
  platformFee: number;
  convenienceFee: number;
  surgeFee: number;
  smallOrderFee: number;
  miscFee: number;
  taxTotal: number;
  discountTotal: number;
  finalAmount: number;
  lines: ParcelFareBillLine[];
  taxes: Array<{ label: string; amount: number }>;
  discounts: Array<{ label: string; amount: number }>;
} {
  const snap =
    input.billingSnapshot != null && typeof input.billingSnapshot === "object"
      ? (input.billingSnapshot as Record<string, unknown>)
      : {};
  const finalAmount = roundInr(input.finalAmount);

  const parcelFare = Math.max(
    0,
    snapNum(snap, "parcel_fare") ||
      snapNum(snap, "fare_amount") ||
      snapNum(snap, "item_total") ||
      roundInr(input.parcelFareFallback ?? 0) ||
      finalAmount
  );

  let waitingCharge = Math.max(
    0,
    snapNum(snap, "waiting_charge") ||
      snapNum(snap, "waitingCharge") ||
      snapNum(snap, "pickup_waiting_charge")
  );
  const platformFee = Math.max(0, snapNum(snap, "platform_fee"));
  const convenienceFee = Math.max(0, snapNum(snap, "convenience_fee"));
  const surgeFee = Math.max(0, snapNum(snap, "surge_fee"));
  const smallOrderFee = Math.max(0, snapNum(snap, "small_order_fee"));
  const miscFee = Math.max(0, snapNum(snap, "misc_fee"));
  let taxTotal = Math.max(0, snapNum(snap, "tax_total"));
  let discountTotal = Math.max(0, snapNum(snap, "discount_total"));

  // Prefer admin rule names from charges[] (Booking fee, Waiting charge, …).
  let bookingFeeLabel = "Booking fee";
  let bookingFeeFromCharge = 0;
  let convenienceLabel = "Convenience fee";
  let surgeLabel = "Surge fee";
  let smallOrderLabel = "Small order fee";
  const otherChargeLines: Array<{ label: string; amount: number }> = [];

  if (Array.isArray(snap.charges)) {
    for (const raw of snap.charges) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as {
        label?: unknown;
        amount?: unknown;
        kind?: string;
        hidden?: boolean;
        type?: string;
        ruleType?: string;
        subtype?: string;
        meta?: Record<string, unknown>;
      };
      if (row.hidden) continue;
      if (row.kind === "tax" || row.kind === "discount") continue;
      const amount = roundInr(Number(row.amount) || 0);
      if (amount <= 0.005) continue;
      const label = String(row.label ?? "").trim() || "Charge";
      const labelLower = label.toLowerCase();
      const typeHint = String(
        row.type ?? row.ruleType ?? row.subtype ?? row.meta?.ruleType ?? ""
      ).toUpperCase();

      const isWaiting =
        typeHint.includes("WAIT") ||
        labelLower.includes("waiting") ||
        labelLower.includes("wait charge");
      if (isWaiting) {
        if (waitingCharge <= 0.005) waitingCharge = amount;
        continue;
      }

      const isPlatformOrBooking =
        typeHint === "PLATFORM_FEE" ||
        labelLower.includes("platform") ||
        labelLower.includes("booking");
      if (isPlatformOrBooking) {
        bookingFeeLabel = labelLower.includes("platform") ? "Booking fee" : label;
        bookingFeeFromCharge = amount;
        continue;
      }

      if (typeHint === "CONVENIENCE_FEE" || labelLower.includes("convenience")) {
        convenienceLabel = label;
        continue;
      }
      if (typeHint === "SURGE" || typeHint === "SURGE_FEE" || labelLower.includes("surge")) {
        surgeLabel = label;
        continue;
      }
      if (typeHint === "SMALL_ORDER_FEE" || labelLower.includes("small order")) {
        smallOrderLabel = label;
        continue;
      }
      if (
        labelLower.includes("parcel fare") ||
        labelLower.includes("courier fare") ||
        labelLower === "fare"
      ) {
        continue;
      }
      otherChargeLines.push({ label, amount });
    }
  }

  const bookingFee = Math.max(platformFee, bookingFeeFromCharge);

  const taxes: Array<{ label: string; amount: number }> = [];
  if (Array.isArray(snap.taxes)) {
    for (const raw of snap.taxes) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as { label?: unknown; amount?: unknown; hidden?: boolean };
      if (row.hidden) continue;
      const amount = roundInr(Number(row.amount) || 0);
      if (amount <= 0.005) continue;
      taxes.push({
        label: String(row.label ?? "Tax").trim() || "Tax",
        amount,
      });
    }
  }
  if (taxes.length === 0 && taxTotal > 0.005) {
    taxes.push({ label: "GST / Tax", amount: taxTotal });
  } else if (taxes.length > 0) {
    taxTotal = roundInr(taxes.reduce((s, t) => s + t.amount, 0));
  }

  const discounts: Array<{ label: string; amount: number }> = [];
  if (Array.isArray(snap.discounts)) {
    for (const raw of snap.discounts) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as { label?: unknown; amount?: unknown; hidden?: boolean };
      if (row.hidden) continue;
      const amount = Math.abs(roundInr(Number(row.amount) || 0));
      if (amount <= 0.005) continue;
      discounts.push({
        label: String(row.label ?? "Discount").trim() || "Discount",
        amount,
      });
    }
  }
  if (discounts.length === 0 && discountTotal > 0.005) {
    discounts.push({ label: "Discount", amount: discountTotal });
  } else if (discounts.length > 0) {
    discountTotal = roundInr(discounts.reduce((s, d) => s + d.amount, 0));
  }

  const lines: ParcelFareBillLine[] = [];
  if (parcelFare > 0.005) {
    lines.push({ key: "parcel_fare", label: "Courier fare", amount: parcelFare, kind: "fare" });
  }
  if (waitingCharge > 0.005) {
    lines.push({
      key: "waiting",
      label: "Waiting charges",
      amount: waitingCharge,
      kind: "waiting",
    });
  }
  // Single line only — never "Platform fee" + "Booking fee".
  if (bookingFee > 0.005) {
    lines.push({
      key: "booking_fee",
      label: bookingFeeLabel || "Booking fee",
      amount: bookingFee,
      kind: "charge",
    });
  }
  if (convenienceFee > 0.005) {
    lines.push({
      key: "convenience_fee",
      label: convenienceLabel,
      amount: convenienceFee,
      kind: "charge",
    });
  }
  if (surgeFee > 0.005) {
    lines.push({ key: "surge_fee", label: surgeLabel, amount: surgeFee, kind: "charge" });
  }
  if (smallOrderFee > 0.005) {
    lines.push({
      key: "small_order_fee",
      label: smallOrderLabel,
      amount: smallOrderFee,
      kind: "charge",
    });
  }
  if (miscFee > 0.005) {
    lines.push({ key: "misc_fee", label: "Other charges", amount: miscFee, kind: "charge" });
  }
  for (const [i, c] of otherChargeLines.entries()) {
    lines.push({
      key: `charge_${i}`,
      label: c.label,
      amount: c.amount,
      kind: "charge",
    });
  }
  for (const [i, t] of taxes.entries()) {
    lines.push({
      key: `tax_${i}`,
      label: t.label,
      amount: t.amount,
      kind: "tax",
    });
  }
  for (const [i, d] of discounts.entries()) {
    lines.push({
      key: `discount_${i}`,
      label: d.label,
      amount: d.amount,
      kind: "discount",
    });
  }
  lines.push({ key: "total", label: "Total fare", amount: finalAmount, kind: "total" });

  return {
    parcelFare,
    waitingCharge,
    platformFee: bookingFee,
    convenienceFee,
    surgeFee,
    smallOrderFee,
    miscFee,
    taxTotal,
    discountTotal,
    finalAmount,
    lines,
    taxes,
    discounts,
  };
}

export async function getParcelFareBillForCustomer(input: {
  customerSub: string;
  orderRef: string;
}): Promise<
  | {
      ok: true;
      orderCoreId: number;
      orderIdText: string;
      finalAmount: number;
      parcelFare: number;
      waitingCharge: number;
      platformFee: number;
      convenienceFee: number;
      surgeFee: number;
      smallOrderFee: number;
      miscFee: number;
      taxTotal: number;
      discountTotal: number;
      lines: ParcelFareBillLine[];
      taxes: Array<{ label: string; amount: number }>;
      discounts: Array<{ label: string; amount: number }>;
      paymentMethod: string | null;
      payAt: "pickup" | "drop" | null;
    }
  | { ok: false; statusCode: number; code: string; message: string }
> {
  const db = getDb();
  const [customerRow] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerId, input.customerSub))
    .limit(1);
  const customerPk = customerRow?.id ?? null;
  if (customerPk == null) {
    return { ok: false, statusCode: 403, code: "customer_not_found", message: "Customer not found" };
  }

  const [orderRow] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      orderType: ordersCore.orderType,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      grandTotal: ordersCore.grandTotal,
      fareAmount: ordersCore.fareAmount,
      paymentStatus: ordersCore.paymentStatus,
      paymentMethod: ordersCore.paymentMethod,
      billingSnapshot: ordersCore.billingSnapshot,
      finalFare: ordersParcel.finalFare,
      estimatedFare: ordersParcel.estimatedFare,
      payAt: ordersParcel.payAt,
      cashCollectedAt: ordersParcel.cashCollectedAt,
      pickupLat: ordersParcel.pickupLat,
      pickupLon: ordersParcel.pickupLon,
      tripDistanceKm: ordersParcel.tripDistanceKm,
      vehicleCategory: ordersParcel.vehicleCategory,
      parcelPaymentMethod: ordersParcel.paymentMethod,
      couponCode: ordersParcel.couponCode,
      platformOfferId: ordersParcel.platformOfferId,
    })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(customerOrderRefWhere(customerPk, input.orderRef))
    .limit(1);

  if (!orderRow?.id) {
    return { ok: false, statusCode: 404, code: "order_not_found", message: "Order not found" };
  }
  if (String(orderRow.orderType ?? "") !== "parcel") {
    return { ok: false, statusCode: 400, code: "not_parcel", message: "Not a parcel order" };
  }

  const status = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
  if (isParcelNonPayableTerminal(status)) {
    return { ok: false, statusCode: 409, code: "order_terminal", message: "Parcel is no longer payable" };
  }

  if (!isPaymentPending(orderRow.paymentStatus) || orderRow.cashCollectedAt != null) {
    return { ok: false, statusCode: 409, code: "already_paid", message: "Parcel fare is already paid" };
  }

  const rawPayAt = String(orderRow.payAt ?? "").trim().toLowerCase();
  const payAt = rawPayAt === "drop" || rawPayAt === "pickup" ? rawPayAt : null;

  // Live recompute so newly activated GST / booking rules apply even if the order
  // was placed when those TAX rows were inactive or rate was still 0.
  const prevSnap =
    orderRow.billingSnapshot != null && typeof orderRow.billingSnapshot === "object"
      ? (orderRow.billingSnapshot as Record<string, unknown>)
      : {};
  const slabFare = Math.max(
    0,
    roundInr(
      Number(prevSnap.parcel_fare) ||
        Number(orderRow.fareAmount) ||
        Number(orderRow.estimatedFare) ||
        Number(orderRow.finalFare) ||
        0
    )
  );
  const pickupLat = Number(orderRow.pickupLat);
  const pickupLng = Number(orderRow.pickupLon);
  const distanceKm = Math.max(0, Number(orderRow.tripDistanceKm) || 0);
  let billingSnapshot: Record<string, unknown> = { ...prevSnap };
  let finalAmount = resolveParcelPayable(orderRow);

  if (
    slabFare > 0.005 &&
    Number.isFinite(pickupLat) &&
    Number.isFinite(pickupLng)
  ) {
    try {
      const { computeBillForParcel, enrichParcelBillingSnapshot } = await import(
        "../billing/parcelBilling.service.js"
      );
      const forceNoAutoOffer = prevSnap.parcel_force_no_auto_offer === true;
      const selectedOfferId =
        orderRow.platformOfferId != null && Number(orderRow.platformOfferId) > 0
          ? Number(orderRow.platformOfferId)
          : typeof prevSnap.parcel_platform_offer_id === "number"
            ? Number(prevSnap.parcel_platform_offer_id)
            : null;
      const bill = await computeBillForParcel(db, {
        customerId: customerPk,
        parcelFare: slabFare,
        distanceKm,
        pickupLat,
        pickupLng,
        couponCode: orderRow.couponCode?.trim() || null,
        selectedPlatformOfferId: forceNoAutoOffer ? null : selectedOfferId,
        forceNoAutoOffer,
        vehicleType: orderRow.vehicleCategory?.trim() || null,
        paymentMode:
          orderRow.parcelPaymentMethod?.trim() || orderRow.paymentMethod?.trim() || null,
      });
      if (bill.ok) {
        finalAmount = roundInr(Number(bill.billing.final_amount) || 0);
        billingSnapshot = enrichParcelBillingSnapshot(bill.snapshot, {
          parcelFare: slabFare,
          distanceKm,
        });
        if (selectedOfferId != null && selectedOfferId > 0) {
          billingSnapshot.parcel_platform_offer_id = selectedOfferId;
        }
        if (forceNoAutoOffer) {
          billingSnapshot.parcel_force_no_auto_offer = true;
        }
        // Live customer-bill recompute must not wipe the rider accept/settlement
        // payout freeze (dispatch offer + pay-after-complete SSOT).
        for (const key of [
          "rider_payout_snapshot",
          "customer_fare",
          "platform_revenue",
          "rider_percentage_effective",
        ] as const) {
          if (billingSnapshot[key] == null && prevSnap[key] != null) {
            billingSnapshot[key] = prevSnap[key];
          }
        }
        // Persist so rider collect + subsequent polls share the same payable.
        const now = new Date();
        await db
          .update(ordersCore)
          .set({
            grandTotal: String(finalAmount),
            billingSnapshot,
            updatedAt: now,
          })
          .where(eq(ordersCore.id, orderRow.id));
        await db
          .update(ordersParcel)
          .set({
            finalFare: String(finalAmount),
            updatedAt: now,
          })
          .where(eq(ordersParcel.orderId, orderRow.id));
      }
    } catch (err) {
      console.warn(
        "[getParcelFareBillForCustomer] live recompute failed; using stored snapshot",
        (err as Error)?.message ?? err
      );
    }
  }

  if (!(finalAmount > 0)) {
    return { ok: false, statusCode: 409, code: "fare_unavailable", message: "Parcel fare is unavailable" };
  }

  const breakdown = buildParcelFareBillBreakdown({
    billingSnapshot,
    finalAmount,
    parcelFareFallback: slabFare || Number(orderRow.finalFare ?? orderRow.estimatedFare ?? 0),
  });

  return {
    ok: true,
    orderCoreId: orderRow.id,
    orderIdText: orderRow.orderId?.trim() || String(orderRow.id),
    finalAmount: breakdown.finalAmount,
    parcelFare: breakdown.parcelFare,
    waitingCharge: breakdown.waitingCharge,
    platformFee: breakdown.platformFee,
    convenienceFee: breakdown.convenienceFee,
    surgeFee: breakdown.surgeFee,
    smallOrderFee: breakdown.smallOrderFee,
    miscFee: breakdown.miscFee,
    taxTotal: breakdown.taxTotal,
    discountTotal: breakdown.discountTotal,
    lines: breakdown.lines,
    taxes: breakdown.taxes,
    discounts: breakdown.discounts,
    paymentMethod: orderRow.paymentMethod ?? null,
    payAt,
  };
}

export async function confirmParcelFarePaymentForCustomer(input: {
  customerSub: string;
  orderRef: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  gatiCashAmount?: number;
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
      fareAmount: ordersCore.fareAmount,
      paymentStatus: ordersCore.paymentStatus,
      paymentMethod: ordersCore.paymentMethod,
      billingSnapshot: ordersCore.billingSnapshot,
      finalFare: ordersParcel.finalFare,
      estimatedFare: ordersParcel.estimatedFare,
      cashCollectedAt: ordersParcel.cashCollectedAt,
      payAt: ordersParcel.payAt,
    })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(customerOrderRefWhere(customerPk, input.orderRef))
    .limit(1);

  if (!orderRow?.id) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }
  if (String(orderRow.orderType ?? "") !== "parcel") {
    throw Object.assign(new Error("Not a parcel order"), { statusCode: 400 });
  }

  const status = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
  if (isParcelNonPayableTerminal(status)) {
    throw Object.assign(new Error("Parcel is no longer payable"), { statusCode: 409 });
  }

  if (!isPaymentPending(orderRow.paymentStatus) || orderRow.cashCollectedAt != null) {
    throw Object.assign(new Error("Parcel fare is already paid"), { statusCode: 409 });
  }

  // Prefer live bill (GST / booking rules) so confirm matches checkout payable.
  const liveBill = await getParcelFareBillForCustomer({
    customerSub: input.customerSub,
    orderRef: input.orderRef,
  });
  const fareDue = liveBill.ok ? liveBill.finalAmount : resolveParcelPayable(orderRow);
  if (!(fareDue > 0)) {
    throw Object.assign(new Error("Parcel fare is already paid"), { statusCode: 409 });
  }

  const requestedGatiCash = roundInr(input.gatiCashAmount ?? 0);
  const hasRazorpay = Boolean(
    input.razorpayOrderId?.trim() &&
      input.razorpayPaymentId?.trim() &&
      input.razorpaySignature?.trim()
  );

  if (requestedGatiCash <= 0.005 && !hasRazorpay) {
    throw Object.assign(new Error("Payment details are required"), { statusCode: 400 });
  }

  const sql = getSql();
  const walletAvailable =
    requestedGatiCash > 0.005 ? await getCustomerGatiCashAvailable(sql, customerPk) : 0;
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
    }
  }

  const now = new Date();
  const prevSnap =
    orderRow.billingSnapshot != null && typeof orderRow.billingSnapshot === "object"
      ? (orderRow.billingSnapshot as Record<string, unknown>)
      : {};
  const orderIdText = orderRow.orderId?.trim() || String(orderRow.id);
  const paymentMethodLabel =
    razorpayDue > 0.005 ? "online" : gatiCashApplied > 0.005 ? "wallet" : "online";
  const razorpayPaymentId = input.razorpayPaymentId?.trim() || null;
  const razorpayOrderId = input.razorpayOrderId?.trim() || null;

  // Stable capture key so retries do not insert duplicate payment rows.
  // Prefer Razorpay payment id; else reuse stored GatiCash txn; else parcel_fare:<coreId>.
  const storedGc = readStoredGatiCashTxnId(prevSnap);
  const gatiCashTxnId =
    gatiCashApplied > 0.005
      ? storedGc && isModernGatiCashTxnId(storedGc)
        ? storedGc
        : generateGatiCashTxnId()
      : null;
  const captureTxnId = razorpayPaymentId || gatiCashTxnId || `parcel_fare:${orderRow.id}`;

  const gatewayPayload = JSON.stringify({
    source: "parcel_customer_fare",
    razorpayPaymentId,
    razorpayOrderId,
    gatiCashApplied,
    gatiCashTxnId,
    amountPaid: fareDue,
    payAt: orderRow.payAt ?? null,
  });

  // Single SQL transaction: lock → debit (idempotent) → mark paid → capture row.
  await sql.begin(async (tx) => {
    const locked = await tx<{ payment_status: string | null }[]>`
      SELECT payment_status
      FROM orders_core
      WHERE id = ${orderRow.id}
      FOR UPDATE
    `;
    if (!isPaymentPending(locked[0]?.payment_status)) {
      return;
    }

    // Existing capture for this txn → heal paid flags and exit (webhook / double-tap).
    const priorPay = await tx<{ id: number }[]>`
      SELECT id FROM orders_core_payments
      WHERE transaction_id = ${captureTxnId}
      LIMIT 1
    `;
    if (priorPay.length > 0) {
      await tx`
        UPDATE orders_core
        SET payment_status = 'completed',
            payment_method = ${paymentMethodLabel},
            grand_total = ${String(fareDue)},
            updated_at = ${now}
        WHERE id = ${orderRow.id}
      `;
      await tx`
        UPDATE orders_parcel
        SET cash_collected_at = COALESCE(cash_collected_at, ${now}),
            amount_collected = ${String(fareDue)},
            final_fare = ${String(fareDue)},
            payment_method = ${paymentMethodLabel},
            is_cod = false,
            updated_at = ${now}
        WHERE order_id = ${orderRow.id}
      `;
      return;
    }

    if (gatiCashApplied > 0.005 && gatiCashTxnId) {
      // TransactionSql is structurally compatible with Sql for tagged templates.
      await debitCustomerGatiCashForRideFare(tx as unknown as typeof sql, {
        customerInternalId: customerPk,
        orderIdText,
        amount: gatiCashApplied,
        gatiCashTxnId,
        source: "parcel_fare_payment",
        note: "GatiCash applied on parcel fare",
      });
    }

    const nextSnap = {
      ...prevSnap,
      final_amount: fareDue,
      parcel_fare_paid_at: now.toISOString(),
      parcel_fare_paid_method: paymentMethodLabel,
      ...(gatiCashApplied > 0.005 ? { gatiCashAmount: gatiCashApplied } : {}),
      ...(gatiCashTxnId ? { gatiCashTxnId } : {}),
    };
    const snapText = JSON.stringify(nextSnap);

    await tx`
      UPDATE orders_core
      SET payment_status = 'completed',
          payment_method = ${paymentMethodLabel},
          grand_total = ${String(fareDue)},
          billing_snapshot = ${snapText}::text::jsonb,
          updated_at = ${now}
      WHERE id = ${orderRow.id}
    `;

    await tx`
      UPDATE orders_parcel
      SET cash_collected_at = ${now},
          amount_collected = ${String(fareDue)},
          final_fare = ${String(fareDue)},
          payment_method = ${paymentMethodLabel},
          is_cod = false,
          updated_at = ${now}
      WHERE order_id = ${orderRow.id}
    `;

    try {
      await tx`
        INSERT INTO orders_core_payments (
          order_id, payment_gateway, payment_method, transaction_id,
          amount, currency, payment_status, gateway_response, paid_at
        ) VALUES (
          ${orderIdText},
          ${razorpayPaymentId ? "razorpay" : gatiCashApplied > 0.005 ? "gati_cash" : "parcel_fare"},
          ${razorpayPaymentId ? "UPI" : gatiCashApplied > 0.005 ? "WALLET" : "ONLINE"},
          ${captureTxnId},
          ${String(fareDue)},
          'INR',
          'PAID',
          ${gatewayPayload}::text::jsonb,
          ${now}
        )
      `;
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (!/duplicate key|unique constraint/i.test(msg)) throw err;
      // Concurrent insert won — order rows already updated above.
    }
  });

  return { ok: true, amountPaid: fareDue };
}

/**
 * Create the Razorpay order for an in-app parcel fare payment and durably anchor
 * it in payment_events (PARCEL_FARE_PAYMENT_INITIATED), exactly like the ride
 * fare. Without the anchor a capture whose client callback was lost (app killed,
 * network drop) could never be finalized: the customer was charged and the parcel
 * stayed unpaid. The amount is computed here — the client's is never trusted.
 */
export async function createParcelFarePaymentOrder(input: {
  customerSub: string;
  orderRef: string;
  /** GatiCash the customer chose to apply; the gateway charges the rest. */
  gatiCashAmount?: number;
}): Promise<
  | { ok: true; orderId: string; keyId: string; amount: number; currency: string; dummy: boolean }
  | { ok: false; statusCode: number; code: string; message: string }
> {
  const { getEnv } = await import("../../config/env.js");
  const { createRazorpayOrder } = await import("../../services/payment/razorpayService.js");
  const env = getEnv();

  const bill = await getParcelFareBillForCustomer({
    customerSub: input.customerSub,
    orderRef: input.orderRef,
  });
  if (!bill.ok) {
    return { ok: false, statusCode: bill.statusCode, code: bill.code, message: bill.message };
  }

  const db = getDb();
  const [orderRow] = await db
    .select({
      customerId: ordersCore.customerId,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      paymentStatus: ordersCore.paymentStatus,
      cashCollectedAt: ordersParcel.cashCollectedAt,
    })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(eq(ordersCore.id, bill.orderCoreId))
    .limit(1);
  if (!orderRow) {
    return { ok: false, statusCode: 404, code: "ORDER_NOT_FOUND", message: "Order not found" };
  }
  if (isParcelNonPayableTerminal(normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status))) {
    return { ok: false, statusCode: 409, code: "NOT_PAYABLE", message: "Parcel is no longer payable" };
  }
  if (!isPaymentPending(orderRow.paymentStatus) || orderRow.cashCollectedAt != null) {
    return { ok: false, statusCode: 409, code: "ALREADY_PAID", message: "Parcel fare is already paid" };
  }

  const fareDue = roundInr(bill.finalAmount);
  if (!(fareDue > 0.005)) {
    return { ok: false, statusCode: 409, code: "ZERO_PAYABLE", message: "No online fare payable" };
  }
  const requestedGatiCash = roundInr(input.gatiCashAmount ?? 0);
  const gatiCashAvailable =
    requestedGatiCash > 0.005 && orderRow.customerId != null
      ? await getCustomerGatiCashAvailable(getSql(), Number(orderRow.customerId))
      : 0;
  const gatiCashApplied = roundInr(Math.min(requestedGatiCash, gatiCashAvailable, fareDue));
  const gatewayDue = roundInr(fareDue - gatiCashApplied);
  if (!(gatewayDue > 0.005)) {
    return { ok: false, statusCode: 409, code: "ZERO_PAYABLE", message: "Covered by GatiCash — no online payment needed" };
  }
  const amountPaise = Math.round(gatewayDue * 100);

  const dummyModeActive = env.PAYMENT_DUMMY_MODE || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET;
  let razorpayOrderId: string;
  let currency = "INR";
  if (dummyModeActive) {
    if (!env.PAYMENT_DUMMY_MODE && env.NODE_ENV !== "development") {
      return { ok: false, statusCode: 503, code: "GATEWAY_NOT_CONFIGURED", message: "Razorpay not configured" };
    }
    razorpayOrderId = `dummy_parcel_${bill.orderIdText}_${Date.now()}`;
  } else {
    const order = await createRazorpayOrder({
      amount: amountPaise,
      currency: "INR",
      receipt: `parcel_${bill.orderIdText}_${Date.now()}`.slice(0, 40),
      notes: {
        purpose: "parcel_fare",
        business_order_id: bill.orderIdText,
        customer_id: input.customerSub,
        gaticash_amount: String(gatiCashApplied),
      },
    });
    razorpayOrderId = order.id;
    currency = order.currency;
  }

  try {
    await getSql()`
      INSERT INTO payment_events (
        razorpay_order_id, order_id, event_type, source, amount_paise, currency, payload
      ) VALUES (
        ${razorpayOrderId}, ${bill.orderIdText}, 'PARCEL_FARE_PAYMENT_INITIATED', 'client', ${amountPaise}, ${currency},
        ${JSON.stringify({
          flow: "parcel_fare",
          business_order_id: bill.orderIdText,
          order_core_id: bill.orderCoreId,
          customer_sub: input.customerSub,
          fare_inr: fareDue,
          gaticash_amount: gatiCashApplied,
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
 * Server-side finalization of an in-app parcel fare payment, for the Razorpay
 * webhook and the reconciler. Reuses confirmParcelFarePaymentForCustomer (the
 * same finalizer as the client callback) via a synthesized signature, which still
 * fetches and amount-checks the payment at Razorpay. Idempotent.
 */
export async function finalizeParcelFarePaymentFromWebhook(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  notes?: Record<string, unknown> | null;
  source?: string;
}): Promise<{ ok: boolean; idempotent?: boolean; code?: string; amountPaid?: number }> {
  const razorpayOrderId = args.razorpayOrderId?.trim() ?? "";
  const razorpayPaymentId = args.razorpayPaymentId?.trim() ?? "";
  if (!razorpayOrderId || !razorpayPaymentId) return { ok: false, code: "INVALID_PAYLOAD" };

  let orderRef = args.notes ? String(args.notes.business_order_id ?? "") : "";
  let customerSub = args.notes ? String(args.notes.customer_id ?? "") : "";
  let gatiCash = args.notes ? Number(args.notes.gaticash_amount ?? 0) : 0;
  if (!orderRef || !customerSub) {
    const rows = await getSql()<Array<{ order_id: string | null; payload: Record<string, unknown> | null }>>`
      SELECT order_id, payload FROM payment_events
      WHERE razorpay_order_id = ${razorpayOrderId} AND event_type = 'PARCEL_FARE_PAYMENT_INITIATED'
      ORDER BY created_at DESC LIMIT 1
    `;
    const p = (rows[0]?.payload ?? {}) as Record<string, unknown>;
    if (!orderRef) orderRef = String(rows[0]?.order_id ?? p.business_order_id ?? "");
    if (!customerSub) customerSub = String(p.customer_sub ?? "");
    if (!(gatiCash > 0)) gatiCash = Number(p.gaticash_amount ?? 0);
  }
  if (!orderRef || !customerSub) return { ok: false, code: "ANCHOR_NOT_FOUND" };

  const { createHmac } = await import("node:crypto");
  const { getEnv } = await import("../../config/env.js");
  const synthesizedSignature = createHmac("sha256", getEnv().RAZORPAY_KEY_SECRET ?? "")
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  try {
    const res = await confirmParcelFarePaymentForCustomer({
      customerSub,
      orderRef,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: synthesizedSignature,
      gatiCashAmount: Number.isFinite(gatiCash) && gatiCash > 0 ? gatiCash : undefined,
    });
    return { ok: true, idempotent: false, amountPaid: res.amountPaid, code: args.source ?? "webhook" };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    const message = (err as Error)?.message ?? "";
    if (statusCode === 409 && /already paid/i.test(message)) return { ok: true, idempotent: true };
    if (statusCode === 400) return { ok: false, code: "AMOUNT_OR_VERIFY_FAILED" };
    return { ok: false, code: "SETTLE_FAILED" };
  }
}
