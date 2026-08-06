/**
 * Live trip sharing — token generation, link lifecycle, public tracking payload.
 */

import { randomBytes } from "crypto";
import { and, desc, eq, gt, or } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  customers,
  orderEtaSnapshots,
  orderRiderTracking,
  ordersCore,
  ordersRide,
  riderLiveLocations,
  riderVehicles,
  riders,
  tripShareLinks,
} from "../db/schema.js";
import { resolveCustomerAppOrderStatus } from "./customer-order-status-resolve.js";
import { customerOrderRefWhere } from "./order-ref-resolve.js";
import { getRoute, haversineDistanceKm } from "../modules/distance/distance.service.js";
import { getEnv } from "../config/env.js";

const TERMINAL_STATUSES = new Set(["DELIVERED", "CANCELLED", "FAILED", "PAYMENT_FAILED", "RTO"]);
const MAX_LINK_TTL_MS = 24 * 60 * 60 * 1000;

export function generateTripShareToken(): string {
  const raw = randomBytes(8).toString("hex").toUpperCase();
  return `GTL${raw.slice(0, 10)}`;
}

export function buildTripShareUrl(token: string): string {
  const env = getEnv();
  const explicit = env.TRACK_BASE_URL?.replace(/\/+$/, "");
  if (explicit) return `${explicit}/${token}`;

  if (env.NODE_ENV !== "production") {
    const apiBase = env.API_BASE_URL?.replace(/\/+$/, "");
    if (apiBase) return `${apiBase}/trip/${token}`;
    return `http://localhost:${env.PORT}/trip/${token}`;
  }

  return `https://track.gatimitra.com/trip/${token}`;
}

function parseNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIso(v: unknown): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v as string);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function firstName(full: string | null | undefined): string | null {
  if (!full?.trim()) return null;
  return full.trim().split(/\s+/)[0] ?? null;
}

function statusLabel(status: string, orderType?: string): string {
  const food = String(orderType ?? "").toLowerCase() === "food";
  const map: Record<string, string> = {
    SEARCHING: food ? "Finding delivery partner" : "Finding Captain",
    ASSIGNED: food ? "Partner Assigned" : "Captain Assigned",
    ACCEPTED: food ? "Order Accepted" : "Ride Accepted",
    PREPARING: "Preparing",
    REACHED_STORE: food ? "Partner at restaurant" : "Captain at Pickup",
    RIDE_IN_PROGRESS: "On The Way",
    ON_THE_WAY: "On The Way",
    OUT_FOR_DELIVERY: "On The Way",
    NEAR_DESTINATION: food ? "Nearby" : "Near Destination",
    DELIVERED: food ? "Delivered" : "Trip Completed",
    CANCELLED: food ? "Order Cancelled" : "Trip Cancelled",
  };
  return map[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayCustomerName(full: string | null | undefined): string | null {
  if (!full?.trim()) return null;
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0] ?? null;
  return parts.slice(0, 2).join(" ");
}

function buildTripTitle(name: string | null, orderType: string): string {
  const who = name?.trim() || "Guest";
  if (orderType === "person_ride") return `${who}'s Bike ride`;
  if (orderType === "food") return `${who}'s Food order`;
  if (orderType === "parcel") return `${who}'s Parcel`;
  return `${who}'s Order`;
}

function buildStatusHeading(args: {
  appStatus: string;
  enRoute: boolean;
  riderReachedPickup: boolean;
  rideStarted: boolean;
  nearDestination: boolean;
  orderType?: string | null;
  hasRider?: boolean;
}): string {
  const food = String(args.orderType ?? "").toLowerCase() === "food";
  if (args.nearDestination && args.enRoute) {
    return food ? "Delivery partner is nearby" : "Captain is near your destination";
  }
  if (args.enRoute || args.rideStarted) {
    return food ? "Order is on the way" : "Heading to your destination";
  }
  if (args.riderReachedPickup || args.appStatus === "REACHED_STORE") {
    return food ? "Partner has arrived at the restaurant" : "Captain has arrived at pickup";
  }
  if (food && !args.hasRider) {
    if (
      args.appStatus === "PREPARING" ||
      args.appStatus === "ACCEPTED" ||
      args.appStatus === "READY" ||
      args.appStatus === "READY_FOR_PICKUP"
    ) {
      return "Restaurant is preparing your order";
    }
    return "Waiting for a delivery partner";
  }
  return food ? "Delivery partner heading to the restaurant" : "Captain on the way to pickup";
}

function isTerminalAppStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status.toUpperCase());
}

export async function createOrReuseTripShareLink(args: {
  orderIdText: string;
  customerPk: number;
}): Promise<{ token: string; url: string; expiresAt: string }> {
  const db = getDb();
  const now = new Date();

  const [existing] = await db
    .select({
      token: tripShareLinks.token,
      expiresAt: tripShareLinks.expiresAt,
    })
    .from(tripShareLinks)
    .where(
      and(
        eq(tripShareLinks.tripId, args.orderIdText),
        eq(tripShareLinks.isActive, true),
        gt(tripShareLinks.expiresAt, now)
      )
    )
    .orderBy(desc(tripShareLinks.createdAt))
    .limit(1);

  if (existing) {
    return {
      token: existing.token,
      url: buildTripShareUrl(existing.token),
      expiresAt: (existing.expiresAt ?? now).toISOString(),
    };
  }

  const expiresAt = new Date(now.getTime() + MAX_LINK_TTL_MS);
  let token = generateTripShareToken();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.insert(tripShareLinks).values({
        tripId: args.orderIdText,
        token,
        createdBy: args.customerPk,
        expiresAt,
        isActive: true,
      });
      return { token, url: buildTripShareUrl(token), expiresAt: expiresAt.toISOString() };
    } catch {
      token = generateTripShareToken();
    }
  }
  throw new Error("Could not generate unique share token");
}

export async function deactivateTripShareLinksForOrder(orderIdText: string): Promise<void> {
  const db = getDb();
  await db
    .update(tripShareLinks)
    .set({ isActive: false })
    .where(and(eq(tripShareLinks.tripId, orderIdText), eq(tripShareLinks.isActive, true)));
}

export type PublicTripTimelineStep = {
  key: string;
  label: string;
  completed: boolean;
  at: string | null;
};

export type PublicTripTrackingPayload = {
  token: string;
  tripId: string;
  orderType: string;
  status: string;
  statusLabel: string;
  tripCompleted: boolean;
  tripCancelled: boolean;
  linkExpired: boolean;
  etaMinutes: number | null;
  distanceRemainingKm: number | null;
  distanceTravelledKm: number | null;
  currentSpeedKmh: number | null;
  tripProgressPercent: number | null;
  completedAt: string | null;
  tripTitle: string;
  statusHeading: string;
  tripPhase: "to_pickup" | "to_drop" | "completed";
  pickupPin: string | null;
  customer: { name: string | null; displayName: string | null };
  rider: {
    name: string | null;
    photoUrl: string | null;
    rating: number | null;
    vehicleModel: string | null;
    vehicleRegistration: string | null;
    latitude: number;
    longitude: number;
    headingDegrees: number | null;
    speedKmh: number | null;
    updatedAt: string;
  } | null;
  customerLocation: { latitude: number; longitude: number } | null;
  pickup: { latitude: number; longitude: number; address: string | null } | null;
  destination: { latitude: number; longitude: number; address: string | null } | null;
  routeCoordinates: { latitude: number; longitude: number }[];
  safety: {
    liveLocationVerified: boolean;
    tripInProgress: boolean;
    routeMonitoringActive: boolean;
  };
  timeline: PublicTripTimelineStep[];
  updatedAt: string;
};

function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const coords: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coords;
}

async function resolveRoutePolyline(
  rider: { latitude: number; longitude: number } | null,
  destination: { latitude: number; longitude: number } | null,
  orderType: string
): Promise<{ latitude: number; longitude: number }[]> {
  if (!rider || !destination) return [];
  const env = getEnv();
  try {
    const route = await getRoute({
      origin: { lat: rider.latitude, lng: rider.longitude },
      destination: { lat: destination.latitude, lng: destination.longitude },
      profile: orderType === "person_ride" ? "bike" : "driving",
      mapboxToken: env.MAPBOX_ACCESS_TOKEN,
      osrmBaseUrl: env.OSRM_BASE_URL,
      skipCache: true,
    });
    const encoded = route.geometry ?? route.polyline;
    if (encoded) {
      const decoded = decodePolyline(encoded);
      if (decoded.length >= 2) return decoded;
    }
  } catch {
    /* fallback below */
  }
  return [rider, destination];
}

function buildTimeline(args: {
  appStatus: string;
  placedAt: string | null;
  riderAssignedAt: string | null;
  riderReachedPickupAt: string | null;
  rideStartedAt: string | null;
  deliveredAt: string | null;
  nearDestination: boolean;
}): PublicTripTimelineStep[] {
  const rank = (s: string) => {
    const order = [
      "SEARCHING",
      "ASSIGNED",
      "ACCEPTED",
      "REACHED_STORE",
      "RIDE_IN_PROGRESS",
      "ON_THE_WAY",
      "NEAR_DESTINATION",
      "DELIVERED",
    ];
    const i = order.indexOf(s);
    return i >= 0 ? i : 0;
  };
  const cur = rank(args.appStatus);
  return [
    {
      key: "accepted",
      label: "Ride Accepted",
      completed: cur >= rank("ACCEPTED"),
      at: args.riderAssignedAt ?? args.placedAt,
    },
    {
      key: "reached_pickup",
      label: "Rider Reached Pickup",
      completed: cur >= rank("REACHED_STORE") || !!args.riderReachedPickupAt,
      at: args.riderReachedPickupAt,
    },
    {
      key: "started",
      label: "Ride Started",
      completed: cur >= rank("RIDE_IN_PROGRESS") || !!args.rideStartedAt,
      at: args.rideStartedAt,
    },
    {
      key: "en_route",
      label: "En Route",
      completed: cur >= rank("ON_THE_WAY") || cur >= rank("RIDE_IN_PROGRESS"),
      at: args.rideStartedAt,
    },
    {
      key: "near_destination",
      label: "Near Destination",
      completed: args.nearDestination || cur >= rank("DELIVERED"),
      at: null,
    },
    {
      key: "completed",
      label: "Trip Completed",
      completed: cur >= rank("DELIVERED"),
      at: args.deliveredAt,
    },
  ];
}

export async function loadPublicTripByToken(token: string): Promise<PublicTripTrackingPayload | null> {
  const db = getDb();
  const now = new Date();

  const [link] = await db
    .select()
    .from(tripShareLinks)
    .where(eq(tripShareLinks.token, token))
    .limit(1);
  if (!link) return null;

  const linkExpired = !link.isActive || (link.expiresAt != null && link.expiresAt <= now);

  const [orderRow] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      orderType: ordersCore.orderType,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      riderId: ordersCore.riderId,
      customerId: ordersCore.customerId,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      dropAddressRaw: ordersCore.dropAddressRaw,
      deliveryAddress: ordersCore.deliveryAddress,
      distanceKm: ordersCore.distanceKm,
      placedAt: ordersCore.placedAt,
      actualDeliveryTime: ordersCore.actualDeliveryTime,
    })
    .from(ordersCore)
    .where(or(eq(ordersCore.orderId, link.tripId)))
    .limit(1);

  if (!orderRow) return null;

  const orderIdText = orderRow.orderId ?? link.tripId;

  let rideMeta: {
    riderReachedPickupAt: Date | null;
    pickupOtpVerifiedAt: Date | null;
    riderAssignedAt: Date | null;
    passengerName: string | null;
    pickupOtp: string | null;
  } | null = null;
  if (orderRow.orderType === "person_ride") {
    const [ride] = await db
      .select({
        riderReachedPickupAt: ordersRide.riderReachedPickupAt,
        pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
        riderAssignedAt: ordersRide.riderAssignedAt,
        passengerName: ordersRide.passengerName,
        pickupOtp: ordersRide.pickupOtp,
      })
      .from(ordersRide)
      .where(eq(ordersRide.orderId, orderRow.id))
      .limit(1);
    rideMeta = ride ?? null;
  }

  const appStatus = resolveCustomerAppOrderStatus({
    currentStatus: orderRow.currentStatus,
    coreStatus: orderRow.status,
    foodOrderStatus: null,
    riderId: orderRow.riderId,
    riderReachedPickupAt: rideMeta?.riderReachedPickupAt,
    orderType: orderRow.orderType,
  });

  if (isTerminalAppStatus(appStatus) && link.isActive) {
    await deactivateTripShareLinksForOrder(orderIdText);
  }

  const tripCompleted = appStatus === "DELIVERED";
  const tripCancelled = appStatus === "CANCELLED";

  let customerName: string | null = null;
  let customerDisplayName: string | null = null;
  if (orderRow.customerId != null) {
    const [cust] = await db
      .select({ fullName: customers.fullName })
      .from(customers)
      .where(eq(customers.id, orderRow.customerId))
      .limit(1);
    customerDisplayName = displayCustomerName(cust?.fullName);
    customerName = firstName(cust?.fullName);
  }
  if (!customerDisplayName && rideMeta?.passengerName) {
    customerDisplayName = displayCustomerName(rideMeta.passengerName);
    customerName = firstName(rideMeta.passengerName);
  }

  const [latestTrack] = await db
    .select({
      latitude: orderRiderTracking.latitude,
      longitude: orderRiderTracking.longitude,
      headingDegrees: orderRiderTracking.headingDegrees,
      speedKmh: orderRiderTracking.speedKmh,
      createdAt: orderRiderTracking.createdAt,
    })
    .from(orderRiderTracking)
    .where(eq(orderRiderTracking.orderId, orderIdText))
    .orderBy(desc(orderRiderTracking.createdAt))
    .limit(1);

  let riderLat = parseNum(latestTrack?.latitude);
  let riderLng = parseNum(latestTrack?.longitude);
  let riderHeading = parseNum(latestTrack?.headingDegrees);
  let riderSpeed = parseNum(latestTrack?.speedKmh);
  let riderUpdatedAt = toIso(latestTrack?.createdAt);

  if ((riderLat == null || riderLng == null) && orderRow.riderId != null) {
    const [live] = await db
      .select({
        latitude: riderLiveLocations.lat,
        longitude: riderLiveLocations.lng,
        heading: riderLiveLocations.headingDeg,
        speedKmh: riderLiveLocations.speedMps,
        updatedAt: riderLiveLocations.updatedAt,
      })
      .from(riderLiveLocations)
      .where(eq(riderLiveLocations.riderId, orderRow.riderId))
      .limit(1);
    riderLat = parseNum(live?.latitude) ?? riderLat;
    riderLng = parseNum(live?.longitude) ?? riderLng;
    riderHeading = parseNum(live?.heading) ?? riderHeading;
    riderSpeed =
      live?.speedKmh != null ? parseNum(Number(live.speedKmh) * 3.6) : riderSpeed;
    riderUpdatedAt = toIso(live?.updatedAt) ?? riderUpdatedAt;
  }

  let riderName: string | null = null;
  let riderPhotoUrl: string | null = null;
  let riderRating: number | null = null;
  let vehicleModel: string | null = null;
  let vehicleReg: string | null = null;
  if (orderRow.riderId != null) {
    const [riderRow] = await db
      .select({ name: riders.name, selfieUrl: riders.selfieUrl })
      .from(riders)
      .where(eq(riders.id, orderRow.riderId))
      .limit(1);
    riderName = riderRow?.name?.trim() ?? null;
    const { toAbsoluteClientMediaUrl } = await import("../utils/publicAttachmentUrl.js");
    riderPhotoUrl = toAbsoluteClientMediaUrl(riderRow?.selfieUrl);
    const { getRiderAverageRating } = await import("./rider-average-rating.js");
    riderRating = await getRiderAverageRating(orderRow.riderId);

    const [vehicle] = await db
      .select({
        model: riderVehicles.model,
        registrationNumber: riderVehicles.registrationNumber,
      })
      .from(riderVehicles)
      .where(and(eq(riderVehicles.riderId, orderRow.riderId), eq(riderVehicles.isActive, true)))
      .orderBy(desc(riderVehicles.updatedAt))
      .limit(1);
    vehicleModel = vehicle?.model?.trim() ?? null;
    vehicleReg = vehicle?.registrationNumber?.trim().toUpperCase() ?? null;
  }

  const pickupLat = parseNum(orderRow.pickupLat);
  const pickupLng = parseNum(orderRow.pickupLon);
  const dropLat = parseNum(orderRow.dropLat);
  const dropLng = parseNum(orderRow.dropLon);

  const enRoute =
    appStatus === "RIDE_IN_PROGRESS" ||
    appStatus === "ON_THE_WAY" ||
    appStatus === "OUT_FOR_DELIVERY";
  const destLat = enRoute ? dropLat : pickupLat;
  const destLng = enRoute ? dropLng : pickupLng;

  const riderPos =
    riderLat != null && riderLng != null ? { latitude: riderLat, longitude: riderLng } : null;
  const destPos =
    destLat != null && destLng != null ? { latitude: destLat, longitude: destLng } : null;

  let distanceRemainingKm: number | null = null;
  let etaMinutes: number | null = null;
  let nearDestination = false;
  if (riderPos && destPos) {
    distanceRemainingKm = haversineDistanceKm(
      { lat: riderPos.latitude, lng: riderPos.longitude },
      { lat: destPos.latitude, lng: destPos.longitude }
    );
    nearDestination = distanceRemainingKm <= 0.5;
    etaMinutes = Math.max(1, Math.round((distanceRemainingKm / 30) * 60));
  }

  const [etaSnap] = await db
    .select({ etaSeconds: orderEtaSnapshots.etaSeconds })
    .from(orderEtaSnapshots)
    .where(eq(orderEtaSnapshots.orderId, orderIdText))
    .orderBy(desc(orderEtaSnapshots.createdAt))
    .limit(1);
  if (etaSnap?.etaSeconds != null) {
    etaMinutes = Math.max(1, Math.round(Number(etaSnap.etaSeconds) / 60));
  }

  const routeCoordinates = await resolveRoutePolyline(
    riderPos,
    destPos,
    orderRow.orderType ?? "person_ride"
  );

  const totalKm = parseNum(orderRow.distanceKm);
  const travelledKm =
    totalKm != null && distanceRemainingKm != null
      ? Math.max(0, totalKm - distanceRemainingKm)
      : null;
  const progressPercent =
    totalKm != null && totalKm > 0 && distanceRemainingKm != null
      ? Math.min(100, Math.max(0, Math.round(((totalKm - distanceRemainingKm) / totalKm) * 100)))
      : null;

  const displayStatus = nearDestination && enRoute ? "NEAR_DESTINATION" : appStatus;
  const rideStarted = !!rideMeta?.pickupOtpVerifiedAt;
  const riderReachedPickup = !!rideMeta?.riderReachedPickupAt;
  const tripPhase: "to_pickup" | "to_drop" | "completed" = tripCompleted
    ? "completed"
    : enRoute || rideStarted
      ? "to_drop"
      : "to_pickup";
  const statusHeading = buildStatusHeading({
    appStatus: displayStatus,
    enRoute,
    riderReachedPickup,
    rideStarted,
    nearDestination,
    orderType: orderRow.orderType,
    hasRider: orderRow.riderId != null,
  });
  const tripTitle = buildTripTitle(customerDisplayName ?? customerName, orderRow.orderType ?? "person_ride");
  const pickupPinRaw = rideMeta?.pickupOtp?.replace(/\D/g, "") ?? "";
  const pickupPin =
    !rideStarted && pickupPinRaw.length === 4 ? pickupPinRaw : pickupPinRaw.length > 0 && !rideStarted ? pickupPinRaw.slice(-4) : null;

  return {
    token,
    tripId: orderIdText,
    orderType: orderRow.orderType ?? "person_ride",
    status: displayStatus,
    statusLabel: statusLabel(displayStatus, orderRow.orderType ?? undefined),
    statusHeading,
    tripTitle,
    tripPhase,
    pickupPin,
    tripCompleted,
    tripCancelled,
    linkExpired: linkExpired && !tripCompleted,
    etaMinutes: tripCompleted ? null : etaMinutes,
    distanceRemainingKm: tripCompleted ? null : distanceRemainingKm,
    distanceTravelledKm: tripCompleted ? totalKm ?? travelledKm : travelledKm,
    currentSpeedKmh: riderSpeed,
    tripProgressPercent: progressPercent,
    completedAt: toIso(orderRow.actualDeliveryTime),
    customer: { name: customerName, displayName: customerDisplayName ?? customerName },
    rider: riderPos
      ? {
          name: riderName,
          photoUrl: riderPhotoUrl,
          rating: riderRating,
          vehicleModel,
          vehicleRegistration: vehicleReg,
          latitude: riderPos.latitude,
          longitude: riderPos.longitude,
          headingDegrees: riderHeading,
          speedKmh: riderSpeed,
          updatedAt: riderUpdatedAt ?? now.toISOString(),
        }
      : null,
    customerLocation:
      enRoute && dropLat != null && dropLng != null
        ? { latitude: dropLat, longitude: dropLng }
        : pickupLat != null && pickupLng != null
          ? { latitude: pickupLat, longitude: pickupLng }
          : null,
    pickup:
      pickupLat != null && pickupLng != null
        ? {
            latitude: pickupLat,
            longitude: pickupLng,
            address: orderRow.pickupAddressRaw,
          }
        : null,
    destination:
      dropLat != null && dropLng != null
        ? {
            latitude: dropLat,
            longitude: dropLng,
            address: orderRow.deliveryAddress ?? orderRow.dropAddressRaw,
          }
        : null,
    routeCoordinates,
    safety: {
      liveLocationVerified: riderPos != null,
      tripInProgress: enRoute && !tripCompleted && !tripCancelled,
      routeMonitoringActive: routeCoordinates.length >= 2,
    },
    timeline: buildTimeline({
      appStatus: displayStatus,
      placedAt: toIso(orderRow.placedAt),
      riderAssignedAt: toIso(rideMeta?.riderAssignedAt),
      riderReachedPickupAt: toIso(rideMeta?.riderReachedPickupAt),
      rideStartedAt: toIso(rideMeta?.pickupOtpVerifiedAt),
      deliveredAt: toIso(orderRow.actualDeliveryTime),
      nearDestination,
    }),
    updatedAt: now.toISOString(),
  };
}

export async function assertCustomerCanShareOrder(args: {
  customerPk: number;
  orderIdParam: string;
}): Promise<{ orderIdText: string; appStatus: string; orderType: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({
      orderId: ordersCore.orderId,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      orderType: ordersCore.orderType,
      riderId: ordersCore.riderId,
    })
    .from(ordersCore)
    .where(customerOrderRefWhere(args.customerPk, args.orderIdParam))
    .limit(1);
  if (!row?.orderId) return null;

  const orderType = String(row.orderType ?? "").trim().toLowerCase() || "food";
  // Rides still require an assigned captain. Food/parcel can share while preparing
  // (store → drop preview) even before a rider is assigned.
  if (orderType === "person_ride" && row.riderId == null) return null;

  const appStatus = resolveCustomerAppOrderStatus({
    currentStatus: row.currentStatus,
    coreStatus: row.status,
    foodOrderStatus: null,
    riderId: row.riderId,
    orderType: row.orderType,
  });
  if (isTerminalAppStatus(appStatus)) return null;
  return { orderIdText: row.orderId, appStatus, orderType };
}
