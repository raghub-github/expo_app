/**
 * Push + realtime delivery for filtered dispatch offers.
 * Always driven by order-assignment-engine eligibility — never broadcast to all riders.
 * Fare/earnings come from Rider Fare Engine v3.0 (service_payout_rules %).
 */

import { publishRiderEvent } from "../modules/realtime/publish.js";
import { send as sendNotification } from "../modules/notifications/notificationService.js";
import type { DispatchOrderTarget, EligibleDispatchRider } from "./order-assignment-engine.js";
import {
  buildDispatchOfferRiderEarnings,
  type DispatchOfferRiderEarnings,
} from "./build-dispatch-offer-rider-earnings.js";

const SERVICE_LABEL: Record<DispatchOrderTarget["serviceType"], string> = {
  food: "Food delivery",
  parcel: "Parcel",
  person_ride: "Ride",
};

function formatDistanceKm(meters: number): string {
  const km = meters / 1000;
  if (km < 1) return `${Math.round(meters)} m`;
  return `${km.toFixed(1)} km`;
}

export type DispatchOfferPayload = {
  type: "dispatch_offer";
  orderId: string;
  formattedOrderId: string | null;
  serviceType: DispatchOrderTarget["serviceType"];
  category: "food" | "parcel" | "ride";
  waveNumber: number;
  pickupDistanceMeters: number;
  effectiveRadiusMeters: number;
  /** Rider Fare Engine v3.0 — same fields as GET /orders/available */
  estimatedEarning?: number;
  baseEarning?: number;
  waitingEarning?: number;
  surgeEarning?: number;
  appliedSurges?: { name: string; amount: number }[];
  customerTipAmount?: number;
  prePickupEarning?: number;
  prePickupFromPool?: number;
  prePickupCompanyFunded?: number;
  postPickupEarning?: number;
  prePickupFunding?: "company" | "customer" | "shared";
  totalEarning?: number;
  pickupDistanceKm?: number;
  tripDistanceKm?: number;
  totalDistanceKm?: number;
  pricingEngine?: "rider_percentage_v3";
};

function toCategory(serviceType: DispatchOrderTarget["serviceType"]): "food" | "parcel" | "ride" {
  if (serviceType === "person_ride") return "ride";
  return serviceType;
}

function attachEarnings(
  payload: DispatchOfferPayload,
  earnings: DispatchOfferRiderEarnings | null
): DispatchOfferPayload {
  if (!earnings) return payload;
  return {
    ...payload,
    estimatedEarning: earnings.estimatedEarning,
    baseEarning: earnings.baseEarning,
    waitingEarning: earnings.waitingEarning,
    surgeEarning: earnings.surgeEarning,
    appliedSurges: earnings.appliedSurges,
    customerTipAmount: earnings.customerTipAmount,
    prePickupEarning: earnings.prePickupEarning,
    prePickupFromPool: earnings.prePickupFromPool,
    prePickupCompanyFunded: earnings.prePickupCompanyFunded,
    postPickupEarning: earnings.postPickupEarning,
    prePickupFunding: earnings.prePickupFunding,
    totalEarning: earnings.totalEarning,
    pickupDistanceKm: earnings.pickupDistanceKm,
    tripDistanceKm: earnings.tripDistanceKm,
    totalDistanceKm: earnings.totalDistanceKm,
    pricingEngine: earnings.pricingEngine,
  };
}

/** Notify one eligible rider via push + rider websocket channel. Never throws. */
export async function notifyRiderDispatchOffer(
  target: DispatchOrderTarget,
  rider: EligibleDispatchRider
): Promise<void> {
  try {
    const displayId = target.formattedOrderId?.trim() || target.orderId;
    const label = SERVICE_LABEL[target.serviceType];
    const dist = formatDistanceKm(rider.distanceMeters);

    let earnings: DispatchOfferRiderEarnings | null = null;
    try {
      earnings = await buildDispatchOfferRiderEarnings({
        orderCoreId: target.orderCoreId,
        serviceType: target.serviceType,
        riderId: rider.riderId,
        riderLat: rider.lat,
        riderLng: rider.lng,
        pickupDistanceMeters: rider.distanceMeters,
      });
    } catch (err) {
      console.warn(
        "[dispatch] offer payout failed",
        target.orderId,
        rider.riderId,
        (err as Error).message
      );
    }

    const payload = attachEarnings(
      {
        type: "dispatch_offer",
        orderId: target.orderId,
        formattedOrderId: target.formattedOrderId,
        serviceType: target.serviceType,
        category: toCategory(target.serviceType),
        waveNumber: target.waveNumber,
        pickupDistanceMeters: Math.round(rider.distanceMeters),
        effectiveRadiusMeters: target.effectiveRadiusMeters,
      },
      earnings
    );

    await publishRiderEvent(rider.riderId, {
      ...payload,
    });
    console.info(
      "[dispatch] WS_SEND",
      JSON.stringify({
        rider: rider.riderId,
        order: target.orderId,
        type: "dispatch_offer",
      })
    );

    const earningLabel =
      earnings != null && earnings.estimatedEarning > 0
        ? `₹${earnings.estimatedEarning}`
        : "";

    try {
      await sendNotification({
        templateCode: "RIDER_DISPATCH_OFFER",
        variables: {
          orderId: target.orderId,
          formattedOrderId: target.formattedOrderId ?? "",
          serviceLabel: label,
          displayId,
          pickupDistance: dist,
          serviceType: target.serviceType,
          waveNumber: target.waveNumber,
          estimatedEarning: earningLabel,
          earningAmount: earnings?.estimatedEarning != null ? String(earnings.estimatedEarning) : "",
        },
        target: { user_id: `usr_${rider.riderId}` },
        priority: "high",
        metadata: {
          type: "dispatch_offer",
          gmType: "DISPATCH_OFFER",
          orderId: target.orderId,
          pickupDistanceMeters: String(Math.round(rider.distanceMeters)),
          category: toCategory(target.serviceType),
          ...(earnings?.estimatedEarning != null
            ? {
                estimatedEarning: String(earnings.estimatedEarning),
                pricingEngine: "rider_percentage_v3",
              }
            : {}),
        },
      });
      console.info(
        "[dispatch] FCM_SEND",
        JSON.stringify({
          rider: rider.riderId,
          order: target.orderId,
          serviceType: target.serviceType,
          waveNumber: target.waveNumber,
          template: "RIDER_DISPATCH_OFFER",
        })
      );
    } catch (err) {
      console.warn(
        "[dispatch] PUSH_FAILED",
        JSON.stringify({
          riderId: rider.riderId,
          orderId: target.orderId,
          reason: (err as Error).message,
        })
      );
    }
  } catch (err) {
    console.warn(
      "[dispatch] NOTIFY_RIDER_FAILED",
      JSON.stringify({
        riderId: rider.riderId,
        orderId: target.orderId,
        reason: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

/**
 * Fan-out to every engine-eligible rider in this wave.
 * One rider's WS/FCM failure must not block the others.
 * Offer rows are already persisted as offer_sent before this runs.
 */
export async function notifyEligibleRidersDispatchOffer(
  target: DispatchOrderTarget,
  riders: EligibleDispatchRider[]
): Promise<number> {
  if (riders.length === 0) return 0;
  const { isOrderStillDispatchable } = await import("./order-dispatch.service.js");
  if (!(await isOrderStillDispatchable(target.orderCoreId))) {
    console.info(
      "[dispatch] WAVE_STOPPED",
      JSON.stringify({
        order: target.orderId,
        reason: "ORDER_ASSIGNED",
      })
    );
    return 0;
  }

  const results = await Promise.allSettled(
    riders.map((rider) => notifyRiderDispatchOffer(target, rider))
  );
  return results.filter((r) => r.status === "fulfilled").length;
}
