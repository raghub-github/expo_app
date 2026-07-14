/**
 * Push + realtime delivery for filtered dispatch offers.
 * Always driven by order-assignment-engine eligibility — never broadcast to all riders.
 * Fare/earnings come from Rider Fare Engine v3.0 (service_payout_rules %).
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { expoPushTokens } from "../db/schema.js";
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

async function loadRiderPushTokens(riderId: number): Promise<string[]> {
  const userId = `usr_${riderId}`;
  const db = getDb();
  const rows = await db
    .select({ token: expoPushTokens.expoPushToken })
    .from(expoPushTokens)
    .where(and(eq(expoPushTokens.userId, userId), eq(expoPushTokens.role, "rider")));

  return rows.map((r) => r.token).filter((t): t is string => Boolean(t));
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
    totalEarning: earnings.totalEarning,
    pickupDistanceKm: earnings.pickupDistanceKm,
    tripDistanceKm: earnings.tripDistanceKm,
    totalDistanceKm: earnings.totalDistanceKm,
    pricingEngine: earnings.pricingEngine,
  };
}

/** Notify one eligible rider via push + rider websocket channel. */
export async function notifyRiderDispatchOffer(
  target: DispatchOrderTarget,
  rider: EligibleDispatchRider
): Promise<void> {
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

  const tokens = await loadRiderPushTokens(rider.riderId);
  if (tokens.length === 0) return;

  const earningLabel =
    earnings != null && earnings.estimatedEarning > 0
      ? `₹${earnings.estimatedEarning}`
      : "";

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
    target: { device_tokens: tokens },
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
}

/** Notify all riders in the engine-filtered eligible set (same result set as pool API). */
export async function notifyEligibleRidersDispatchOffer(
  target: DispatchOrderTarget,
  riders: EligibleDispatchRider[]
): Promise<number> {
  let sent = 0;
  for (const rider of riders) {
    await notifyRiderDispatchOffer(target, rider);
    sent += 1;
  }
  return sent;
}
