/**
 * Once-only customer OTP pushes when rider first enters pickup / delivery radius.
 * Fired from live location updates and from mark-reached (idempotent).
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, getSql } from "../db/client.js";
import { ordersCore } from "../db/schema.js";
import { send as sendNotification } from "../modules/notifications/notificationService.js";
import {
  evaluateMilestoneGeoFence,
  type StatusMilestoneKey,
} from "./rider-status-geo-fence.js";
import type { DispatchServiceType } from "./order-assignment-engine.js";

function normalizeOtp(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length >= 4 ? digits.slice(-4) : digits.padStart(4, "0");
}

async function riderDisplayName(
  riderId: number,
  service?: DispatchServiceType | null
): Promise<string> {
  const sqlClient = getSql();
  const rows = await sqlClient<{ name: string | null }[]>`
    SELECT NULLIF(TRIM(name), '') AS name
    FROM riders
    WHERE id = ${riderId}
    LIMIT 1
  `;
  const name = rows[0]?.name?.trim();
  if (name) return name;
  return service === "person_ride" ? "Your captain" : "Your delivery partner";
}

async function customerUserIdForCorePk(orderCorePk: number): Promise<string | null> {
  const sqlClient = getSql();
  const rows = await sqlClient<{ customer_user_id: string | null }[]>`
    SELECT c.customer_id AS customer_user_id
    FROM orders_core oc
    JOIN customers c ON c.id = oc.customer_id
    WHERE oc.id = ${orderCorePk}
    LIMIT 1
  `;
  return rows[0]?.customer_user_id?.trim() || null;
}

type OrderRadiusRow = {
  id: number;
  orderId: string;
  orderType: string | null;
  status: string | null;
  currentStatus: string | null;
  pickupOtp: string | null;
  deliveryOtp: string | null;
  riderId: number | null;
  pickupOtpRadiusNotifiedAt: Date | null;
  deliveryOtpRadiusNotifiedAt: Date | null;
};

async function loadOrderForRadius(orderRef: string): Promise<OrderRadiusRow | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      orderType: ordersCore.orderType,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      pickupOtp: ordersCore.pickupOtp,
      deliveryOtp: ordersCore.deliveryOtp,
      riderId: ordersCore.riderId,
      pickupOtpRadiusNotifiedAt: ordersCore.pickupOtpRadiusNotifiedAt,
      deliveryOtpRadiusNotifiedAt: ordersCore.deliveryOtpRadiusNotifiedAt,
    })
    .from(ordersCore)
    .where(
      sql`(${ordersCore.orderId} = ${orderRef}
        OR ${ordersCore.formattedOrderId} = ${orderRef}
        OR ${ordersCore.id}::text = ${orderRef})`
    )
    .limit(1);
  if (!row?.id || !row.orderId) return null;
  return row as OrderRadiusRow;
}

function serviceTypeOf(orderType: string | null | undefined): DispatchServiceType | null {
  const t = String(orderType ?? "").trim().toLowerCase();
  if (t === "food") return "food";
  if (t === "parcel") return "parcel";
  if (t === "person_ride" || t === "ride") return "person_ride";
  return null;
}

function pickupMilestone(service: DispatchServiceType): StatusMilestoneKey {
  return service === "food" ? "reach_store" : "reach_pickup";
}

function dropMilestone(service: DispatchServiceType): StatusMilestoneKey {
  if (service === "food") return "reach_customer";
  if (service === "parcel") return "reach_drop";
  return "reach_destination";
}

function isTerminal(status: string | null, currentStatus: string | null): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  const c = String(currentStatus ?? "").trim().toUpperCase();
  return (
    s === "delivered" ||
    s === "cancelled" ||
    s === "failed" ||
    c === "DELIVERED" ||
    c === "CANCELLED" ||
    c === "CANCELED" ||
    c === "FAILED"
  );
}

/** Customer-facing pickup OTP applies to parcel + person ride (not food merchant OTP). */
function wantsPickupOtpPush(service: DispatchServiceType, pickupOtp: string | null): boolean {
  if (!normalizeOtp(pickupOtp)) return false;
  return service === "parcel" || service === "person_ride";
}

/** Customer-facing delivery OTP applies to food + parcel. */
function wantsDeliveryOtpPush(service: DispatchServiceType, deliveryOtp: string | null): boolean {
  if (!normalizeOtp(deliveryOtp)) return false;
  return service === "food" || service === "parcel";
}

async function claimPickupNotify(orderCorePk: number): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .update(ordersCore)
    .set({
      pickupOtpRadiusNotifiedAt: now,
      updatedAt: now,
    })
    .where(
      and(eq(ordersCore.id, orderCorePk), isNull(ordersCore.pickupOtpRadiusNotifiedAt))
    )
    .returning({ id: ordersCore.id });
  return row?.id != null;
}

async function claimDeliveryNotify(orderCorePk: number): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .update(ordersCore)
    .set({
      deliveryOtpRadiusNotifiedAt: now,
      updatedAt: now,
    })
    .where(
      and(eq(ordersCore.id, orderCorePk), isNull(ordersCore.deliveryOtpRadiusNotifiedAt))
    )
    .returning({ id: ordersCore.id });
  return row?.id != null;
}

async function sendPickupOtpPush(args: {
  orderIdText: string;
  customerUserId: string;
  riderName: string;
  pickupOtp: string | null;
  liveService: "food" | "ride" | "parcel";
}): Promise<void> {
  const isRide = args.liveService === "ride";
  const liveTitle = isRide ? "Captain Has Arrived" : "Delivery Partner Has Arrived";
  const liveBody = isRide
    ? `${args.riderName} has arrived at the pickup location.`
    : `Pickup OTP ${args.pickupOtp ?? ""}`.trim();
  const rideBody = args.pickupOtp
    ? `${args.riderName} has arrived at the pickup location. Share your pickup PIN ${args.pickupOtp} with the captain.`
    : `${args.riderName} has arrived at the pickup location.`;
  await sendNotification({
    templateCode: "CUSTOMER_PICKUP_OTP_ARRIVED",
    variables: {
      orderId: args.orderIdText,
      orderShortId: args.orderIdText,
      riderName: args.riderName,
      rider_name: args.riderName,
      pickupOtp: args.pickupOtp ?? "",
      pickup_otp: args.pickupOtp ?? "",
    },
    target: { user_id: args.customerUserId },
    idempotencyKey: `CUSTOMER_PICKUP_OTP_ARRIVED:${args.orderIdText}`,
    ...(isRide
      ? {
          overrides: {
            title: liveTitle,
            body: rideBody,
          },
        }
      : {}),
    metadata: {
      gmLiveProgress: true,
      liveService: args.liveService,
      liveTitle,
      liveBody,
      liveStep: 3,
      liveSteps: 6,
      orderId: args.orderIdText,
      pickupOtp: args.pickupOtp ?? "",
      gmType: "CUSTOMER_PICKUP_OTP_ARRIVED",
    },
  });
}

async function sendDeliveryOtpPush(args: {
  orderIdText: string;
  customerUserId: string;
  riderName: string;
  deliveryOtp: string;
  liveService: "food" | "ride" | "parcel";
}): Promise<void> {
  await sendNotification({
    templateCode: "CUSTOMER_DELIVERY_OTP_NEARBY",
    variables: {
      orderId: args.orderIdText,
      orderShortId: args.orderIdText,
      riderName: args.riderName,
      rider_name: args.riderName,
      deliveryOtp: args.deliveryOtp,
      delivery_otp: args.deliveryOtp,
    },
    target: { user_id: args.customerUserId },
    idempotencyKey: `CUSTOMER_DELIVERY_OTP_NEARBY:${args.orderIdText}`,
    metadata: {
      gmLiveProgress: true,
      liveService: args.liveService,
      liveTitle: "Delivery Partner Is Near You",
      liveBody: `Delivery OTP ${args.deliveryOtp}`,
      orderId: args.orderIdText,
      deliveryOtp: args.deliveryOtp,
      gmType: "CUSTOMER_DELIVERY_OTP_NEARBY",
    },
  });
}

/**
 * Mark-reached / explicit arrival: claim stamp + send OTP push (once).
 * Safe to call repeatedly — claim is atomic.
 */
export async function notifyCustomerPickupOtpOnRadius(args: {
  orderIdText: string;
  riderId: number;
  riderName?: string | null;
}): Promise<void> {
  try {
    const order = await loadOrderForRadius(args.orderIdText);
    if (!order || isTerminal(order.status, order.currentStatus)) return;
    const service = serviceTypeOf(order.orderType);
    if (!service) return;
    const pickupOtp = normalizeOtp(order.pickupOtp);
    const isRide = service === "person_ride";
    if (!isRide && !wantsPickupOtpPush(service, order.pickupOtp)) return;
    if (!isRide && !pickupOtp) return;
    if (!(await claimPickupNotify(order.id))) return;

    const customerUserId = await customerUserIdForCorePk(order.id);
    if (!customerUserId) return;
    const riderName =
      args.riderName?.trim() || (await riderDisplayName(args.riderId, service));
    await sendPickupOtpPush({
      orderIdText: order.orderId.trim(),
      customerUserId,
      riderName,
      pickupOtp,
      liveService: isRide ? "ride" : service,
    });
  } catch (err) {
    console.warn(
      "[otp-radius] pickup OTP push failed (tolerated)",
      (err as Error).message
    );
  }
}

export async function notifyCustomerDeliveryOtpOnRadius(args: {
  orderIdText: string;
  riderId?: number | null;
  riderName?: string | null;
}): Promise<void> {
  try {
    const order = await loadOrderForRadius(args.orderIdText);
    if (!order || isTerminal(order.status, order.currentStatus)) return;
    const service = serviceTypeOf(order.orderType);
    if (!service || !wantsDeliveryOtpPush(service, order.deliveryOtp)) return;
    const deliveryOtp = normalizeOtp(order.deliveryOtp);
    if (!deliveryOtp) return;
    if (!(await claimDeliveryNotify(order.id))) return;

    const customerUserId = await customerUserIdForCorePk(order.id);
    if (!customerUserId) return;
    const riderId = args.riderId != null && args.riderId > 0 ? args.riderId : order.riderId;
    const riderName =
      args.riderName?.trim() ||
      (riderId != null ? await riderDisplayName(Number(riderId), service) : "Your delivery partner");
    await sendDeliveryOtpPush({
      orderIdText: order.orderId.trim(),
      customerUserId,
      riderName,
      deliveryOtp,
      liveService: service === "person_ride" ? "ride" : service,
    });
  } catch (err) {
    console.warn(
      "[otp-radius] delivery OTP push failed (tolerated)",
      (err as Error).message
    );
  }
}

/**
 * Auto path: on live GPS update, if rider first enters configured radius, notify once.
 * Does not change order status — only OTP push + stamp.
 */
export async function maybeNotifyOtpOnLiveLocation(args: {
  riderId: number;
  orderRef: string;
  lat: number;
  lng: number;
}): Promise<void> {
  try {
    const order = await loadOrderForRadius(args.orderRef);
    if (!order || isTerminal(order.status, order.currentStatus)) return;
    if (order.riderId != null && Number(order.riderId) !== args.riderId) return;

    const service = serviceTypeOf(order.orderType);
    if (!service) return;

    const gps = { lat: args.lat, lng: args.lng };
    const needsPickup =
      wantsPickupOtpPush(service, order.pickupOtp) && !order.pickupOtpRadiusNotifiedAt;
    const needsDelivery =
      wantsDeliveryOtpPush(service, order.deliveryOtp) &&
      !order.deliveryOtpRadiusNotifiedAt;

    if (needsPickup) {
      const evalPickup = await evaluateMilestoneGeoFence({
        riderId: args.riderId,
        orderCorePk: order.id,
        serviceType: service,
        milestoneKey: pickupMilestone(service),
        gps,
      });
      if (evalPickup.withinRadius) {
        await notifyCustomerPickupOtpOnRadius({
          orderIdText: order.orderId.trim(),
          riderId: args.riderId,
        });
      }
    }

    if (needsDelivery) {
      // Delivery OTP only after parcel/food is on the drop leg.
      const st = String(order.status ?? "").toLowerCase();
      const cur = String(order.currentStatus ?? "").toUpperCase();
      const onDropLeg =
        service === "person_ride"
          ? false
          : st === "picked_up" ||
            st === "in_transit" ||
            cur === "OUT_FOR_DELIVERY" ||
            cur === "ON_THE_WAY" ||
            cur === "REACHED_CUSTOMER" ||
            cur === "IN_TRANSIT" ||
            cur === "DISPATCHED";
      if (!onDropLeg) return;

      const evalDrop = await evaluateMilestoneGeoFence({
        riderId: args.riderId,
        orderCorePk: order.id,
        serviceType: service,
        milestoneKey: dropMilestone(service),
        gps,
      });
      if (evalDrop.withinRadius) {
        await notifyCustomerDeliveryOtpOnRadius({
          orderIdText: order.orderId.trim(),
          riderId: args.riderId,
        });
      }
    }
  } catch (err) {
    console.warn(
      "[otp-radius] live location check failed (tolerated)",
      (err as Error).message
    );
  }
}
