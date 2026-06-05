/**
 * Push + realtime delivery for filtered dispatch offers.
 * Always driven by order-assignment-engine eligibility — never broadcast to all riders.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { expoPushTokens } from "../db/schema.js";
import { publishRiderEvent } from "../modules/realtime/publish.js";
import { enqueuePush } from "../modules/push/enqueuePush.js";
import type { DispatchOrderTarget, EligibleDispatchRider } from "./order-assignment-engine.js";

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

  return rows.map((r) => r.token).filter(Boolean);
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
};

function toCategory(serviceType: DispatchOrderTarget["serviceType"]): "food" | "parcel" | "ride" {
  if (serviceType === "person_ride") return "ride";
  return serviceType;
}

/** Notify one eligible rider via push + rider websocket channel. */
export async function notifyRiderDispatchOffer(
  target: DispatchOrderTarget,
  rider: EligibleDispatchRider
): Promise<void> {
  const displayId = target.formattedOrderId?.trim() || target.orderId;
  const label = SERVICE_LABEL[target.serviceType];
  const dist = formatDistanceKm(rider.distanceMeters);

  const payload: DispatchOfferPayload = {
    type: "dispatch_offer",
    orderId: target.orderId,
    formattedOrderId: target.formattedOrderId,
    serviceType: target.serviceType,
    category: toCategory(target.serviceType),
    waveNumber: target.waveNumber,
    pickupDistanceMeters: Math.round(rider.distanceMeters),
    effectiveRadiusMeters: target.effectiveRadiusMeters,
  };

  await publishRiderEvent(rider.riderId, {
    ...payload,
  });

  const tokens = await loadRiderPushTokens(rider.riderId);
  if (tokens.length === 0) return;

  await enqueuePush({
    to: tokens,
    title: `New ${label} order`,
    body: `${displayId} · ${dist} from pickup — tap to view`,
    sound: "default",
    channelId: "default",
    screen: "/(tabs)/orders",
    data: {
      type: "dispatch_offer",
      gmType: "DISPATCH_OFFER",
      orderId: target.orderId,
      formattedOrderId: target.formattedOrderId ?? undefined,
      serviceType: target.serviceType,
      category: toCategory(target.serviceType),
      waveNumber: String(target.waveNumber),
      pickupDistanceMeters: String(Math.round(rider.distanceMeters)),
      gmMessage: `${displayId} · ${dist} from pickup`,
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
