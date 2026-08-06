/**
 * Parcel extension fields for dashboard order detail (orders_parcel).
 */

import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { ordersCore, ordersParcel } from "../schema";
import type { ParcelOrderDetail } from "@/lib/orders/parcel-order-types";

export type { ParcelOrderDetail } from "@/lib/orders/parcel-order-types";

function parseNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getParcelOrderDetail(orderCoreId: number): Promise<ParcelOrderDetail | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(ordersParcel)
    .where(eq(ordersParcel.orderId, orderCoreId))
    .limit(1);

  if (!row) return null;

  return {
    receiverName: row.receiverName?.trim() || null,
    receiverMobile: row.receiverMobile?.trim() || null,
    senderName: row.senderName?.trim() || null,
    senderMobile: row.senderMobile?.trim() || null,
    parcelType: row.parcelType?.trim() || null,
    vehicleCategory: row.vehicleCategory?.trim() || row.parcelType?.trim() || null,
    vehicleTypeRequired: row.vehicleTypeRequired?.trim() || null,
    weightKg: parseNum(row.weightKg),
    lengthCm: parseNum(row.lengthCm),
    widthCm: parseNum(row.widthCm),
    heightCm: parseNum(row.heightCm),
    pickupLabel: row.pickupLabel?.trim() || null,
    pickupAddress: row.pickupAddress?.trim() || null,
    pickupLat: parseNum(row.pickupLat),
    pickupLon: parseNum(row.pickupLon),
    dropLabel: row.dropLabel?.trim() || null,
    dropAddress: row.dropAddress?.trim() || null,
    dropLat: parseNum(row.dropLat),
    dropLon: parseNum(row.dropLon),
    pickupOtp: row.pickupOtp?.trim() || null,
    deliveryOtp: row.deliveryOtp?.trim() || null,
    paymentMethod: row.paymentMethod?.trim() || null,
    payAt: row.payAt?.trim() || null,
    isCod: row.isCod ?? null,
    codAmount: parseNum(row.codAmount),
    estimatedFare: parseNum(row.estimatedFare),
    finalFare: parseNum(row.finalFare),
    tripDistanceKm: parseNum(row.tripDistanceKm),
    couponCode: row.couponCode?.trim() || null,
    appliedOfferDiscount: parseNum(row.appliedOfferDiscount),
    requiresOtpVerification: row.requiresOtpVerification ?? null,
    cancellationReasonCode: row.cancellationReasonCode?.trim() || null,
    cancellationReasonText: row.cancellationReasonText?.trim() || null,
    instructions: row.instructions?.trim() || null,
  };
}

/** Billing snapshot + live payment status from orders_core (parcel fare card). */
export async function getParcelBillingContext(orderCoreId: number): Promise<{
  billingSnapshot: Record<string, unknown> | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  fareAmount: number | null;
  itemTotal: number | null;
  grandTotal: number | null;
  tipAmount: number | null;
}> {
  const db = getDb();
  const [row] = await db
    .select({
      billingSnapshot: ordersCore.billingSnapshot,
      paymentStatus: ordersCore.paymentStatus,
      paymentMethod: ordersCore.paymentMethod,
      fareAmount: ordersCore.fareAmount,
      itemTotal: ordersCore.itemTotal,
      grandTotal: ordersCore.grandTotal,
      tipAmount: ordersCore.tipAmount,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderCoreId))
    .limit(1);

  const snap =
    row?.billingSnapshot != null && typeof row.billingSnapshot === "object"
      ? (row.billingSnapshot as Record<string, unknown>)
      : null;

  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    billingSnapshot: snap,
    paymentStatus: row?.paymentStatus != null ? String(row.paymentStatus) : null,
    paymentMethod: row?.paymentMethod != null ? String(row.paymentMethod) : null,
    fareAmount: num(row?.fareAmount),
    itemTotal: num(row?.itemTotal),
    grandTotal: num(row?.grandTotal),
    tipAmount: num(row?.tipAmount),
  };
}
