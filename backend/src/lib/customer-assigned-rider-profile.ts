/**
 * Captain profile for customer ride/food tracking cards.
 * Shared by order detail + ride status so assignment always returns name/vehicle/rating.
 */

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { ordersCore, riders, riderVehicles } from "../db/schema.js";
import { getRiderAverageRating } from "./rider-average-rating.js";

export type CustomerAssignedRiderProfile = {
  name: string;
  phone?: string;
  photoUrl?: string | null;
  rating?: number | null;
  deliveredOrdersCount?: number | null;
  vehicleRegistration?: string | null;
  vehicleModel?: string | null;
};

export async function loadCustomerAssignedRiderProfile(
  riderId: number,
  opts?: { rideTypeFallback?: string | null }
): Promise<CustomerAssignedRiderProfile | null> {
  if (!Number.isFinite(riderId) || riderId <= 0) return null;
  const db = getDb();

  const [riderRow] = await db
    .select({
      name: riders.name,
      mobile: riders.mobile,
      selfieUrl: riders.selfieUrl,
    })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);

  if (!riderRow) return null;

  const [[vehicleRow], rating, [deliveredRow]] = await Promise.all([
    db
      .select({
        registrationNumber: riderVehicles.registrationNumber,
        vehicleNumber: riderVehicles.vehicleNumber,
        model: riderVehicles.model,
        make: riderVehicles.make,
      })
      .from(riderVehicles)
      .where(
        and(
          eq(riderVehicles.riderId, riderId),
          eq(riderVehicles.isActive, true),
          isNull(riderVehicles.deletedAt)
        )
      )
      .orderBy(desc(riderVehicles.updatedAt))
      .limit(1),
    getRiderAverageRating(riderId),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(ordersCore)
      .where(
        and(
          eq(ordersCore.riderId, riderId),
          or(eq(ordersCore.status, "delivered"), eq(ordersCore.currentStatus, "DELIVERED"))
        )
      ),
  ]);

  const reg =
    vehicleRow?.registrationNumber?.trim() ||
    vehicleRow?.vehicleNumber?.trim() ||
    null;
  const modelParts = [vehicleRow?.make, vehicleRow?.model]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .join(" ");
  const deliveredOrdersCount = Number(deliveredRow?.count ?? 0);

  return {
    name: riderRow.name?.trim() || "Captain",
    phone: riderRow.mobile?.trim() || undefined,
    photoUrl: riderRow.selfieUrl?.trim() || null,
    rating: rating != null && Number.isFinite(rating) ? Number(rating) : null,
    deliveredOrdersCount: deliveredOrdersCount > 0 ? deliveredOrdersCount : null,
    vehicleRegistration: reg,
    vehicleModel: modelParts || opts?.rideTypeFallback?.trim() || null,
  };
}
