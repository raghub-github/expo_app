import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { ordersCore, ordersRide } from "../../db/schema.js";
import { customerOrderRefWhere } from "../../lib/order-ref-resolve.js";
import { normalizeCustomerOrderStatus } from "../../lib/customer-order-status-resolve.js";
import { computeBillForRide } from "../billing/rideBilling.service.js";
import type { BillingResult } from "../billing/types.js";
import type { AppliedLine } from "../billing/types.js";
import { resolveInvoiceDiscounts } from "./ride-invoice-summary.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function billNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function resolveRideBaseFare(order: {
  fareAmount: string | null;
  itemTotal: string | null;
  billingSnapshot: unknown;
}): number {
  const snap =
    order.billingSnapshot != null && typeof order.billingSnapshot === "object"
      ? (order.billingSnapshot as Record<string, unknown>)
      : {};
  const fromSnap =
    billNum(snap.ride_fare) ||
    billNum(snap.fare_amount) ||
    billNum(snap.item_total);
  if (fromSnap > 0) return Math.round(fromSnap * 100) / 100;
  const fromCore = billNum(order.fareAmount) || billNum(order.itemTotal);
  return fromCore > 0 ? Math.round(fromCore * 100) / 100 : 0;
}

function mergeBillingIntoSnapshot(
  billing: BillingResult,
  baseSnapshot: Record<string, unknown>,
  prevSnap: Record<string, unknown>,
  extras?: {
    pickupWaitingCharge?: number;
    pickupWaitSeconds?: number;
  }
): Record<string, unknown> {
  let charges: AppliedLine[] = [...(billing.charges ?? [])];
  const waiting = Math.max(0, extras?.pickupWaitingCharge ?? 0);
  let finalAmount = round2(billing.final_amount);

  if (waiting > 0) {
    const hasWaiting = charges.some((row) =>
      String(row.label ?? "").toLowerCase().includes("waiting")
    );
    if (!hasWaiting) {
      charges.push({
        kind: "charge",
        label: "Waiting charges",
        amount: waiting,
      });
      finalAmount = round2(finalAmount + waiting);
    }
  }

  return {
    ...baseSnapshot,
    ride_fare: billing.item_total,
    fare_amount: billing.item_total,
    item_total: billing.item_total,
    items_net_after_discounts: billing.items_net_after_discounts,
    platform_fee: billing.platform_fee,
    convenience_fee: billing.convenience_fee,
    tax_total: billing.tax_total,
    discount_total: billing.discount_total,
    tip_amount: billing.tip_amount,
    charges,
    taxes: billing.taxes,
    discounts: billing.discounts,
    gst_components: billing.gst_components,
    ruleset_version: billing.ruleset_version,
    final_amount: finalAmount,
    ...(waiting > 0
      ? {
          waiting_charge: waiting,
          pickup_waiting_charge: waiting,
          pickup_wait_seconds: extras?.pickupWaitSeconds ?? prevSnap.pickup_wait_seconds,
        }
      : {}),
    ride_fare_coupon_code: prevSnap.ride_fare_coupon_code,
    ride_fare_platform_offer_id: prevSnap.ride_fare_platform_offer_id,
    ride_fare_offer_discount: prevSnap.ride_fare_offer_discount,
    ride_fare_paid_at: prevSnap.ride_fare_paid_at,
    gatiCashAmount: prevSnap.gatiCashAmount,
  };
}

/** Recompute ride customer bill from billing rules + persist to orders_core (single source of truth). */
export async function syncRideCustomerBillingSnapshot(
  db: PostgresJsDatabase<Record<string, unknown>>,
  orderCorePk: number,
  opts?: {
    pickupWaitingCharge?: number;
    pickupWaitSeconds?: number;
    couponCode?: string | null;
    platformOfferId?: number | null;
    skipIfPaid?: boolean;
  }
): Promise<{ ok: true; finalAmount: number } | { ok: false }> {
  const [row] = await db
    .select({
      id: ordersCore.id,
      customerId: ordersCore.customerId,
      fareAmount: ordersCore.fareAmount,
      itemTotal: ordersCore.itemTotal,
      tipAmount: ordersCore.tipAmount,
      distanceKm: ordersCore.distanceKm,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      paymentStatus: ordersCore.paymentStatus,
      billingSnapshot: ordersCore.billingSnapshot,
      checkoutMetadata: ordersCore.checkoutMetadata,
      estimatedFare: ordersRide.estimatedFare,
      customerTipAmount: ordersRide.customerTipAmount,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);

  if (!row?.id) return { ok: false };

  const prevSnap =
    row.billingSnapshot != null && typeof row.billingSnapshot === "object"
      ? (row.billingSnapshot as Record<string, unknown>)
      : {};

  if (opts?.skipIfPaid && typeof prevSnap.ride_fare_paid_at === "string") {
    return { ok: true, finalAmount: round2(billNum(prevSnap.final_amount)) };
  }

  const customerPk = row.customerId != null ? Number(row.customerId) : 0;
  if (!Number.isFinite(customerPk) || customerPk <= 0) return { ok: false };

  const rideFare = Math.max(
    0,
    billNum(prevSnap.ride_fare) ||
      billNum(prevSnap.fare_amount) ||
      billNum(prevSnap.item_total) ||
      billNum(row.estimatedFare) ||
      billNum(row.fareAmount) ||
      billNum(row.itemTotal)
  );
  if (rideFare <= 0) return { ok: false };

  const meta =
    row.checkoutMetadata != null && typeof row.checkoutMetadata === "object"
      ? (row.checkoutMetadata as Record<string, unknown>)
      : {};

  const tipAmount = Math.max(
    0,
    billNum(row.customerTipAmount) || billNum(row.tipAmount) || billNum(prevSnap.tip_amount)
  );

  const couponCode =
    opts?.couponCode?.trim() ||
    (typeof prevSnap.ride_fare_coupon_code === "string"
      ? prevSnap.ride_fare_coupon_code.trim()
      : null) ||
    null;
  const platformOfferId =
    opts?.platformOfferId ??
    (typeof prevSnap.ride_fare_platform_offer_id === "number"
      ? prevSnap.ride_fare_platform_offer_id
      : null);

  const billRes = await computeBillForRide(db, {
    customerId: customerPk,
    rideFare,
    distanceKm: billNum(row.distanceKm),
    pickupLat: billNum(row.pickupLat),
    pickupLng: billNum(row.pickupLon),
    dropLat: billNum(row.dropLat),
    dropLon: billNum(row.dropLon),
    tipAmount,
    couponCode,
    pickupPincode: typeof meta.pickupPincode === "string" ? meta.pickupPincode : null,
    pickupState: typeof meta.pickupState === "string" ? meta.pickupState : null,
    selectedPlatformOfferId: platformOfferId,
    useCache: false,
  });

  if (!billRes.ok) return { ok: false };

  const mergedSnapshot = mergeBillingIntoSnapshot(
    billRes.billing,
    billRes.snapshot,
    prevSnap,
    {
      pickupWaitingCharge: opts?.pickupWaitingCharge,
      pickupWaitSeconds: opts?.pickupWaitSeconds,
    }
  );
  const finalAmount = round2(billNum(mergedSnapshot.final_amount));

  await db
    .update(ordersCore)
    .set({
      grandTotal: String(finalAmount),
      fareAmount: String(round2(billRes.billing.item_total)),
      tipAmount: String(round2(tipAmount)),
      billingSnapshot: mergedSnapshot,
      updatedAt: new Date(),
    })
    .where(eq(ordersCore.id, orderCorePk));

  if (opts?.pickupWaitingCharge != null && opts.pickupWaitingCharge > 0) {
    await db
      .update(ordersRide)
      .set({
        waitingCharges: String(round2(opts.pickupWaitingCharge)),
        finalFare: String(finalAmount),
        updatedAt: new Date(),
      })
      .where(eq(ordersRide.orderId, orderCorePk));
  } else {
    await db
      .update(ordersRide)
      .set({
        finalFare: String(finalAmount),
        updatedAt: new Date(),
      })
      .where(eq(ordersRide.orderId, orderCorePk));
  }

  return { ok: true, finalAmount };
}

export type RideBillForCustomerResult =
  | {
      ok: true;
      billing: BillingResult;
      snapshot: Record<string, unknown>;
      orderCoreId: number;
      orderIdText: string;
      customerId: number;
      pickupAddress: string | null;
      dropAddress: string | null;
      distanceKm: number;
      rideType: string | null;
      paymentMethod: string | null;
    }
  | { ok: false; code: string; message: string; statusCode?: number };

export async function computeRideBillForCustomerOrder(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: {
    customerPk: number;
    orderRef: string;
    couponCode?: string | null;
    platformOfferId?: number | null;
    forceNoAutoOffer?: boolean;
  }
): Promise<RideBillForCustomerResult> {
  const [orderRow] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      orderType: ordersCore.orderType,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      fareAmount: ordersCore.fareAmount,
      itemTotal: ordersCore.itemTotal,
      tipAmount: ordersCore.tipAmount,
      distanceKm: ordersCore.distanceKm,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      dropAddressRaw: ordersCore.dropAddressRaw,
      paymentMethod: ordersCore.paymentMethod,
      paymentStatus: ordersCore.paymentStatus,
      billingSnapshot: ordersCore.billingSnapshot,
      checkoutMetadata: ordersCore.checkoutMetadata,
    })
    .from(ordersCore)
    .where(customerOrderRefWhere(input.customerPk, input.orderRef))
    .limit(1);

  if (!orderRow?.id) {
    return { ok: false, code: "ORDER_NOT_FOUND", message: "Order not found", statusCode: 404 };
  }
  if (String(orderRow.orderType ?? "") !== "person_ride") {
    return { ok: false, code: "NOT_RIDE_ORDER", message: "Not a ride order", statusCode: 400 };
  }

  const statusUpper = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
  if (statusUpper !== "DELIVERED") {
    return {
      ok: false,
      code: "RIDE_NOT_DELIVERED",
      message: "Ride fare bill is available only after delivery",
      statusCode: 409,
    };
  }

  const rideFare = resolveRideBaseFare(orderRow);
  if (rideFare <= 0) {
    return { ok: false, code: "INVALID_FARE", message: "Ride fare is not available", statusCode: 400 };
  }

  const meta =
    orderRow.checkoutMetadata != null && typeof orderRow.checkoutMetadata === "object"
      ? (orderRow.checkoutMetadata as Record<string, unknown>)
      : {};

  const pickupLat = billNum(orderRow.pickupLat);
  const pickupLng = billNum(orderRow.pickupLon);
  const dropLat = billNum(orderRow.dropLat);
  const dropLon = billNum(orderRow.dropLon);
  const distanceKm = billNum(orderRow.distanceKm);
  const tipAmount = Math.max(0, billNum(orderRow.tipAmount));

  const billRes = await computeBillForRide(db, {
    customerId: input.customerPk,
    rideFare,
    distanceKm,
    pickupLat,
    pickupLng,
    dropLat,
    dropLon,
    tipAmount,
    couponCode: input.couponCode?.trim() || null,
    pickupPincode:
      typeof meta.pickupPincode === "string" ? meta.pickupPincode : null,
    pickupState: typeof meta.pickupState === "string" ? meta.pickupState : null,
    selectedPlatformOfferId: input.platformOfferId ?? null,
    forceNoAutoOffer: input.forceNoAutoOffer === true,
    useCache: false,
  });

  if (!billRes.ok) return billRes;

  const paymentCompleted =
    String(orderRow.paymentStatus ?? "").toLowerCase() === "completed";
  if (paymentCompleted && orderRow.billingSnapshot != null) {
    const snap =
      typeof orderRow.billingSnapshot === "object"
        ? (orderRow.billingSnapshot as Record<string, unknown>)
        : {};
    const paidAt =
      typeof snap.ride_fare_paid_at === "string" && snap.ride_fare_paid_at.trim().length > 0;
    const persistedDiscounts = resolveInvoiceDiscounts(snap);
    if (persistedDiscounts.length > 0) {
      const persistedTotal = Math.round(
        persistedDiscounts.reduce((sum, row) => sum + row.amount, 0) * 100
      ) / 100;
      if (persistedTotal > billRes.billing.discount_total + 0.005) {
        billRes.billing.discounts = persistedDiscounts.map((row) => ({
          kind: "discount" as const,
          label: row.label,
          amount: row.amount,
        }));
        billRes.billing.discount_total = persistedTotal;
      }
    }
    const snapFinal = billNum(snap.final_amount);
    if (paidAt && snapFinal > 0) {
      billRes.billing.final_amount = snapFinal;
    }
  }

  const rideType =
    typeof meta.rideType === "string" ? meta.rideType.trim() || null : null;

  return {
    ok: true,
    billing: billRes.billing,
    snapshot: billRes.snapshot,
    orderCoreId: orderRow.id,
    orderIdText: orderRow.orderId?.trim() || String(orderRow.id),
    customerId: input.customerPk,
    pickupAddress: orderRow.pickupAddressRaw ?? null,
    dropAddress: orderRow.dropAddressRaw ?? null,
    distanceKm,
    rideType,
    paymentMethod: orderRow.paymentMethod ?? null,
  };
}
