/**
 * Food rider unassign orchestration — clears assignment, preserves merchant status.
 */

import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/client.js";

type DbTx = PostgresJsDatabase<Record<string, unknown>>;
import { ordersCore, ordersFood } from "../db/schema.js";
import {
  completeOrderDispatch,
  restartOrderDispatch,
  startOrderDispatch,
} from "./order-dispatch.service.js";
import { recordDispatchAssignmentAudit } from "./rider-dispatch-assignment-audit.js";
import { recordRiderDispatchExclusion } from "./rider-dispatch-order-exclusion.js";
import {
  recordFoodRiderAdminCancelled,
  recordFoodRiderUnassigned,
} from "./rider-ride-assignment.js";

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

export type AdminCancelFoodRiderMode = "hold" | "reassign";

export type AdminCancelFoodRiderInput = UnassignFoodRiderInput & {
  mode: AdminCancelFoodRiderMode;
};

function coreStatusAfterFoodUnassign(foodStatus: string): string {
  const st = foodStatus.trim().toUpperCase();
  if (st === "CREATED" || st === "NEW") return "CREATED";
  return st;
}

async function clearFoodRiderAssignment(
  input: UnassignFoodRiderInput,
  recordFn: (tx: DbTx, foodStatus: string, now: Date) => Promise<void>
): Promise<string> {
  const db = getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
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
    if (foodSt === "DELIVERED" || foodSt === "CANCELLED") {
      throw new Error("Cannot cancel rider on a delivered or cancelled order");
    }

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

    await recordFn(tx, foodSt, now);

    return foodSt;
  });
}

/** Agent cancels assigned rider — hold for manual assign or instantly re-dispatch. */
export async function adminCancelFoodRiderFromOrder(
  input: AdminCancelFoodRiderInput
): Promise<void> {
  const now = new Date();
  const foodStatus = await clearFoodRiderAssignment(input, async (tx, foodSt, occurredAt) => {
    await recordFoodRiderAdminCancelled(tx, {
      orderCorePk: input.orderCorePk,
      orderIdText: input.orderIdText,
      riderId: input.riderId,
      reasonCode: input.reasonCode,
      reasonText: input.reasonText,
      removedBy: input.removedBy,
      actorType: input.actorType ?? "admin",
      actorId: input.actorId,
      cancelledBy: input.removedBy ?? input.actorId ?? null,
      foodStatus: foodSt,
      occurredAt,
    });
  });

  await recordRiderDispatchExclusion({
    orderCoreId: input.orderCorePk,
    orderId: input.orderIdText,
    riderId: input.riderId,
    exclusionSource: "admin_unassign",
    reasonCode: input.reasonCode,
    reasonText: input.reasonText ?? input.reasonCode,
    actorType: input.actorType ?? "admin",
    actorId: input.actorId ?? input.removedBy ?? null,
    metadata: { foodStatus, serviceType: "food", mode: input.mode },
  });

  await recordDispatchAssignmentAudit({
    orderCoreId: input.orderCorePk,
    orderId: input.orderIdText,
    riderId: input.riderId,
    eventType: "cancelled",
    unassignedAt: now,
    removedBy: input.removedBy ?? input.actorId ?? null,
    removalReason: input.reasonText ?? input.reasonCode,
    actorType: input.actorType ?? "admin",
    actorId: input.actorId ?? input.removedBy ?? null,
    metadata: {
      foodStatus,
      serviceType: "food",
      reasonCode: input.reasonCode,
      mode: input.mode,
    },
    occurredAt: now,
  });

  if (input.mode === "reassign") {
    await restartOrderDispatch(input.orderCorePk);
  } else {
    await completeOrderDispatch(input.orderCorePk, "cancelled");
  }
}

/** Unassign rider from food order and restart rider matching. Merchant acceptance unchanged. */
export async function unassignFoodRiderAndRestartDispatch(
  input: UnassignFoodRiderInput
): Promise<void> {
  const now = new Date();

  const foodStatus = await clearFoodRiderAssignment(input, async (tx, foodSt, occurredAt) => {
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
      occurredAt,
    });
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

/** Manual assign — run eligibility engine and send offers (excludes prior cancelled riders). */
export async function manualAssignRiderForFoodOrder(orderCorePk: number): Promise<{
  started: boolean;
}> {
  await startOrderDispatch(orderCorePk);
  return { started: true };
}
