/**
 * Person Ride “First Ride Only” eligibility for platform offers.
 * Counts only completed person_ride orders — never Food / Grocery / Parcel.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ordersCore, ordersRide } from "../../db/schema.js";
import type { BillContext, PlatformOfferRow } from "./types.js";

/** True when the offer requires the customer to have zero completed Person Rides. */
export function platformOfferRequiresFirstRideOnly(o: PlatformOfferRow): boolean {
  const cond = (o.conditions ?? {}) as Record<string, unknown>;
  return cond.first_ride_only === true || cond.first_ride_only === "true" || cond.first_ride_only === 1;
}

/**
 * Server-side gate: independent of per-user usage limits.
 * Fail-closed when the completed-ride count is unknown (cannot be bypassed).
 * Only evaluated on RIDE billing — never on Food/Parcel carts.
 */
export function platformOfferFirstRideOnlyPasses(ctx: BillContext, o: PlatformOfferRow): boolean {
  if (!platformOfferRequiresFirstRideOnly(o)) return true;
  const st = String(ctx.serviceType ?? "").toUpperCase();
  if (st !== "RIDE") return false;
  const count = ctx.completedPersonRideCount;
  if (count == null) return false;
  return count === 0;
}

/**
 * Completed Person Ride = orders_core.order_type = person_ride + status delivered,
 * and the ride row is not cancelled. Food / Parcel / Grocery are excluded by order_type.
 */
export async function countCompletedPersonRidesForCustomer(
  db: PostgresJsDatabase<Record<string, unknown>>,
  customerId: number
): Promise<number> {
  if (!customerId || customerId < 1) return 0;

  const [row] = await db
    .select({
      cnt: sql<number>`count(*)::int`,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(
      and(
        eq(ordersCore.customerId, customerId),
        eq(ordersCore.orderType, "person_ride"),
        eq(ordersCore.status, "delivered"),
        isNull(ordersRide.cancelledAt)
      )
    );

  const n = Number(row?.cnt ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
