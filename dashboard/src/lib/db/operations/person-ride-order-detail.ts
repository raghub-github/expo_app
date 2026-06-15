/**
 * Person ride extension fields for dashboard order detail (orders_ride).
 */

import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { ordersRide } from "../schema";

export type PersonRideOrderDetail = {
  passengerName: string | null;
  passengerPhone: string | null;
  passengerCount: number | null;
  bookedForSelf: boolean;
  rideType: string | null;
  vehicleTypeRequired: string | null;
  pickupOtp: string | null;
  scheduledRide: boolean;
  scheduledPickupTime: string | null;
  returnTrip: boolean;
  waitingCharges: number | null;
  tollCharges: number | null;
  parkingCharges: number | null;
  pickupDistanceFromBookerKm: number | null;
  intermediateStopsCount: number;
};

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
  };
}
