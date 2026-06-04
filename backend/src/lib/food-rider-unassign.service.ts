/**
 * Food rider unassign orchestration — clears assignment, preserves merchant status, restarts dispatch.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { ordersCore, ordersFood } from "../db/schema.js";
import { restartOrderDispatch } from "./order-dispatch.service.js";
import { recordDispatchAssignmentAudit } from "./rider-dispatch-assignment-audit.js";
import { recordRiderDispatchExclusion } from "./rider-dispatch-order-exclusion.js";
import { recordFoodRiderUnassigned } from "./rider-ride-assignment.js";

export type UnassignFoodRiderInput = {
  orderCorePk: number;
  orderIdText: string;
  riderId: number;
  reasonCode: string;
  reasonText?: string | null;
  removedBy?: string | null;
  actorType?: string;
  actorId?: string;
};

function coreStatusAfterFoodUnassign(foodStatus: string): string {
  const st = foodStatus.trim().toUpperCase();
  if (st === "CREATED" || st === "NEW") return "CREATED";
  return st;
}

/** Unassign rider from food order and restart rider matching. Merchant acceptance unchanged. */
export async function unassignFoodRiderAndRestartDispatch(
  input: UnassignFoodRiderInput
): Promise<void> {
  const db = getDb();
  const now = new Date();

  const foodStatus = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        foodStatus: ordersFood.orderStatus,
        riderId: ordersCore.riderId,
      })
      .from(ordersCore)
      .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
      .where(
        and(eq(ordersCore.id, input.orderCorePk), eq(ordersCore.riderId, input.riderId))
      )
      .limit(1);

    if (!row?.foodStatus) {
      throw new Error("Food order not found or rider not assigned");
    }

    const foodSt = String(row.foodStatus).trim().toUpperCase();
    const nextCoreStatus = coreStatusAfterFoodUnassign(foodSt);

    await tx
      .update(ordersCore)
      .set({
        riderId: null,
        status: "assigned",
        currentStatus: nextCoreStatus,
        updatedAt: now,
      })
      .where(and(eq(ordersCore.id, input.orderCorePk), eq(ordersCore.riderId, input.riderId)));

    await tx
      .update(ordersFood)
      .set({ riderId: null, updatedAt: now })
      .where(eq(ordersFood.orderId, input.orderCorePk));

    await recordFoodRiderUnassigned(tx, {
      orderCorePk: input.orderCorePk,
      orderIdText: input.orderIdText,
      riderId: input.riderId,
      reasonCode: input.reasonCode,
      reasonText: input.reasonText,
      removedBy: input.removedBy,
      actorType: input.actorType,
      actorId: input.actorId,
      foodStatus: foodSt,
      occurredAt: now,
    });

    return foodSt;
  });

  const exclusionSource =
    input.actorType === "rider" ? "rider_cancel_assigned" : "admin_unassign";

  await recordRiderDispatchExclusion({
    orderCoreId: input.orderCorePk,
    orderId: input.orderIdText,
    riderId: input.riderId,
    exclusionSource,
    reasonCode: input.reasonCode,
    reasonText: input.reasonText ?? input.reasonCode,
    actorType: input.actorType ?? "system",
    actorId: input.actorId ?? input.removedBy ?? null,
    metadata: { foodStatus, serviceType: "food" },
  });

  await recordDispatchAssignmentAudit({
    orderCoreId: input.orderCorePk,
    orderId: input.orderIdText,
    riderId: input.riderId,
    eventType: "unassigned",
    unassignedAt: now,
    removedBy: input.removedBy ?? input.actorId ?? null,
    removalReason: input.reasonText ?? input.reasonCode,
    actorType: input.actorType ?? "system",
    actorId: input.actorId ?? input.removedBy ?? null,
    metadata: { foodStatus, serviceType: "food", reasonCode: input.reasonCode },
    occurredAt: now,
  });

  await restartOrderDispatch(input.orderCorePk);
}
