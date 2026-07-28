/**
 * Person ride extension fields for dashboard order detail (orders_ride).
 */

import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { ordersCore, ordersRide } from "../schema";
import type { PersonRideOrderDetail } from "@/lib/orders/person-ride-order-types";

export type { PersonRideOrderDetail } from "@/lib/orders/person-ride-order-types";

function parseNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getPersonRideOrderDetail(
  orderCoreId: number
): Promise<PersonRideOrderDetail | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(ordersRide)
    .where(eq(ordersRide.orderId, orderCoreId))
    .limit(1);

  if (!row) return null;

  const stops = Array.isArray(row.intermediateStops) ? row.intermediateStops : [];

  return {
    passengerName: row.passengerName?.trim() || null,
    passengerPhone: row.passengerPhone?.trim() || null,
    passengerCount: row.passengerCount ?? null,
    bookedForSelf: row.bookedForSelf ?? true,
    rideType: row.rideType?.trim() || null,
    vehicleTypeRequired: row.vehicleTypeRequired?.trim() || null,
    pickupOtp: row.pickupOtp?.trim() || null,
    scheduledRide: Boolean(row.scheduledRide),
    scheduledPickupTime:
      row.scheduledPickupTime instanceof Date
        ? row.scheduledPickupTime.toISOString()
        : row.scheduledPickupTime
          ? String(row.scheduledPickupTime)
          : null,
    returnTrip: Boolean(row.returnTrip),
    waitingCharges: parseNum(row.waitingCharges),
    tollCharges: parseNum(row.tollCharges),
    parkingCharges: parseNum(row.parkingCharges),
    pickupDistanceFromBookerKm: parseNum(row.pickupDistanceFromBookerKm),
    intermediateStopsCount: stops.length,
    adminRiderPaymentClearedAt:
      row.adminRiderPaymentClearedAt instanceof Date
        ? row.adminRiderPaymentClearedAt.toISOString()
        : row.adminRiderPaymentClearedAt
          ? String(row.adminRiderPaymentClearedAt)
          : null,
  };
}

/** Billing snapshot + live payment status from orders_core (person-ride fare card). */
export async function getPersonRideBillingContext(orderCoreId: number): Promise<{
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
