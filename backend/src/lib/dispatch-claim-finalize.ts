/**
 * After a rider atomically claims an order: stop waves, mark the winning
 * offer accepted, cancel every other pending offer, and push realtime
 * cancellation so losing riders close the modal without waiting for HTTP.
 */

import { completeOrderDispatch } from "./order-dispatch.service.js";
import {
  cancelLosingDispatchOffers,
  recordDispatchAssignmentAudit,
} from "./rider-dispatch-assignment-audit.js";

export async function finalizeWinningDispatchClaim(input: {
  orderCoreId: number;
  orderId: string;
  winnerRiderId: number;
  serviceType: "food" | "parcel" | "person_ride";
  occurredAt?: Date;
}): Promise<void> {
  const now = input.occurredAt ?? new Date();
  const orderId = input.orderId.trim();

  await completeOrderDispatch(input.orderCoreId, "accepted");
  console.info(
    "[dispatch] WAVE_STOPPED",
    JSON.stringify({
      order: orderId,
      reason: "ORDER_ASSIGNED",
      rider: input.winnerRiderId,
    })
  );

  await recordDispatchAssignmentAudit({
    orderCoreId: input.orderCoreId,
    orderId,
    riderId: input.winnerRiderId,
    eventType: "accepted",
    acceptedAt: now,
    responseReceivedAt: now,
    actorType: "rider",
    actorId: String(input.winnerRiderId),
    metadata: { serviceType: input.serviceType },
    occurredAt: now,
  });
  await recordDispatchAssignmentAudit({
    orderCoreId: input.orderCoreId,
    orderId,
    riderId: input.winnerRiderId,
    eventType: "assigned",
    assignedAt: now,
    actorType: "rider",
    actorId: String(input.winnerRiderId),
    metadata: { serviceType: input.serviceType },
    occurredAt: now,
  });

  const cancelled = await cancelLosingDispatchOffers({
    orderCoreId: input.orderCoreId,
    winnerRiderId: input.winnerRiderId,
    orderId,
    occurredAt: now,
  });
  console.info(
    "[dispatch] OFFERS_CANCELLED",
    JSON.stringify({
      order: orderId,
      count: cancelled,
      winner: input.winnerRiderId,
    })
  );
}
