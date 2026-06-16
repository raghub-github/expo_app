/**
 * Rider dispatch pool — available ride orders, accept, reject.
 */

import { and, eq, isNull, inArray, or, sql, desc, asc, notInArray } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import {
  customers,
  ordersCore,
  ordersCoreItems,
  ordersFood,
  ordersParcel,
  ordersRide,
  riders,
} from "../../db/schema.js";
import { buildCustomerOrderDetailItemsFromJson } from "../../lib/customer-order-detail-items.js";
import { appendOrderTimeline } from "../../lib/order-placement-timeline.js";
import { isMerchantFoodOrderReady } from "../../lib/food-order-ready.js";
import {
  resolveDropCoordinates,
  resolveHumanAddressLabel,
  resolvePickupCoordinates,
} from "../../lib/resolve-order-map-coordinates.js";
import {
  recordDeliveredTimelineTx,
  recordDispatchedTimelineTx,
  recordRiderPickedUpTimelineTx,
} from "../../lib/order-food-status-timeline.js";
import { finalizeMerchantOrderDelivered } from "../../lib/merchant-order-delivered-wallet.js";
import {
  publishOrderEvent,
  publishStoreEvent,
} from "../realtime/publish.js";
import type { RiderDistanceSnapshot } from "../../lib/order-rider-assignment-history.js";
import { resolveRiderOrderDistanceSnapshot } from "../../lib/rider-order-distance-snapshot.js";
import { recordFoodRiderAssignedTimeline } from "../../lib/food-rider-assigned-timeline.js";
import { recordRiderAssignmentMilestone } from "../../lib/order-rider-assignment-history.js";
import { recordOrderDeliveryProofImageTx } from "../../lib/record-order-delivery-image.js";
import {
  assertFoodDeliveryOtpMatch,
  loadFoodDeliveryOtpCandidates,
} from "../../lib/resolve-food-delivery-otp.js";
import { recordRiderDispatchExclusion } from "../../lib/rider-dispatch-order-exclusion.js";
import {
  isValidRiderOrderRejectReasonCode,
  RIDER_ORDER_REJECT_REASON_LABELS,
} from "../../lib/rider-order-reject-reasons.js";
import { parseOrderRefParam } from "../../lib/order-ref-resolve.js";
import {
  assertRiderMilestoneGeoFence,
  getOrderMilestoneGeoFenceStatuses,
  type StatusMilestoneKey,
} from "../../lib/rider-status-geo-fence.js";
import {
  haversineDistanceMeters,
  listDispatchPoolOrdersForRider,
  resolveRiderAssignmentContext,
  validateRiderAcceptance,
  RiderDispatchIneligibleError,
  FOOD_DISPATCHABLE_ORDER_STATUSES,
  type DispatchPoolOrderRow,
} from "../../lib/order-assignment-engine.js";
import { completeOrderDispatch } from "../../lib/order-dispatch.service.js";
import { fetchFoodDispatchableStatusesForFlow } from "../../lib/food-rider-accept-flow.js";
import { recordDispatchAssignmentAudit } from "../../lib/rider-dispatch-assignment-audit.js";
import {
  recordRideRiderAccepted,
  recordRideRiderReachedPickup,
  recordRideRiderUnassign,
  recordRiderOrderAccepted,
} from "../../lib/rider-ride-assignment.js";
import {
  barcodeMatchesPickupToken,
  type FoodPickupVerificationMethod,
} from "../../lib/food-pickup-verification.js";
import { loadFoodPickupVerificationSettings } from "../../lib/food-pickup-verification-settings.js";

export const RIDER_ACCEPT_WINDOW_SEC = 60;
export { RIDER_DISPATCH_LOCATION_MAX_AGE_MINUTES } from "../../lib/order-assignment-engine.js";

/** Person ride pickup after OTP — passenger at pickup (not food `reached_store`). */
export const PERSON_RIDE_AT_USER_STATUS = "reached_user" as const;

/** Before OTP: only accepted (reach slide does not change orders_core.status). */
const PERSON_RIDE_PRE_PICKUP_OTP_STATUSES = ["accepted", "reached_store"] as const;

/** After OTP verified — start ride requires reached_user only. */
const PERSON_RIDE_READY_TO_START_STATUSES = [PERSON_RIDE_AT_USER_STATUS] as const;

export type RiderOrderSummary = {
  id: string;
  status: "pending" | "assigned" | "picked_up" | "in_transit" | "delivered" | "cancelled";
  category: "food" | "parcel" | "ride";
  pickup: { address: string; lat: number; lng: number };
  delivery: { address: string; lat: number; lng: number };
  distanceKm?: number;
  /** Rider GPS → pickup */
  pickupDistanceKm?: number;
  /** Pickup → drop trip distance */
  tripDistanceKm?: number;
  /** pickup + trip when both known */
  totalDistanceKm?: number;
  estimatedEarning: number;
  /** Base fare earning before customer tip boost */
  baseEarning?: number;
  /** Customer-added tip (ride tip boost) */
  customerTipAmount?: number;
  /** Base + tip — same as estimatedEarning when tip present */
  totalEarning?: number;
  higherDispatchPriority?: boolean;
  merchantName?: string | null;
  itemCount?: number;
  createdAt: string;
  acceptDeadlineAt?: string;
  rideType?: string;
  formattedOrderId?: string | null;
  atPickup?: boolean;
  /** Person ride: pickup OTP entered; trip not started until rider slides Start ride. */
  pickupOtpVerified?: boolean;
  rideStarted?: boolean;
  /** orders_food.order_status — updated only by merchant / agent / dashboard. */
  foodOrderStatus?: string | null;
  /** True when merchant marked ready (READY_FOR_PICKUP+). */
  merchantOrderReady?: boolean;
  /** ISO timestamp when rider marked reached pickup — persists across app restarts. */
  pickupWaitStartedAt?: string | null;
  /** Seconds waited at store until merchant ready. NULL while still waiting; 0 if pre-ready. */
  pickupWaitSeconds?: number | null;
  /** True when pickup_wait_seconds is persisted (waiting phase ended). */
  pickupWaitFinalized?: boolean;
  /** ISO timestamp when merchant marked order ready (orders_food.prepared_at). */
  preparedAt?: string | null;
  /** ISO timestamp when 3-minute pickup window started. */
  pickupTimerStartedAt?: string | null;
  /** Pickup window budget in seconds (default 180). */
  pickupTimerBudgetSeconds?: number;
  /** Seconds from pickup window start to picked up (set on pickup). */
  pickupDurationSeconds?: number | null;
  /** Kitchen prep deadline + delay inputs for rider delay UI. */
  prepReadyByAt?: string | null;
  acceptedAt?: string | null;
  preparingAt?: string | null;
  preparationTimeMinutes?: number | null;
  prepDelayMinutes?: number | null;
  /** True when rider marked reached customer (drop). */
  atCustomer?: boolean;
  customerName?: string | null;
  customerPhone?: string | null;
  pickupAddressGeocoded?: string;
  dropAddressGeocoded?: string;
  /** Line items for pickup verification screen. */
  foodItems?: RiderFoodOrderItem[];
  deliveryInstructions?: string | null;
  requiresUtensils?: boolean;
  restaurantPhone?: string | null;
  /** True when rider submitted or skipped merchant pickup feedback. */
  merchantFeedbackSubmitted?: boolean;
  /** True when rider submitted or skipped customer delivery feedback. */
  customerFeedbackSubmitted?: boolean;
  /** orders_core.payment_method — online, cod, upi, etc. */
  paymentMethod?: string | null;
  /** orders_core.payment_status — paid, pending, etc. */
  paymentStatus?: string | null;
};

export type RiderFoodOrderItem = {
  name: string;
  quantity: number;
  variantName?: string | null;
  customization?: string | null;
};

export type RiderGpsPayload = { lat?: number; lng?: number };

export type RiderDeliveryVerifyPayload = RiderGpsPayload & {
  deliveryImageUrl?: string;
  deliveryImageR2Key?: string;
};

async function riderDistanceAtMilestone(
  riderId: number,
  orderCorePk: number,
  gps?: RiderGpsPayload
): Promise<RiderDistanceSnapshot | undefined> {
  const snap = await resolveRiderOrderDistanceSnapshot(riderId, orderCorePk, gps);
  return snap ?? undefined;
}

function throwDispatchError(error: unknown): never {
  if (error instanceof RiderDispatchIneligibleError) {
    throw Object.assign(new Error(error.message), { statusCode: error.statusCode });
  }
  throw error;
}

function orderRefWhere(orderRef: string) {
  const { isNumericId, orderIdNum } = parseOrderRefParam(orderRef);
  if (isNumericId) {
    return eq(ordersCore.id, orderIdNum);
  }
  return or(eq(ordersCore.orderId, orderRef), eq(ordersCore.formattedOrderId, orderRef));
}

function parseCoord(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function estimateRiderEarning(fare: unknown, riderEarning: unknown): number {
  const direct = Number(riderEarning);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct);
  const fareNum = Number(fare);
  if (Number.isFinite(fareNum) && fareNum > 0) return Math.round(fareNum * 0.82);
  return 0;
}

function parseBillingAmount(snapshot: unknown, keys: string[]): number {
  if (snapshot == null || typeof snapshot !== "object") return 0;
  const obj = snapshot as Record<string, unknown>;
  for (const key of keys) {
    const n = Number(obj[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** Food/parcel pool: rider payout is delivery fee — never order grand total. */
function resolveRiderDeliveryFee(row: {
  riderEarning: string | null;
  fareAmount: string | null;
  billingSnapshot?: unknown;
}): number {
  const direct = Number(row.riderEarning);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct);

  const fromBilling = parseBillingAmount(row.billingSnapshot, [
    "delivery_fee",
    "final_delivery_fee",
    "deliveryFee",
    "finalDeliveryFee",
  ]);
  if (fromBilling > 0) return Math.round(fromBilling);

  const fare = Number(row.fareAmount);
  if (Number.isFinite(fare) && fare > 0) return Math.round(fare);

  return 0;
}

function resolveCustomerTipAmount(tipAmount: unknown): number {
  const tip = Number(tipAmount);
  return Number.isFinite(tip) && tip > 0 ? Math.round(tip) : 0;
}

type RideRow = {
  orderId: string | null;
  formattedOrderId: string | null;
  pickupAddressRaw: string;
  pickupLat: string;
  pickupLon: string;
  pickupAddressGeocoded?: string | null;
  dropAddressRaw: string;
  dropLat: string;
  dropLon: string;
  dropAddressGeocoded?: string | null;
  currentStatus?: string | null;
  distanceKm: string | null;
  riderEarning: string | null;
  fareAmount: string | null;
  grandTotal: string | null;
  createdAt: Date;
  rideType: string | null;
  estimatedFare: string | null;
  searchExpiresAt: Date | null;
  customerTipAmount?: string | null;
  higherDispatchPriority?: boolean | null;
  passengerName?: string | null;
  passengerPhone?: string | null;
  customerFullName?: string | null;
  customerPrimaryMobile?: string | null;
  pickupOtpVerifiedAt?: Date | null;
  /** orders_ride.pickup_address / drop_address — preferred over core raw lat/lng text */
  ridePickupAddress?: string | null;
  rideDropAddress?: string | null;
};

function resolveRideCustomer(row: RideRow): { name: string | null; phone: string | null } {
  const name = row.passengerName?.trim() || row.customerFullName?.trim() || null;
  const phone = row.passengerPhone?.trim() || row.customerPrimaryMobile?.trim() || null;
  return { name, phone };
}

function enrichOrderDistances(
  order: RiderOrderSummary,
  riderLat: number | null,
  riderLng: number | null
): RiderOrderSummary {
  const pickupLat = parseCoord(order.pickup.lat);
  const pickupLng = parseCoord(order.pickup.lng);
  const dropLat = parseCoord(order.delivery.lat);
  const dropLng = parseCoord(order.delivery.lng);

  const pickupDistanceKm =
    riderLat != null && riderLng != null && pickupLat && pickupLng
      ? haversineDistanceMeters(riderLat, riderLng, pickupLat, pickupLng) / 1000
      : undefined;

  const tripDistanceKm =
    order.distanceKm != null && Number.isFinite(order.distanceKm) && order.distanceKm > 0
      ? order.distanceKm
      : pickupLat && pickupLng && dropLat && dropLng
        ? haversineDistanceMeters(pickupLat, pickupLng, dropLat, dropLng) / 1000
        : undefined;

  const totalDistanceKm =
    pickupDistanceKm != null && tripDistanceKm != null
      ? pickupDistanceKm + tripDistanceKm
      : tripDistanceKm ?? pickupDistanceKm;

  return {
    ...order,
    pickupDistanceKm,
    tripDistanceKm,
    totalDistanceKm,
    distanceKm: tripDistanceKm ?? order.distanceKm,
  };
}

function mapRideRow(row: RideRow): RiderOrderSummary {
  const fare = row.estimatedFare ?? row.grandTotal ?? row.fareAmount;
  const baseEarning = estimateRiderEarning(fare, row.riderEarning);
  const tip = Number(row.customerTipAmount ?? 0);
  const tipRounded = Number.isFinite(tip) && tip > 0 ? Math.round(tip) : 0;
  const totalEarning = baseEarning + tipRounded;
  const canonicalId = row.orderId?.trim() || row.formattedOrderId?.trim() || "";
  const customer = resolveRideCustomer(row);
  return {
    id: canonicalId,
    status: "pending",
    category: "ride",
    pickup: {
      address: resolveHumanAddressLabel(
        [row.ridePickupAddress, row.pickupAddressGeocoded, row.pickupAddressRaw],
        "Pickup"
      ),
      lat: parseCoord(row.pickupLat),
      lng: parseCoord(row.pickupLon),
    },
    delivery: {
      address: resolveHumanAddressLabel(
        [row.rideDropAddress, row.dropAddressGeocoded, row.dropAddressRaw],
        "Drop location"
      ),
      lat: parseCoord(row.dropLat),
      lng: parseCoord(row.dropLon),
    },
    distanceKm: row.distanceKm != null ? Number(row.distanceKm) : undefined,
    baseEarning,
    customerTipAmount: tipRounded > 0 ? tipRounded : undefined,
    totalEarning: tipRounded > 0 ? totalEarning : undefined,
    estimatedEarning: tipRounded > 0 ? totalEarning : baseEarning,
    higherDispatchPriority: row.higherDispatchPriority === true,
    createdAt: row.createdAt.toISOString(),
    acceptDeadlineAt: row.searchExpiresAt?.toISOString?.() ?? undefined,
    rideType: row.rideType ?? undefined,
    formattedOrderId: row.formattedOrderId,
    customerName: customer.name,
    customerPhone: customer.phone,
    pickupAddressGeocoded: row.pickupAddressGeocoded?.trim() || undefined,
    dropAddressGeocoded: row.dropAddressGeocoded?.trim() || undefined,
  };
}

type FoodRow = {
  orderId: string | null;
  formattedOrderId: string | null;
  pickupAddressRaw: string;
  pickupLat: string;
  pickupLon: string;
  pickupAddressGeocoded?: string | null;
  dropAddressRaw: string;
  dropLat: string;
  dropLon: string;
  dropAddressGeocoded?: string | null;
  distanceKm: string | null;
  riderEarning: string | null;
  fareAmount: string | null;
  grandTotal: string | null;
  tipAmount: string | null;
  billingSnapshot: unknown;
  createdAt: Date;
  restaurantName: string | null;
  foodItemsCount: number | null;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
};

function resolveFoodPaymentFields(row: {
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  billingSnapshot?: unknown;
}): { paymentMethod: string | null; paymentStatus: string | null } {
  let paymentMethod = row.paymentMethod?.trim() || null;
  let paymentStatus = row.paymentStatus?.trim() || null;
  if (!paymentMethod && row.billingSnapshot && typeof row.billingSnapshot === "object") {
    const snap = row.billingSnapshot as Record<string, unknown>;
    const fromSnap =
      typeof snap.paymentMethod === "string"
        ? snap.paymentMethod
        : typeof snap.payment_method === "string"
          ? snap.payment_method
          : null;
    if (fromSnap?.trim()) paymentMethod = fromSnap.trim();
  }
  return { paymentMethod, paymentStatus };
}

function mapFoodRow(row: FoodRow): RiderOrderSummary {
  const payment = resolveFoodPaymentFields(row);
  const deliveryFee = resolveRiderDeliveryFee(row);
  const tipRounded = resolveCustomerTipAmount(row.tipAmount);
  const totalEarning = deliveryFee + tipRounded;
  const canonicalId = row.orderId?.trim() || row.formattedOrderId?.trim() || "";
  const pickupPin = resolvePickupCoordinates(
    row.pickupLat,
    row.pickupLon,
    row.pickupAddressGeocoded
  );
  const dropPin = resolveDropCoordinates(row.dropLat, row.dropLon, row.dropAddressGeocoded);
  return {
    id: canonicalId,
    status: "pending",
    category: "food",
    pickup: {
      address: row.pickupAddressRaw?.trim() || row.restaurantName?.trim() || "Restaurant pickup",
      lat: pickupPin?.lat ?? 0,
      lng: pickupPin?.lng ?? 0,
    },
    delivery: {
      address: row.dropAddressRaw?.trim() || "Delivery location",
      lat: dropPin?.lat ?? 0,
      lng: dropPin?.lng ?? 0,
    },
    distanceKm: row.distanceKm != null ? Number(row.distanceKm) : undefined,
    estimatedEarning: tipRounded > 0 ? totalEarning : deliveryFee,
    baseEarning: deliveryFee,
    customerTipAmount: tipRounded > 0 ? tipRounded : undefined,
    totalEarning: tipRounded > 0 ? totalEarning : deliveryFee,
    merchantName: row.restaurantName,
    itemCount: row.foodItemsCount ?? undefined,
    createdAt: row.createdAt.toISOString(),
    formattedOrderId: row.formattedOrderId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    pickupAddressGeocoded: row.pickupAddressGeocoded?.trim() || undefined,
    dropAddressGeocoded: row.dropAddressGeocoded?.trim() || undefined,
    paymentMethod: payment.paymentMethod,
    paymentStatus: payment.paymentStatus,
  };
}

type FoodRowWithStatus = FoodRow & {
  status?: string | null;
  currentStatus?: string | null;
  foodStatus?: string | null;
  riderReachedPickupAt?: Date | string | null;
  pickupWaitSeconds?: number | null;
  pickupTimerStartedAt?: Date | string | null;
  pickupDurationSeconds?: number | null;
  preparedAt?: Date | string | null;
  acceptedAt?: Date | string | null;
  preparingAt?: Date | string | null;
  prepReadyByAt?: Date | string | null;
  preparationTimeMinutes?: number | null;
  prepDelayMinutes?: number | null;
};

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const t = new Date(String(value)).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function attachFoodPrepTiming(
  summary: RiderOrderSummary,
  row: Pick<
    FoodRowWithStatus,
    | "acceptedAt"
    | "preparingAt"
    | "prepReadyByAt"
    | "preparationTimeMinutes"
    | "prepDelayMinutes"
  >
): RiderOrderSummary {
  return {
    ...summary,
    acceptedAt: toIsoOrNull(row.acceptedAt),
    preparingAt: toIsoOrNull(row.preparingAt),
    prepReadyByAt: toIsoOrNull(row.prepReadyByAt),
    preparationTimeMinutes:
      row.preparationTimeMinutes != null ? Number(row.preparationTimeMinutes) : null,
    prepDelayMinutes: row.prepDelayMinutes != null ? Number(row.prepDelayMinutes) : null,
  };
}

const FOOD_PICKUP_TIMER_BUDGET_SECONDS = 180;

function resolvePickupTimerStartedAtIso(
  riderReachedAt: string | null,
  preparedAt: Date | string | null | undefined,
  storedTimerStartedAt: Date | string | null | undefined,
  merchantReady: boolean
): string | null {
  const stored = toIsoOrNull(storedTimerStartedAt);
  if (stored) return stored;
  if (!merchantReady || !riderReachedAt) return null;
  const reachedMs = new Date(riderReachedAt).getTime();
  if (!Number.isFinite(reachedMs)) return null;
  const preparedIso = toIsoOrNull(preparedAt);
  const preparedMs = preparedIso ? new Date(preparedIso).getTime() : reachedMs;
  const startMs = Math.max(
    reachedMs,
    Number.isFinite(preparedMs) ? preparedMs : reachedMs
  );
  return new Date(startMs).toISOString();
}

function attachFoodPickupWait(
  summary: RiderOrderSummary,
  riderReachedPickupAt?: Date | string | null,
  storedPickupWaitSeconds?: number | null,
  pickupTimerStartedAt?: Date | string | null,
  pickupDurationSeconds?: number | null,
  preparedAt?: Date | string | null
): RiderOrderSummary {
  const startedAt = toIsoOrNull(riderReachedPickupAt);
  const preparedIso = toIsoOrNull(preparedAt);
  const timerStartedAt = resolvePickupTimerStartedAtIso(
    startedAt,
    preparedAt,
    pickupTimerStartedAt,
    !!summary.merchantOrderReady
  );

  if (!startedAt) {
    return {
      ...summary,
      ...(preparedIso ? { preparedAt: preparedIso } : {}),
    };
  }

  const waitFinalized = storedPickupWaitSeconds != null;
  const stillWaiting =
    !waitFinalized && !timerStartedAt && !summary.merchantOrderReady;

  return {
    ...summary,
    ...(preparedIso ? { preparedAt: preparedIso } : {}),
    pickupWaitStartedAt: startedAt,
    pickupWaitSeconds: waitFinalized
      ? Math.max(0, Number(storedPickupWaitSeconds) || 0)
      : stillWaiting
        ? null
        : storedPickupWaitSeconds,
    pickupWaitFinalized: waitFinalized,
    ...(timerStartedAt
      ? {
          pickupTimerStartedAt: timerStartedAt,
          pickupTimerBudgetSeconds: FOOD_PICKUP_TIMER_BUDGET_SECONDS,
        }
      : {}),
    ...(pickupDurationSeconds != null
      ? { pickupDurationSeconds: Math.max(0, Number(pickupDurationSeconds) || 0) }
      : {}),
  };
}

async function loadRiderFoodOrderItems(
  db: ReturnType<typeof getDb>,
  coreOrderPk: number,
  itemsJson: unknown
): Promise<RiderFoodOrderItem[]> {
  const coreItems = await db
    .select({
      itemName: ordersCoreItems.itemName,
      quantity: ordersCoreItems.quantity,
      variantName: ordersCoreItems.variantName,
    })
    .from(ordersCoreItems)
    .where(eq(ordersCoreItems.orderId, String(coreOrderPk)));

  if (coreItems.length > 0) {
    return coreItems.map((i) => ({
      name: i.itemName?.trim() || "Item",
      quantity: Math.max(1, Number(i.quantity) || 1),
      variantName: i.variantName?.trim() || null,
    }));
  }

  const fromJson = buildCustomerOrderDetailItemsFromJson(
    Array.isArray(itemsJson) ? (itemsJson as Parameters<typeof buildCustomerOrderDetailItemsFromJson>[0]) : null
  );
  return fromJson.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    variantName: i.variantName,
    customization: i.customization,
  }));
}

function mapFoodRowWithStatus(row: FoodRowWithStatus): RiderOrderSummary {
  const base = mapFoodRow(row);
  const coreSt = String(row.status ?? "accepted");
  const foodSt = String(row.foodStatus ?? "").trim().toUpperCase();
  const currentSt = String(row.currentStatus ?? "").trim().toUpperCase();
  const atPickup = coreSt === "reached_store" || currentSt === "RIDER_AT_PICKUP";
  /** Rider left restaurant with order — not merchant/dashboard "Dispatch Ready" (core may be picked_up while food is still READY_FOR_PICKUP). */
  const foodPickedUp =
    foodSt === "OUT_FOR_DELIVERY" ||
    currentSt === "OUT_FOR_DELIVERY" ||
    currentSt === "DISPATCHED" ||
    currentSt === "IN_TRANSIT" ||
    coreSt === "in_transit";
  const atCustomer = currentSt === "REACHED_CUSTOMER";
  const rideStarted =
    foodPickedUp && coreSt !== "delivered" && foodSt !== "DELIVERED";
  let status: RiderOrderSummary["status"] = "assigned";
  if (coreSt === "delivered" || foodSt === "DELIVERED") status = "delivered";
  else if (rideStarted) status = "in_transit";
  else if (coreSt === "cancelled" || foodSt === "CANCELLED" || foodSt === "RTO") {
    status = "cancelled";
  }
  const merchantOrderReady = isMerchantFoodOrderReady(foodSt);
  return attachFoodPrepTiming(
    attachFoodPickupWait(
      {
        ...base,
        atPickup,
        rideStarted,
        atCustomer,
        status,
        foodOrderStatus: foodSt || null,
        merchantOrderReady,
      },
      row.riderReachedPickupAt,
      row.pickupWaitSeconds,
      row.pickupTimerStartedAt,
      row.pickupDurationSeconds,
      row.preparedAt
    ),
    row
  );
}

type ParcelRowWithStatus = ParcelRow & {
  status?: string | null;
  currentStatus?: string | null;
};

function mapParcelRowWithStatus(row: ParcelRowWithStatus): RiderOrderSummary {
  const base = mapParcelRow(row);
  const coreSt = String(row.status ?? "accepted");
  const currentSt = String(row.currentStatus ?? "").trim().toUpperCase();
  const atPickup = coreSt === "reached_store" || currentSt === "RIDER_AT_PICKUP";
  const rideStarted =
    coreSt === "picked_up" || coreSt === "in_transit" || currentSt === "OUT_FOR_DELIVERY";
  let status: RiderOrderSummary["status"] = "assigned";
  if (rideStarted) status = "in_transit";
  else if (coreSt === "delivered") status = "delivered";
  else if (coreSt === "cancelled") status = "cancelled";
  return { ...base, atPickup, rideStarted, status };
}

type ParcelRow = {
  orderId: string | null;
  formattedOrderId: string | null;
  pickupAddressRaw: string;
  pickupLat: string;
  pickupLon: string;
  dropAddressRaw: string;
  dropLat: string;
  dropLon: string;
  distanceKm: string | null;
  riderEarning: string | null;
  fareAmount: string | null;
  grandTotal: string | null;
  tipAmount: string | null;
  billingSnapshot: unknown;
  createdAt: Date;
};

function mapParcelRow(row: ParcelRow): RiderOrderSummary {
  const deliveryFee = resolveRiderDeliveryFee(row);
  const tipRounded = resolveCustomerTipAmount(row.tipAmount);
  const totalEarning = deliveryFee + tipRounded;
  const canonicalId = row.orderId?.trim() || row.formattedOrderId?.trim() || "";
  return {
    id: canonicalId,
    status: "pending",
    category: "parcel",
    pickup: {
      address: row.pickupAddressRaw?.trim() || "Pickup",
      lat: parseCoord(row.pickupLat),
      lng: parseCoord(row.pickupLon),
    },
    delivery: {
      address: row.dropAddressRaw?.trim() || "Delivery location",
      lat: parseCoord(row.dropLat),
      lng: parseCoord(row.dropLon),
    },
    distanceKm: row.distanceKm != null ? Number(row.distanceKm) : undefined,
    estimatedEarning: tipRounded > 0 ? totalEarning : deliveryFee,
    baseEarning: deliveryFee,
    customerTipAmount: tipRounded > 0 ? tipRounded : undefined,
    totalEarning: tipRounded > 0 ? totalEarning : deliveryFee,
    createdAt: row.createdAt.toISOString(),
    formattedOrderId: row.formattedOrderId,
  };
}

async function hydrateDispatchPoolOrder(
  entry: DispatchPoolOrderRow,
  riderLat: number,
  riderLng: number
): Promise<RiderOrderSummary | null> {
  const db = getDb();

  if (entry.serviceType === "person_ride") {
    const [row] = await db
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        distanceKm: ordersCore.distanceKm,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        createdAt: ordersCore.createdAt,
        rideType: ordersRide.rideType,
        estimatedFare: ordersRide.estimatedFare,
        searchExpiresAt: ordersRide.searchExpiresAt,
        customerTipAmount: ordersRide.customerTipAmount,
        higherDispatchPriority: ordersRide.higherDispatchPriority,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .where(eq(ordersCore.id, entry.orderCoreId))
      .limit(1);
    if (!row?.orderId) return null;
    return enrichOrderDistances(mapRideRow(row as RideRow), riderLat, riderLng);
  }

  if (entry.serviceType === "food") {
    const [row] = await db
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        distanceKm: ordersCore.distanceKm,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        tipAmount: ordersCore.tipAmount,
        billingSnapshot: ordersCore.billingSnapshot,
        createdAt: ordersCore.createdAt,
        restaurantName: ordersFood.restaurantName,
        foodItemsCount: ordersFood.foodItemsCount,
        customerName: ordersFood.customerName,
        customerPhone: ordersFood.customerPhone,
      })
      .from(ordersCore)
      .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
      .where(eq(ordersCore.id, entry.orderCoreId))
      .limit(1);
    if (!row?.orderId) return null;
    return enrichOrderDistances(mapFoodRow(row), riderLat, riderLng);
  }

  const [row] = await db
    .select({
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropAddressRaw: ordersCore.dropAddressRaw,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      distanceKm: ordersCore.distanceKm,
      riderEarning: ordersCore.riderEarning,
      fareAmount: ordersCore.fareAmount,
      grandTotal: ordersCore.grandTotal,
      tipAmount: ordersCore.tipAmount,
      billingSnapshot: ordersCore.billingSnapshot,
      createdAt: ordersCore.createdAt,
    })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(eq(ordersCore.id, entry.orderCoreId))
    .limit(1);
  if (!row?.orderId) return null;
  return enrichOrderDistances(mapParcelRow(row), riderLat, riderLng);
}

export async function getAvailableOrdersForRider(riderId: number): Promise<RiderOrderSummary[]> {
  const pool = await listDispatchPoolOrdersForRider(riderId);
  if (pool.length === 0) return [];

  const ctx = await resolveRiderAssignmentContext(riderId);
  if (!ctx) return [];

  const summaries: RiderOrderSummary[] = [];
  for (const entry of pool) {
    try {
      const summary = await hydrateDispatchPoolOrder(entry, ctx.lat, ctx.lng);
      if (summary) summaries.push(summary);
    } catch (err) {
      console.warn(
        "[dispatch] hydrate available order failed",
        entry.orderId,
        (err as Error).message
      );
    }
  }
  return summaries;
}

const ACTIVE_CORE_TERMINAL_STATUSES = ["delivered", "cancelled", "failed"] as const;
const ACTIVE_FOOD_TERMINAL_STATUSES = ["DELIVERED", "CANCELLED", "RTO"] as const;

export async function getActiveOrdersForRider(riderId: number): Promise<RiderOrderSummary[]> {
  const db = getDb();

  const [rideRows, foodRows, parcelRows] = await Promise.all([
    db
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        distanceKm: ordersCore.distanceKm,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        createdAt: ordersCore.createdAt,
        status: ordersCore.status,
        rideType: ordersRide.rideType,
        estimatedFare: ordersRide.estimatedFare,
        searchExpiresAt: ordersRide.searchExpiresAt,
        pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
        passengerName: ordersRide.passengerName,
        passengerPhone: ordersRide.passengerPhone,
        ridePickupAddress: ordersRide.pickupAddress,
        rideDropAddress: ordersRide.dropAddress,
        customerFullName: customers.fullName,
        customerPrimaryMobile: customers.primaryMobile,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .leftJoin(customers, eq(ordersCore.customerId, customers.id))
      .where(
        and(
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "person_ride"),
          notInArray(ordersCore.status, [...ACTIVE_CORE_TERMINAL_STATUSES]),
          sql`${ordersRide.cancelledAt} IS NULL`
        )
      )
      .orderBy(desc(ordersCore.updatedAt))
      .limit(5),
    db
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        dropAddressGeocoded: ordersCore.dropAddressGeocoded,
        distanceKm: ordersCore.distanceKm,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        tipAmount: ordersCore.tipAmount,
        billingSnapshot: ordersCore.billingSnapshot,
        createdAt: ordersCore.createdAt,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        foodStatus: ordersFood.orderStatus,
        riderReachedPickupAt: ordersFood.riderReachedPickupAt,
        pickupWaitSeconds: ordersFood.pickupWaitSeconds,
        pickupTimerStartedAt: ordersFood.pickupTimerStartedAt,
        pickupDurationSeconds: ordersFood.pickupDurationSeconds,
        preparedAt: ordersFood.preparedAt,
        acceptedAt: ordersFood.acceptedAt,
        preparingAt: ordersFood.preparingAt,
        prepReadyByAt: ordersFood.prepReadyByAt,
        preparationTimeMinutes: ordersFood.preparationTimeMinutes,
        prepDelayMinutes: ordersFood.prepDelayMinutes,
        restaurantName: ordersFood.restaurantName,
        foodItemsCount: ordersFood.foodItemsCount,
        customerName: ordersFood.customerName,
        customerPhone: ordersFood.customerPhone,
      })
      .from(ordersCore)
      .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
      .where(
        and(
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "food"),
          notInArray(ordersCore.status, [...ACTIVE_CORE_TERMINAL_STATUSES]),
          notInArray(ordersFood.orderStatus, [...ACTIVE_FOOD_TERMINAL_STATUSES]),
          sql`${ordersFood.cancelledAt} IS NULL`
        )
      )
      .orderBy(desc(ordersCore.updatedAt))
      .limit(5),
    db
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        distanceKm: ordersCore.distanceKm,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        tipAmount: ordersCore.tipAmount,
        billingSnapshot: ordersCore.billingSnapshot,
        createdAt: ordersCore.createdAt,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
      })
      .from(ordersCore)
      .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
      .where(
        and(
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "parcel"),
          notInArray(ordersCore.status, [...ACTIVE_CORE_TERMINAL_STATUSES])
        )
      )
      .orderBy(desc(ordersCore.updatedAt))
      .limit(5),
  ]);

  const summaries: RiderOrderSummary[] = [
    ...rideRows
      .filter((r) => r.orderId)
      .map((r) => mapRideRowWithStatus(r as RideRow & { status?: string | null }, r.status)),
    ...foodRows.filter((r) => r.orderId).map((r) => mapFoodRowWithStatus(r)),
    ...parcelRows.filter((r) => r.orderId).map((r) => mapParcelRowWithStatus(r)),
  ];

  return summaries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export type RiderOrderHistoryCategory = "food" | "ride" | "parcel" | "all";

export type RiderOrderHistoryResult = {
  orders: RiderOrderSummary[];
  total: number;
  hasMore: boolean;
};

/** @deprecated Use RiderOrderHistoryResult */
export type RiderRideOrderHistoryResult = RiderOrderHistoryResult;

const HISTORY_CORE_TERMINAL = ["delivered", "cancelled", "failed"] as const;
const HISTORY_FOOD_TERMINAL = ["DELIVERED", "CANCELLED", "RTO"] as const;

export function parseRiderOrderHistoryCategory(
  raw?: string | null
): RiderOrderHistoryCategory {
  const v = String(raw ?? "all")
    .trim()
    .toLowerCase();
  if (v === "food") return "food";
  if (v === "parcel") return "parcel";
  if (v === "ride" || v === "person" || v === "person_ride") return "ride";
  return "all";
}

async function fetchPersonRideOrderHistory(
  riderId: number,
  limit: number,
  offset: number
): Promise<RiderOrderHistoryResult> {
  const db = getDb();

  const historyWhere = and(
    eq(ordersCore.riderId, riderId),
    eq(ordersCore.orderType, "person_ride"),
    or(
      inArray(ordersCore.status, [...HISTORY_CORE_TERMINAL]),
      sql`${ordersRide.cancelledAt} IS NOT NULL`
    )
  );

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(historyWhere);

  const total = Number(countRow?.count ?? 0);

  const rideRows = await db
    .select({
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
      dropAddressRaw: ordersCore.dropAddressRaw,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      dropAddressGeocoded: ordersCore.dropAddressGeocoded,
      distanceKm: ordersCore.distanceKm,
      riderEarning: ordersCore.riderEarning,
      fareAmount: ordersCore.fareAmount,
      grandTotal: ordersCore.grandTotal,
      tipAmount: ordersCore.tipAmount,
      createdAt: ordersCore.createdAt,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      rideType: ordersRide.rideType,
      estimatedFare: ordersRide.estimatedFare,
      searchExpiresAt: ordersRide.searchExpiresAt,
      pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
      passengerName: ordersRide.passengerName,
      passengerPhone: ordersRide.passengerPhone,
      ridePickupAddress: ordersRide.pickupAddress,
      rideDropAddress: ordersRide.dropAddress,
      customerFullName: customers.fullName,
      customerPrimaryMobile: customers.primaryMobile,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .leftJoin(customers, eq(ordersCore.customerId, customers.id))
    .where(historyWhere)
    .orderBy(desc(ordersCore.updatedAt))
    .limit(limit)
    .offset(offset);

  const orders = rideRows
    .filter((r) => r.orderId)
    .map((r) =>
      mapRideRowWithStatus(
        {
          ...r,
          customerTipAmount: r.tipAmount,
          ridePickupAddress: r.ridePickupAddress,
          rideDropAddress: r.rideDropAddress,
        } as RideRow & {
          status?: string | null;
          pickupOtpVerifiedAt?: Date | null;
          currentStatus?: string | null;
        },
        r.status,
        r.currentStatus
      )
    );

  return {
    orders,
    total,
    hasMore: offset + orders.length < total,
  };
}

async function fetchFoodOrderHistory(
  riderId: number,
  limit: number,
  offset: number
): Promise<RiderOrderHistoryResult> {
  const db = getDb();

  const historyWhere = and(
    eq(ordersCore.riderId, riderId),
    eq(ordersCore.orderType, "food"),
    or(
      inArray(ordersCore.status, [...HISTORY_CORE_TERMINAL]),
      inArray(ordersFood.orderStatus, [...HISTORY_FOOD_TERMINAL]),
      sql`${ordersFood.cancelledAt} IS NOT NULL`
    )
  );

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ordersCore)
    .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(historyWhere);

  const total = Number(countRow?.count ?? 0);

  const foodRows = await db
    .select({
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
      dropAddressRaw: ordersCore.dropAddressRaw,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      dropAddressGeocoded: ordersCore.dropAddressGeocoded,
      distanceKm: ordersCore.distanceKm,
      riderEarning: ordersCore.riderEarning,
      fareAmount: ordersCore.fareAmount,
      grandTotal: ordersCore.grandTotal,
      tipAmount: ordersCore.tipAmount,
      billingSnapshot: ordersCore.billingSnapshot,
      createdAt: ordersCore.createdAt,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      foodStatus: ordersFood.orderStatus,
      restaurantName: ordersFood.restaurantName,
      foodItemsCount: ordersFood.foodItemsCount,
      customerName: ordersFood.customerName,
      customerPhone: ordersFood.customerPhone,
    })
    .from(ordersCore)
    .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(historyWhere)
    .orderBy(desc(ordersCore.updatedAt))
    .limit(limit)
    .offset(offset);

  const orders = foodRows
    .filter((r) => r.orderId)
    .map((r) => mapFoodRowWithStatus(r as FoodRowWithStatus));

  return {
    orders,
    total,
    hasMore: offset + orders.length < total,
  };
}

async function fetchParcelOrderHistory(
  riderId: number,
  limit: number,
  offset: number
): Promise<RiderOrderHistoryResult> {
  const db = getDb();

  const historyWhere = and(
    eq(ordersCore.riderId, riderId),
    eq(ordersCore.orderType, "parcel"),
    inArray(ordersCore.status, [...HISTORY_CORE_TERMINAL])
  );

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(historyWhere);

  const total = Number(countRow?.count ?? 0);

  const parcelRows = await db
    .select({
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropAddressRaw: ordersCore.dropAddressRaw,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      distanceKm: ordersCore.distanceKm,
      riderEarning: ordersCore.riderEarning,
      fareAmount: ordersCore.fareAmount,
      grandTotal: ordersCore.grandTotal,
      tipAmount: ordersCore.tipAmount,
      billingSnapshot: ordersCore.billingSnapshot,
      createdAt: ordersCore.createdAt,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
    })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(historyWhere)
    .orderBy(desc(ordersCore.updatedAt))
    .limit(limit)
    .offset(offset);

  const orders = parcelRows
    .filter((r) => r.orderId)
    .map((r) => mapParcelRowWithStatus(r as ParcelRowWithStatus));

  return {
    orders,
    total,
    hasMore: offset + orders.length < total,
  };
}

/** Terminal orders for this rider (food, person ride, parcel) — newest first. */
export async function getOrderHistoryForRider(
  riderId: number,
  opts?: {
    limit?: number;
    offset?: number;
    category?: RiderOrderHistoryCategory;
  }
): Promise<RiderOrderHistoryResult> {
  const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 100);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const category = opts?.category ?? "all";

  if (category === "ride") {
    return fetchPersonRideOrderHistory(riderId, limit, offset);
  }
  if (category === "food") {
    return fetchFoodOrderHistory(riderId, limit, offset);
  }
  if (category === "parcel") {
    return fetchParcelOrderHistory(riderId, limit, offset);
  }

  const fetchCap = limit + offset;
  const [rides, foods, parcels] = await Promise.all([
    fetchPersonRideOrderHistory(riderId, fetchCap, 0),
    fetchFoodOrderHistory(riderId, fetchCap, 0),
    fetchParcelOrderHistory(riderId, fetchCap, 0),
  ]);

  const merged = [...rides.orders, ...foods.orders, ...parcels.orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const orders = merged.slice(offset, offset + limit);
  const total = rides.total + foods.total + parcels.total;

  return {
    orders,
    total,
    hasMore: offset + orders.length < total,
  };
}

/** @deprecated Use getOrderHistoryForRider */
export async function getRideOrderHistoryForRider(
  riderId: number,
  opts?: { limit?: number; offset?: number }
): Promise<RiderOrderHistoryResult> {
  return getOrderHistoryForRider(riderId, { ...opts, category: "ride" });
}

async function loadRideSummaryForRider(
  riderId: number,
  orderRef: string
): Promise<RiderOrderSummary | null> {
  const db = getDb();
  const [row] = await db
    .select({
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
      dropAddressRaw: ordersCore.dropAddressRaw,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      dropAddressGeocoded: ordersCore.dropAddressGeocoded,
      distanceKm: ordersCore.distanceKm,
      riderEarning: ordersCore.riderEarning,
      fareAmount: ordersCore.fareAmount,
      grandTotal: ordersCore.grandTotal,
      createdAt: ordersCore.createdAt,
      status: ordersCore.status,
      rideType: ordersRide.rideType,
      estimatedFare: ordersRide.estimatedFare,
      searchExpiresAt: ordersRide.searchExpiresAt,
      pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
      passengerName: ordersRide.passengerName,
      passengerPhone: ordersRide.passengerPhone,
      ridePickupAddress: ordersRide.pickupAddress,
      rideDropAddress: ordersRide.dropAddress,
      customerFullName: customers.fullName,
      customerPrimaryMobile: customers.primaryMobile,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .leftJoin(customers, eq(ordersCore.customerId, customers.id))
    .where(
      and(
        orderRefWhere(orderRef),
        eq(ordersCore.orderType, "person_ride"),
        eq(ordersCore.riderId, riderId)
      )
    )
    .limit(1);

  if (!row?.orderId) return null;
  return mapRideRowWithStatus(row as RideRow & { status?: string | null }, row.status);
}

export async function acceptOrderForRider(
  riderId: number,
  orderRef: string
): Promise<RiderOrderSummary> {
  const db = getDb();
  const [meta] = await db
    .select({ orderType: ordersCore.orderType })
    .from(ordersCore)
    .where(orderRefWhere(orderRef))
    .limit(1);

  if (!meta?.orderType) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }

  if (meta.orderType === "food") {
    return acceptFoodOrderForRider(riderId, orderRef);
  }
  if (meta.orderType === "person_ride") {
    return acceptRideOrderForRider(riderId, orderRef);
  }
  if (meta.orderType === "parcel") {
    return acceptParcelOrderForRider(riderId, orderRef);
  }

  throw Object.assign(new Error("Order type not supported for rider accept"), { statusCode: 409 });
}

async function acceptFoodOrderForRider(
  riderId: number,
  orderRef: string
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();
  const dispatchableStatuses = [...(await fetchFoodDispatchableStatusesForFlow())];

  const [preCheck] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      foodStatus: ordersFood.orderStatus,
    })
    .from(ordersCore)
    .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(
      and(
        orderRefWhere(orderRef),
        eq(ordersCore.orderType, "food"),
        isNull(ordersCore.riderId),
        inArray(ordersFood.orderStatus, dispatchableStatuses),
        sql`${ordersFood.cancelledAt} IS NULL`
      )
    )
    .limit(1);

  if (!preCheck?.id || !preCheck.orderId) {
    throw Object.assign(new Error("Order not available"), { statusCode: 409 });
  }

  const foodStatusAtAccept = String(preCheck.foodStatus ?? "").trim().toUpperCase();

  try {
    await validateRiderAcceptance(
      riderId,
      "food",
      {
        latitude: parseCoord(preCheck.pickupLat),
        longitude: parseCoord(preCheck.pickupLon),
      },
      { orderCoreId: preCheck.id }
    );
  } catch (error) {
    throwDispatchError(error);
  }

  const [riderProfile] = await db
    .select({ name: riders.name, mobile: riders.mobile })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);

  const accepted = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        foodStatus: ordersFood.orderStatus,
      })
      .from(ordersCore)
      .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
      .where(
        and(
          eq(ordersCore.id, preCheck.id),
          isNull(ordersCore.riderId),
          inArray(ordersFood.orderStatus, dispatchableStatuses),
          sql`${ordersFood.cancelledAt} IS NULL`
        )
      )
      .limit(1);

    if (!existing?.id || !existing.orderId) {
      throw Object.assign(new Error("Order not available"), { statusCode: 409 });
    }

    const currentFoodStatus = String(existing.foodStatus ?? foodStatusAtAccept).trim().toUpperCase();
    const readyNow = currentFoodStatus === "READY_FOR_PICKUP";
    const nextCoreStatus = readyNow ? "OUT_FOR_DELIVERY" : "RIDER_ASSIGNED";
    const nextFoodStatus = readyNow ? "OUT_FOR_DELIVERY" : currentFoodStatus;

    const [updated] = await tx
      .update(ordersCore)
      .set({
        riderId,
        status: "accepted",
        currentStatus: nextCoreStatus,
        updatedAt: now,
      })
      .where(and(eq(ordersCore.id, existing.id), isNull(ordersCore.riderId)))
      .returning({ id: ordersCore.id });

    if (!updated?.id) {
      throw Object.assign(new Error("Order already taken"), { statusCode: 409 });
    }

    await tx
      .update(ordersFood)
      .set({
        riderId,
        riderName: riderProfile?.name ?? null,
        riderPhone: riderProfile?.mobile ?? null,
        orderStatus: nextFoodStatus,
        ...(readyNow ? { dispatchedAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(ordersFood.orderId, updated.id));

    await recordFoodRiderAssignedTimeline(tx, {
      orderCorePk: updated.id,
      previousStatus: currentFoodStatus,
      riderId,
      riderName: riderProfile?.name ?? null,
      statusMessage: readyNow
        ? "Rider accepted food delivery"
        : "Delivery partner assigned",
      occurredAt: now,
    });

    const orderIdText = existing.orderId.trim();
    await recordRiderOrderAccepted(tx, {
      orderCorePk: updated.id,
      orderIdText,
      riderId,
      serviceType: "food",
      occurredAt: now,
      riderName: riderProfile?.name ?? null,
      riderMobile: riderProfile?.mobile ?? null,
    });

    const [row] = await tx
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        distanceKm: ordersCore.distanceKm,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        tipAmount: ordersCore.tipAmount,
        billingSnapshot: ordersCore.billingSnapshot,
        createdAt: ordersCore.createdAt,
        restaurantName: ordersFood.restaurantName,
        foodItemsCount: ordersFood.foodItemsCount,
        customerName: ordersFood.customerName,
        customerPhone: ordersFood.customerPhone,
      })
      .from(ordersCore)
      .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
      .where(eq(ordersCore.id, updated.id))
      .limit(1);

    if (!row?.orderId) throw new Error("Accepted order missing");
    return mapFoodRow(row);
  });

  await completeOrderDispatch(preCheck.id, "accepted");

  const orderIdText = preCheck.orderId.trim();
  await recordDispatchAssignmentAudit({
    orderCoreId: preCheck.id,
    orderId: orderIdText,
    riderId,
    eventType: "accepted",
    acceptedAt: now,
    responseReceivedAt: now,
    actorType: "rider",
    actorId: String(riderId),
    metadata: { serviceType: "food", foodStatus: foodStatusAtAccept },
    occurredAt: now,
  });
  await recordDispatchAssignmentAudit({
    orderCoreId: preCheck.id,
    orderId: orderIdText,
    riderId,
    eventType: "assigned",
    assignedAt: now,
    actorType: "rider",
    actorId: String(riderId),
    metadata: { serviceType: "food", foodStatus: foodStatusAtAccept },
    occurredAt: now,
  });

  return { ...accepted, status: "assigned" };
}

async function acceptParcelOrderForRider(
  riderId: number,
  orderRef: string
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();

  const [preCheck] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
    })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(
      and(
        orderRefWhere(orderRef),
        eq(ordersCore.orderType, "parcel"),
        isNull(ordersCore.riderId),
        eq(ordersCore.currentStatus, "READY_FOR_PICKUP")
      )
    )
    .limit(1);

  if (!preCheck?.id || !preCheck.orderId) {
    throw Object.assign(new Error("Order not available"), { statusCode: 409 });
  }

  try {
    await validateRiderAcceptance(
      riderId,
      "parcel",
      {
        latitude: parseCoord(preCheck.pickupLat),
        longitude: parseCoord(preCheck.pickupLon),
      },
      { orderCoreId: preCheck.id }
    );
  } catch (error) {
    throwDispatchError(error);
  }

  const accepted = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: ordersCore.id, orderId: ordersCore.orderId })
      .from(ordersCore)
      .where(and(eq(ordersCore.id, preCheck.id), isNull(ordersCore.riderId)))
      .limit(1);

    if (!existing?.id || !existing.orderId) {
      throw Object.assign(new Error("Order not available"), { statusCode: 409 });
    }

    const [updated] = await tx
      .update(ordersCore)
      .set({
        riderId,
        status: "accepted",
        currentStatus: "OUT_FOR_DELIVERY",
        updatedAt: now,
      })
      .where(and(eq(ordersCore.id, existing.id), isNull(ordersCore.riderId)))
      .returning({ id: ordersCore.id });

    if (!updated?.id) {
      throw Object.assign(new Error("Order already taken"), { statusCode: 409 });
    }

    await appendOrderTimeline(tx, {
      orderCorePk: updated.id,
      status: "OUT_FOR_DELIVERY",
      previousStatus: "READY_FOR_PICKUP",
      actorType: "rider",
      actorId: riderId,
      statusMessage: "Rider accepted parcel delivery",
      occurredAt: now,
    });

    await recordRiderOrderAccepted(tx, {
      orderCorePk: updated.id,
      orderIdText: existing.orderId.trim(),
      riderId,
      serviceType: "parcel",
      occurredAt: now,
    });

    const [row] = await tx
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        distanceKm: ordersCore.distanceKm,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        tipAmount: ordersCore.tipAmount,
        billingSnapshot: ordersCore.billingSnapshot,
        createdAt: ordersCore.createdAt,
      })
      .from(ordersCore)
      .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
      .where(eq(ordersCore.id, updated.id))
      .limit(1);

    if (!row?.orderId) throw new Error("Accepted order missing");
    return mapParcelRow(row);
  });

  await completeOrderDispatch(preCheck.id, "accepted");
  return { ...accepted, status: "assigned" };
}

async function acceptRideOrderForRider(
  riderId: number,
  orderRef: string
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();

  const alreadyAccepted = await loadRideSummaryForRider(riderId, orderRef);
  if (alreadyAccepted) {
    return { ...alreadyAccepted, status: "assigned" };
  }

  const [preCheck] = await db
    .select({
      id: ordersCore.id,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
    })
    .from(ordersCore)
    .where(
      and(
        orderRefWhere(orderRef),
        eq(ordersCore.orderType, "person_ride"),
        eq(ordersCore.status, "assigned"),
        isNull(ordersCore.riderId)
      )
    )
    .limit(1);

  if (!preCheck?.id) {
    throw Object.assign(new Error("Order not available"), { statusCode: 409 });
  }

  try {
    await validateRiderAcceptance(
      riderId,
      "person_ride",
      {
        latitude: parseCoord(preCheck.pickupLat),
        longitude: parseCoord(preCheck.pickupLon),
      },
      { orderCoreId: preCheck.id }
    );
  } catch (error) {
    throwDispatchError(error);
  }

  const [takenByOther] = await db
    .select({ riderId: ordersCore.riderId })
    .from(ordersCore)
    .where(
      and(
        orderRefWhere(orderRef),
        eq(ordersCore.orderType, "person_ride"),
        sql`${ordersCore.riderId} IS NOT NULL`,
        sql`${ordersCore.riderId} <> ${riderId}`
      )
    )
    .limit(1);

  if (takenByOther?.riderId != null) {
    throw Object.assign(new Error("Order already taken"), { statusCode: 409 });
  }

  const accepted = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: ordersCore.id })
      .from(ordersCore)
      .where(
        and(
          eq(ordersCore.id, preCheck.id),
          eq(ordersCore.orderType, "person_ride"),
          eq(ordersCore.status, "assigned"),
          isNull(ordersCore.riderId)
        )
      )
      .limit(1);

    if (!existing?.id) {
      throw Object.assign(new Error("Order not available"), { statusCode: 409 });
    }

    const [updated] = await tx
      .update(ordersCore)
      .set({
        riderId,
        status: "accepted",
        currentStatus: "RIDER_ASSIGNED",
        updatedAt: now,
      })
      .where(
        and(
          eq(ordersCore.id, existing.id),
          isNull(ordersCore.riderId),
          eq(ordersCore.status, "assigned")
        )
      )
      .returning({ id: ordersCore.id });

    if (!updated?.id) {
      throw Object.assign(new Error("Order already taken"), { statusCode: 409 });
    }

    await tx
      .update(ordersRide)
      .set({
        assignedRiderId: riderId,
        riderAssignedAt: now,
        updatedAt: now,
      })
      .where(eq(ordersRide.orderId, updated.id));

    await appendOrderTimeline(tx, {
      orderCorePk: updated.id,
      status: "RIDER_ASSIGNED",
      previousStatus: "SEARCHING_RIDER",
      actorType: "rider",
      actorId: riderId,
      statusMessage: "Rider accepted ride",
      occurredAt: now,
    });

    const [orderIdRow] = await tx
      .select({ orderId: ordersCore.orderId })
      .from(ordersCore)
      .where(eq(ordersCore.id, updated.id))
      .limit(1);
    const orderIdText = orderIdRow?.orderId?.trim();
    if (orderIdText) {
      await recordRideRiderAccepted(tx, {
        orderCorePk: updated.id,
        orderIdText,
        riderId,
        occurredAt: now,
      });
    }

    const [row] = await tx
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        distanceKm: ordersCore.distanceKm,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        createdAt: ordersCore.createdAt,
        rideType: ordersRide.rideType,
        estimatedFare: ordersRide.estimatedFare,
        searchExpiresAt: ordersRide.searchExpiresAt,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .where(eq(ordersCore.id, updated.id))
      .limit(1);

    if (!row?.orderId) throw new Error("Accepted order missing");
    return mapRideRow({ ...row, status: undefined } as RideRow);
  });

  await completeOrderDispatch(preCheck.id, "accepted");
  return { ...accepted, status: "assigned" };
}

export async function rejectOrderForRider(
  riderId: number,
  orderRef: string,
  input: { reasonCode: string; reasonText?: string | null }
): Promise<{ ok: true }> {
  const now = new Date();
  const rawCode = String(input.reasonCode ?? "").trim().toUpperCase();
  if (!isValidRiderOrderRejectReasonCode(rawCode)) {
    throw Object.assign(new Error("Select a valid rejection reason"), { statusCode: 400 });
  }
  const reasonCode = rawCode;
  const reasonText =
    input.reasonText?.trim() ||
    RIDER_ORDER_REJECT_REASON_LABELS[reasonCode] ||
    reasonCode;

  const [row] = await getDb()
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      orderType: ordersCore.orderType,
      riderId: ordersCore.riderId,
    })
    .from(ordersCore)
    .where(orderRefWhere(orderRef))
    .limit(1);

  if (!row?.id || !row.orderId) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }

  if (row.riderId != null && Number(row.riderId) === riderId) {
    throw Object.assign(new Error("Cancel the assigned order instead of rejecting the offer"), {
      statusCode: 409,
    });
  }

  await recordRiderDispatchExclusion({
    orderCoreId: row.id,
    orderId: row.orderId.trim(),
    riderId,
    exclusionSource: "rider_reject",
    reasonCode,
    reasonText,
    actorType: "rider",
    actorId: String(riderId),
    metadata: { serviceType: row.orderType ?? "unknown" },
  });

  await recordDispatchAssignmentAudit({
    orderCoreId: row.id,
    orderId: row.orderId.trim(),
    riderId,
    eventType: "rejected",
    rejectedAt: now,
    responseReceivedAt: now,
    removalReason: reasonText,
    actorType: "rider",
    actorId: String(riderId),
    metadata: { serviceType: row.orderType ?? "unknown", reasonCode, reasonText },
    occurredAt: now,
  });

  return { ok: true };
}

function mapRideRowWithStatus(
  row: RideRow & { status?: string | null; pickupOtpVerifiedAt?: Date | null },
  dbStatus?: string | null,
  currentStatusRaw?: string | null
): RiderOrderSummary {
  const base = mapRideRow(row);
  const st = String(dbStatus ?? "accepted");
  const currentSt = String(currentStatusRaw ?? row.currentStatus ?? "").trim().toUpperCase();
  const rideStarted = st === "picked_up" || st === "in_transit" || st === "delivered";
  const pickupOtpVerified = row.pickupOtpVerifiedAt != null;
  const atPickup =
    pickupOtpVerified &&
    !rideStarted &&
    (st === PERSON_RIDE_AT_USER_STATUS || currentSt === "RIDER_AT_PICKUP");
  const atCustomer = currentSt === "REACHED_CUSTOMER";
  return {
    ...base,
    atPickup,
    pickupOtpVerified,
    rideStarted,
    atCustomer,
    status:
      st === "picked_up" || st === "in_transit"
        ? ("in_transit" as const)
        : st === PERSON_RIDE_AT_USER_STATUS
          ? ("assigned" as const)
          : st === "delivered"
            ? ("delivered" as const)
            : st === "cancelled" || st === "failed"
              ? ("cancelled" as const)
              : st === "accepted"
                ? ("assigned" as const)
                : ("assigned" as const),
  };
}

export async function getOrderForRider(
  riderId: number,
  orderRef: string
): Promise<RiderOrderSummary> {
  const db = getDb();
  const [meta] = await db
    .select({ orderType: ordersCore.orderType })
    .from(ordersCore)
    .where(orderRefWhere(orderRef))
    .limit(1);

  if (!meta?.orderType) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }
  if (meta.orderType === "food") {
    return getFoodOrderForRider(riderId, orderRef);
  }
  if (meta.orderType === "parcel") {
    return getParcelOrderForRider(riderId, orderRef);
  }
  return getRideOrderForRider(riderId, orderRef);
}

export async function getFoodOrderForRider(
  riderId: number,
  orderRef: string
): Promise<RiderOrderSummary> {
  const db = getDb();
  const [row] = await db
    .select({
      coreId: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
      dropAddressRaw: ordersCore.dropAddressRaw,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      dropAddressGeocoded: ordersCore.dropAddressGeocoded,
      distanceKm: ordersCore.distanceKm,
      riderEarning: ordersCore.riderEarning,
      fareAmount: ordersCore.fareAmount,
      grandTotal: ordersCore.grandTotal,
      tipAmount: ordersCore.tipAmount,
      billingSnapshot: ordersCore.billingSnapshot,
      paymentMethod: ordersCore.paymentMethod,
      paymentStatus: ordersCore.paymentStatus,
      createdAt: ordersCore.createdAt,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      foodStatus: ordersFood.orderStatus,
      riderReachedPickupAt: ordersFood.riderReachedPickupAt,
      pickupWaitSeconds: ordersFood.pickupWaitSeconds,
      pickupTimerStartedAt: ordersFood.pickupTimerStartedAt,
      pickupDurationSeconds: ordersFood.pickupDurationSeconds,
      preparedAt: ordersFood.preparedAt,
      acceptedAt: ordersFood.acceptedAt,
      preparingAt: ordersFood.preparingAt,
      prepReadyByAt: ordersFood.prepReadyByAt,
      preparationTimeMinutes: ordersFood.preparationTimeMinutes,
      prepDelayMinutes: ordersFood.prepDelayMinutes,
      restaurantName: ordersFood.restaurantName,
      restaurantPhone: ordersFood.restaurantPhone,
      foodItemsCount: ordersFood.foodItemsCount,
      foodItemsJson: ordersFood.items,
      deliveryInstructions: ordersFood.deliveryInstructions,
      requiresUtensils: ordersFood.requiresUtensils,
      customerName: ordersFood.customerName,
      customerPhone: ordersFood.customerPhone,
    })
    .from(ordersCore)
    .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(
      and(
        orderRefWhere(orderRef),
        eq(ordersCore.riderId, riderId),
        eq(ordersCore.orderType, "food")
      )
    )
    .limit(1);

  if (!row?.orderId) {
    throw Object.assign(new Error("Food order not found"), { statusCode: 404 });
  }

  const summary = mapFoodRowWithStatus(row);
  const foodItems = await loadRiderFoodOrderItems(db, row.coreId, row.foodItemsJson);
  const merchantFeedbackSubmitted = await loadRiderMerchantFeedbackSubmitted(
    db,
    riderId,
    row.orderId.trim()
  );
  const customerFeedbackSubmitted = await loadRiderCustomerFeedbackSubmitted(
    db,
    riderId,
    row.coreId
  );
  return {
    ...summary,
    foodItems,
    deliveryInstructions: row.deliveryInstructions?.trim() || null,
    requiresUtensils: row.requiresUtensils === true,
    restaurantPhone: row.restaurantPhone?.trim() || null,
    merchantFeedbackSubmitted,
    customerFeedbackSubmitted,
  };
}

export async function getParcelOrderForRider(
  riderId: number,
  orderRef: string
): Promise<RiderOrderSummary> {
  const db = getDb();
  const [row] = await db
    .select({
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropAddressRaw: ordersCore.dropAddressRaw,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      distanceKm: ordersCore.distanceKm,
      riderEarning: ordersCore.riderEarning,
      fareAmount: ordersCore.fareAmount,
      grandTotal: ordersCore.grandTotal,
      tipAmount: ordersCore.tipAmount,
      billingSnapshot: ordersCore.billingSnapshot,
      createdAt: ordersCore.createdAt,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
    })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(
      and(
        orderRefWhere(orderRef),
        eq(ordersCore.riderId, riderId),
        eq(ordersCore.orderType, "parcel")
      )
    )
    .limit(1);

  if (!row?.orderId) {
    throw Object.assign(new Error("Parcel order not found"), { statusCode: 404 });
  }

  return mapParcelRowWithStatus(row);
}

export async function getRideOrderForRider(
  riderId: number,
  orderRef: string
): Promise<RiderOrderSummary> {
  const db = getDb();
  const [row] = await db
    .select({
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
      dropAddressRaw: ordersCore.dropAddressRaw,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      dropAddressGeocoded: ordersCore.dropAddressGeocoded,
      distanceKm: ordersCore.distanceKm,
      riderEarning: ordersCore.riderEarning,
      fareAmount: ordersCore.fareAmount,
      grandTotal: ordersCore.grandTotal,
      createdAt: ordersCore.createdAt,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      rideType: ordersRide.rideType,
      estimatedFare: ordersRide.estimatedFare,
      searchExpiresAt: ordersRide.searchExpiresAt,
      pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
      passengerName: ordersRide.passengerName,
      passengerPhone: ordersRide.passengerPhone,
      customerFullName: customers.fullName,
      customerPrimaryMobile: customers.primaryMobile,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .leftJoin(customers, eq(ordersCore.customerId, customers.id))
    .where(
      and(
        orderRefWhere(orderRef),
        eq(ordersCore.riderId, riderId),
        eq(ordersCore.orderType, "person_ride")
      )
    )
    .limit(1);

  if (!row?.orderId) {
    throw Object.assign(new Error("Ride order not found"), { statusCode: 404 });
  }

  return mapRideRowWithStatus(row, row.status, row.currentStatus);
}

export async function verifyPickupOtpForRider(
  riderId: number,
  orderRef: string,
  otpInput: string,
  gps?: RiderGpsPayload & { deviceTimestamp?: string }
): Promise<RiderOrderSummary> {
  const db = getDb();
  const [meta] = await db
    .select({ orderType: ordersCore.orderType })
    .from(ordersCore)
    .where(orderRefWhere(orderRef))
    .limit(1);

  if (meta?.orderType === "food") {
    return verifyFoodPickupOtpForRider(
      riderId,
      orderRef,
      otpInput,
      gps,
      gps?.deviceTimestamp
    );
  }

  const now = new Date();
  const normalizedOtp = String(otpInput ?? "").trim().replace(/\D/g, "");
  if (normalizedOtp.length !== 4) {
    throw Object.assign(new Error("Enter the 4-digit pickup OTP"), { statusCode: 400 });
  }

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        pickupOtp: ordersCore.pickupOtp,
        ridePickupOtp: ordersRide.pickupOtp,
        pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .where(
        and(
          orderRefWhere(orderRef),
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "person_ride"),
          inArray(ordersCore.status, [...PERSON_RIDE_PRE_PICKUP_OTP_STATUSES]),
          isNull(ordersRide.pickupOtpVerifiedAt)
        )
      )
      .limit(1);

    if (!existing?.id || !existing.orderId) {
      throw Object.assign(
        new Error("Reach the passenger pickup location and slide Reach pickup before entering OTP"),
        { statusCode: 409 }
      );
    }

    await assertRiderMilestoneGeoFence({
      riderId,
      orderCorePk: existing.id,
      serviceType: "person_ride",
      milestoneKey: "pickup_confirmation",
      gps,
    });

    const storedOtp = String(existing.pickupOtp ?? existing.ridePickupOtp ?? "")
      .trim()
      .replace(/\D/g, "");
    if (!storedOtp || storedOtp !== normalizedOtp) {
      throw Object.assign(new Error("Incorrect pickup OTP"), { statusCode: 403 });
    }

    const [statusRow] = await tx
      .update(ordersCore)
      .set({
        status: PERSON_RIDE_AT_USER_STATUS,
        currentStatus: "RIDER_AT_PICKUP",
        updatedAt: now,
      })
      .where(
        and(
          eq(ordersCore.id, existing.id),
          eq(ordersCore.riderId, riderId),
          inArray(ordersCore.status, [...PERSON_RIDE_PRE_PICKUP_OTP_STATUSES])
        )
      )
      .returning({ id: ordersCore.id });

    if (!statusRow?.id) {
      throw Object.assign(new Error("Pickup OTP could not be applied to this ride"), {
        statusCode: 409,
      });
    }

    await tx
      .update(ordersRide)
      .set({
        pickupOtpVerifiedAt: now,
        updatedAt: now,
      })
      .where(eq(ordersRide.orderId, existing.id));

    const orderIdText = existing.orderId.trim();
    await recordRideRiderReachedPickup(tx, {
      orderCorePk: existing.id,
      orderIdText,
      riderId,
      occurredAt: now,
    });

    await appendOrderTimeline(tx, {
      orderCorePk: existing.id,
      status: "PICKUP_OTP_VERIFIED",
      previousStatus: String(existing.currentStatus ?? "RIDER_AT_PICKUP"),
      actorType: "rider",
      actorId: riderId,
      statusMessage: "Pickup OTP verified",
      occurredAt: now,
      metadata: { pickupOtpVerified: true },
    });

    const [full] = await tx
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        dropAddressGeocoded: ordersCore.dropAddressGeocoded,
        distanceKm: ordersCore.distanceKm,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        createdAt: ordersCore.createdAt,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        rideType: ordersRide.rideType,
        estimatedFare: ordersRide.estimatedFare,
        searchExpiresAt: ordersRide.searchExpiresAt,
        pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
        passengerName: ordersRide.passengerName,
        passengerPhone: ordersRide.passengerPhone,
        customerFullName: customers.fullName,
        customerPrimaryMobile: customers.primaryMobile,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .leftJoin(customers, eq(ordersCore.customerId, customers.id))
      .where(eq(ordersCore.id, existing.id))
      .limit(1);

    if (!full?.orderId) throw new Error("Ride missing after OTP verify");
    return mapRideRowWithStatus(full, full.status, full.currentStatus);
  });

  return updated;
}

export async function startRideForRider(
  riderId: number,
  orderRef: string,
  gps?: RiderGpsPayload
): Promise<RiderOrderSummary> {
  const db = getDb();
  const [meta] = await db
    .select({ orderType: ordersCore.orderType })
    .from(ordersCore)
    .where(orderRefWhere(orderRef))
    .limit(1);

  if (meta?.orderType !== "person_ride") {
    throw Object.assign(new Error("Start ride is only supported for person rides"), {
      statusCode: 409,
    });
  }

  const now = new Date();

  const [rideStartPre] = await db
    .select({ id: ordersCore.id, pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(
      and(
        orderRefWhere(orderRef),
        eq(ordersCore.riderId, riderId),
        eq(ordersCore.orderType, "person_ride"),
        inArray(ordersCore.status, [...PERSON_RIDE_READY_TO_START_STATUSES])
      )
    )
    .limit(1);

  if (!rideStartPre?.id || !rideStartPre.pickupOtpVerifiedAt) {
    throw Object.assign(new Error("Verify pickup OTP before starting the ride"), {
      statusCode: 409,
    });
  }

  const [statusCheck] = await db
    .select({ status: ordersCore.status })
    .from(ordersCore)
    .where(eq(ordersCore.id, rideStartPre.id))
    .limit(1);

  if (statusCheck?.status !== PERSON_RIDE_AT_USER_STATUS) {
    throw Object.assign(new Error("Verify pickup OTP before starting the ride"), {
      statusCode: 409,
    });
  }

  await assertRiderMilestoneGeoFence({
    riderId,
    orderCorePk: rideStartPre.id,
    serviceType: "person_ride",
    milestoneKey: "start_ride",
    gps,
  });

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .where(
        and(
          orderRefWhere(orderRef),
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "person_ride"),
          inArray(ordersCore.status, [...PERSON_RIDE_READY_TO_START_STATUSES])
        )
      )
      .limit(1);

    if (!existing?.id || !existing.orderId) {
      throw Object.assign(new Error("Ride not ready to start"), { statusCode: 409 });
    }
    if (!existing.pickupOtpVerifiedAt) {
      throw Object.assign(new Error("Verify pickup OTP before starting the ride"), {
        statusCode: 409,
      });
    }

    const [row] = await tx
      .update(ordersCore)
      .set({
        status: "picked_up",
        currentStatus: "RIDE_IN_PROGRESS",
        actualPickupTime: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(ordersCore.id, existing.id),
          eq(ordersCore.riderId, riderId),
          inArray(ordersCore.status, [...PERSON_RIDE_READY_TO_START_STATUSES])
        )
      )
      .returning({ id: ordersCore.id });

    if (!row?.id) {
      throw Object.assign(new Error("Could not start ride"), { statusCode: 409 });
    }

    await tx
      .update(ordersRide)
      .set({ updatedAt: now })
      .where(eq(ordersRide.orderId, row.id));

    const orderIdText = existing.orderId.trim();
    await tx.execute(sql`
      UPDATE delivery_assignments
      SET
        assignment_status = 'PICKED_UP',
        picked_up_at = COALESCE(picked_up_at, ${now.toISOString()}::timestamptz),
        updated_at = ${now.toISOString()}::timestamptz
      WHERE order_id = ${orderIdText} AND rider_id = ${riderId}
    `);

    const distance = await riderDistanceAtMilestone(riderId, row.id, gps);
    await recordRiderAssignmentMilestone(tx, {
      orderCorePk: row.id,
      orderIdText,
      riderId,
      eventType: "picked_up",
      occurredAt: now,
      distance,
      statusMessage: "Ride started",
    });

    await appendOrderTimeline(tx, {
      orderCorePk: row.id,
      status: "RIDE_IN_PROGRESS",
      previousStatus: String(existing.currentStatus ?? "PICKUP_OTP_VERIFIED"),
      actorType: "rider",
      actorId: riderId,
      statusMessage: "Ride started",
      occurredAt: now,
    });

    void publishOrderEvent(orderIdText, {
      type: "status_changed",
      status: "RIDE_IN_PROGRESS",
      orderId: orderIdText,
      riderId,
    }).catch(() => {});

    const [full] = await tx
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        dropAddressGeocoded: ordersCore.dropAddressGeocoded,
        distanceKm: ordersCore.distanceKm,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        createdAt: ordersCore.createdAt,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        rideType: ordersRide.rideType,
        estimatedFare: ordersRide.estimatedFare,
        searchExpiresAt: ordersRide.searchExpiresAt,
        pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
        passengerName: ordersRide.passengerName,
        passengerPhone: ordersRide.passengerPhone,
        customerFullName: customers.fullName,
        customerPrimaryMobile: customers.primaryMobile,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .leftJoin(customers, eq(ordersCore.customerId, customers.id))
      .where(eq(ordersCore.id, row.id))
      .limit(1);

    if (!full?.orderId) throw new Error("Ride missing after start");
    return mapRideRowWithStatus(full, "picked_up", full.currentStatus);
  });

  return updated;
}

export async function markReachedPickupForRider(
  riderId: number,
  orderRef: string,
  gps?: RiderGpsPayload
): Promise<RiderOrderSummary> {
  const db = getDb();
  const [meta] = await db
    .select({ orderType: ordersCore.orderType })
    .from(ordersCore)
    .where(orderRefWhere(orderRef))
    .limit(1);

  if (meta?.orderType === "food") {
    return markReachedFoodPickupForRider(riderId, orderRef, gps);
  }

  const now = new Date();

  const [ridePre] = await db
    .select({ id: ordersCore.id })
    .from(ordersCore)
    .where(
      and(
        orderRefWhere(orderRef),
        eq(ordersCore.riderId, riderId),
        eq(ordersCore.orderType, "person_ride"),
        eq(ordersCore.status, "accepted")
      )
    )
    .limit(1);

  if (!ridePre?.id) {
    throw Object.assign(new Error("Ride not in accepted state"), { statusCode: 409 });
  }

  await assertRiderMilestoneGeoFence({
    riderId,
    orderCorePk: ridePre.id,
    serviceType: "person_ride",
    milestoneKey: "reach_pickup",
    gps,
  });
  await assertRiderMilestoneGeoFence({
    riderId,
    orderCorePk: ridePre.id,
    serviceType: "person_ride",
    milestoneKey: "pickup_confirmation",
    gps,
  });

  /** Geo milestone only — orders_core.status stays `accepted` until pickup OTP sets `reached_user`. */
  return getRideOrderForRider(riderId, orderRef);
}

/** Core statuses where rider can still mark "reached store" (incl. dashboard Dispatch Ready = picked_up). */
const FOOD_REACH_STORE_CORE_STATUSES = ["accepted", "reached_store", "picked_up"] as const;

async function selectFoodOrderRowForRider(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  orderCorePk: number
): Promise<FoodRowWithStatus | null> {
  const [full] = await tx
    .select({
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
      dropAddressRaw: ordersCore.dropAddressRaw,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      dropAddressGeocoded: ordersCore.dropAddressGeocoded,
      distanceKm: ordersCore.distanceKm,
      riderEarning: ordersCore.riderEarning,
      fareAmount: ordersCore.fareAmount,
      grandTotal: ordersCore.grandTotal,
      tipAmount: ordersCore.tipAmount,
      billingSnapshot: ordersCore.billingSnapshot,
      paymentMethod: ordersCore.paymentMethod,
      paymentStatus: ordersCore.paymentStatus,
      createdAt: ordersCore.createdAt,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      foodStatus: ordersFood.orderStatus,
      riderReachedPickupAt: ordersFood.riderReachedPickupAt,
      pickupWaitSeconds: ordersFood.pickupWaitSeconds,
      pickupTimerStartedAt: ordersFood.pickupTimerStartedAt,
      pickupDurationSeconds: ordersFood.pickupDurationSeconds,
      preparedAt: ordersFood.preparedAt,
      acceptedAt: ordersFood.acceptedAt,
      preparingAt: ordersFood.preparingAt,
      prepReadyByAt: ordersFood.prepReadyByAt,
      preparationTimeMinutes: ordersFood.preparationTimeMinutes,
      prepDelayMinutes: ordersFood.prepDelayMinutes,
      restaurantName: ordersFood.restaurantName,
      foodItemsCount: ordersFood.foodItemsCount,
      customerName: ordersFood.customerName,
      customerPhone: ordersFood.customerPhone,
    })
    .from(ordersCore)
    .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);

  return full?.orderId ? (full as FoodRowWithStatus) : null;
}

async function markReachedFoodPickupForRider(
  riderId: number,
  orderRef: string,
  gps?: RiderGpsPayload
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        foodStatus: ordersFood.orderStatus,
      })
      .from(ordersCore)
      .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
      .where(
        and(
          orderRefWhere(orderRef),
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "food")
        )
      )
      .limit(1);

    if (!existing?.id) {
      throw Object.assign(new Error("Food order not found"), { statusCode: 404 });
    }

    const coreSt = String(existing.status ?? "").trim();
    const curSt = String(existing.currentStatus ?? "").trim().toUpperCase();
    const foodSt = String(existing.foodStatus ?? "").trim().toUpperCase();

    const alreadyAtStore =
      coreSt === "reached_store" || curSt === "RIDER_AT_PICKUP";

    if (alreadyAtStore) {
      const full = await selectFoodOrderRowForRider(tx, existing.id);
      if (!full?.orderId) throw new Error("Food order missing after update");
      return mapFoodRowWithStatus(full);
    }

    if (
      foodSt === "OUT_FOR_DELIVERY" &&
      (coreSt === "in_transit" || coreSt === "delivered")
    ) {
      throw Object.assign(new Error("Food order already picked up"), { statusCode: 409 });
    }

    if (!(FOOD_REACH_STORE_CORE_STATUSES as readonly string[]).includes(coreSt)) {
      throw Object.assign(new Error("Food order not ready for pickup arrival"), {
        statusCode: 409,
      });
    }

    await assertRiderMilestoneGeoFence({
      riderId,
      orderCorePk: existing.id,
      serviceType: "food",
      milestoneKey: "reach_store",
      gps,
    });

    const [row] = await tx
      .update(ordersCore)
      .set({
        status: "reached_store",
        currentStatus: "RIDER_AT_PICKUP",
        updatedAt: now,
      })
      .where(and(eq(ordersCore.id, existing.id), eq(ordersCore.riderId, riderId)))
      .returning({ id: ordersCore.id });

    if (!row?.id) {
      throw Object.assign(new Error("Could not update food order status"), { statusCode: 409 });
    }

    const [foodPickupRow] = await tx
      .select({ reachedAt: ordersFood.riderReachedPickupAt })
      .from(ordersFood)
      .where(eq(ordersFood.orderId, existing.id))
      .limit(1);
    if (!foodPickupRow?.reachedAt) {
      await tx
        .update(ordersFood)
        .set({ riderReachedPickupAt: now, updatedAt: now })
        .where(eq(ordersFood.orderId, existing.id));
    }

    const orderIdText = existing.orderId?.trim();
    const distance = await riderDistanceAtMilestone(riderId, row.id, gps);
    if (orderIdText) {
      try {
        await recordRiderAssignmentMilestone(tx, {
          orderCorePk: row.id,
          orderIdText,
          riderId,
          eventType: "reached_merchant",
          occurredAt: now,
          distance,
          statusMessage: "Reached Merchant",
        });
      } catch (milestoneErr) {
        console.warn("[markReachedFoodPickupForRider] milestone recording failed:", milestoneErr);
      }
    }

    const full = await selectFoodOrderRowForRider(tx, row.id);
    if (!full?.orderId) throw new Error("Food order missing after update");
    return mapFoodRowWithStatus(full);
  });

  const merchantFeedbackSubmitted = await loadRiderMerchantFeedbackSubmitted(
    db,
    riderId,
    updated.id
  );
  return { ...updated, merchantFeedbackSubmitted };
}

type FoodPickupVerificationAudit = {
  method?: FoodPickupVerificationMethod;
  barcodeValue?: string | null;
  otpVerified?: boolean;
  deviceTimestamp?: string | null;
};

async function finalizeFoodPickupVerificationForRider(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  riderId: number,
  existing: {
    id: number;
    orderId: string | null;
    foodStatus: string | null;
  },
  gps: RiderGpsPayload | undefined,
  audit: FoodPickupVerificationAudit
): Promise<FoodRowWithStatus> {
  const now = new Date();
  const foodSt = String(existing.foodStatus ?? "").trim().toUpperCase();
  const existingOrderId = (existing.orderId ?? "").trim();
  if (!existingOrderId) {
    throw Object.assign(new Error("Order id missing"), { statusCode: 500 });
  }

  if (foodSt === "OUT_FOR_DELIVERY" || foodSt === "DELIVERED") {
    throw Object.assign(new Error("Food order already picked up"), { statusCode: 409 });
  }

  if (!isMerchantFoodOrderReady(foodSt)) {
    throw Object.assign(
      new Error("Order is not ready yet. Wait for the restaurant to mark it ready."),
      { statusCode: 409 }
    );
  }

  if (audit.method) {
    const deviceTs =
      audit.deviceTimestamp && !Number.isNaN(Date.parse(audit.deviceTimestamp))
        ? new Date(audit.deviceTimestamp)
        : null;

    try {
      await tx.execute(sql`
        INSERT INTO food_order_pickup_verifications (
          order_core_id,
          order_id_text,
          rider_id,
          verification_method,
          verification_time,
          device_timestamp,
          barcode_value,
          otp_verified
        )
        VALUES (
          ${existing.id},
          ${existingOrderId},
          ${riderId},
          ${audit.method},
          ${now.toISOString()}::timestamptz,
          ${deviceTs ? deviceTs.toISOString() : null},
          ${audit.barcodeValue ?? null},
          ${audit.otpVerified ?? null}
        )
      `);
    } catch (auditErr) {
      console.warn(
        "[finalizeFoodPickupVerificationForRider] pickup verification audit insert failed:",
        auditErr
      );
    }
  }

  const [row] = await tx
    .update(ordersCore)
    .set({
      status: "picked_up",
      currentStatus: "OUT_FOR_DELIVERY",
      actualPickupTime: now,
      updatedAt: now,
    })
    .where(and(eq(ordersCore.id, existing.id), eq(ordersCore.riderId, riderId)))
    .returning({ id: ordersCore.id });

  if (!row?.id) {
    throw Object.assign(new Error("Could not confirm food pickup"), { statusCode: 409 });
  }

  const [foodPickupMeta] = await tx
    .select({
      pickupTimerStartedAt: ordersFood.pickupTimerStartedAt,
      pickupDurationSeconds: ordersFood.pickupDurationSeconds,
    })
    .from(ordersFood)
    .where(eq(ordersFood.orderId, row.id))
    .limit(1);

  const timerStarted = foodPickupMeta?.pickupTimerStartedAt;
  const pickupDurationSeconds =
    foodPickupMeta?.pickupDurationSeconds != null
      ? Number(foodPickupMeta.pickupDurationSeconds)
      : timerStarted instanceof Date
        ? Math.max(0, Math.floor((now.getTime() - timerStarted.getTime()) / 1000))
        : timerStarted
          ? Math.max(0, Math.floor((now.getTime() - new Date(String(timerStarted)).getTime()) / 1000))
          : null;

  await tx
    .update(ordersFood)
    .set({
      orderStatus: "OUT_FOR_DELIVERY",
      dispatchedAt: now,
      updatedAt: now,
      ...(pickupDurationSeconds != null ? { pickupDurationSeconds } : {}),
    })
    .where(eq(ordersFood.orderId, row.id));

  await tx.execute(sql`
    UPDATE delivery_assignments
    SET
      assignment_status = 'PICKED_UP',
      picked_up_at = COALESCE(picked_up_at, ${now.toISOString()}::timestamptz),
      updated_at = ${now.toISOString()}::timestamptz
    WHERE order_id = ${existingOrderId} AND rider_id = ${riderId}
  `);

  const [riderProfile] = await tx
    .select({ name: riders.name })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);

  const riderName = riderProfile?.name ?? null;
  const distance = await riderDistanceAtMilestone(riderId, row.id, gps);

  await recordRiderPickedUpTimelineTx(tx, {
    orderCorePk: row.id,
    pickedUpAt: now,
    riderId,
    riderName,
  });

  await recordDispatchedTimelineTx(tx, {
    orderCorePk: row.id,
    dispatchedAt: now,
    riderId,
    riderName,
  });

  await recordRiderAssignmentMilestone(tx, {
    orderCorePk: row.id,
    orderIdText: existingOrderId,
    riderId,
    eventType: "picked_up",
    occurredAt: now,
    distance,
    statusMessage: "Order Picked Up",
  });

  const full = await selectFoodOrderRowForRider(tx, row.id);
  if (!full?.orderId) throw new Error("Food order missing after pickup verification");
  return full;
}

async function loadFoodOrderAwaitingPickupVerification(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  riderId: number,
  orderRef: string
) {
  const [existing] = await tx
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      corePickupOtp: ordersCore.pickupOtp,
      foodPickupOtp: ordersFood.pickupOtp,
      foodStatus: ordersFood.orderStatus,
    })
    .from(ordersCore)
    .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(
      and(
        orderRefWhere(orderRef),
        eq(ordersCore.riderId, riderId),
        eq(ordersCore.orderType, "food"),
        inArray(ordersCore.status, [...FOOD_REACH_STORE_CORE_STATUSES])
      )
    )
    .limit(1);

  if (!existing?.id || !existing.orderId) {
    throw Object.assign(new Error("Food order not ready for pickup verification"), {
      statusCode: 409,
    });
  }

  let pickupVerificationToken: string | null = null;
  let foodFormattedOrderId = existing.formattedOrderId;
  try {
    const tokenRows = await tx.execute<{
      pickup_verification_token: string | null;
      formatted_order_id: string | null;
    }>(sql`
      SELECT pickup_verification_token, formatted_order_id
      FROM orders_food
      WHERE order_id = ${existing.id}
      LIMIT 1
    `);
    const tokenMeta = (tokenRows as {
      pickup_verification_token: string | null;
      formatted_order_id: string | null;
    }[])[0];
    pickupVerificationToken = tokenMeta?.pickup_verification_token ?? null;
    foodFormattedOrderId = tokenMeta?.formatted_order_id ?? existing.formattedOrderId;
  } catch (tokenErr) {
    console.warn(
      "[loadFoodOrderAwaitingPickupVerification] pickup_verification_token unavailable:",
      tokenErr
    );
  }

  return {
    ...existing,
    pickupVerificationToken,
    foodFormattedOrderId,
  };
}

export async function markFoodPickupWithoutVerificationForRider(
  riderId: number,
  orderRef: string,
  gps?: RiderGpsPayload,
  deviceTimestamp?: string
): Promise<RiderOrderSummary> {
  const settings = await loadFoodPickupVerificationSettings();
  if (settings.verificationRequired) {
    throw Object.assign(new Error("Pickup verification is required for this order"), {
      statusCode: 409,
    });
  }

  const db = getDb();
  const updated = await db.transaction(async (tx) => {
    const existing = await loadFoodOrderAwaitingPickupVerification(tx, riderId, orderRef);

    await assertRiderMilestoneGeoFence({
      riderId,
      orderCorePk: existing.id,
      serviceType: "food",
      milestoneKey: "mark_picked_up",
      gps,
    });

    return finalizeFoodPickupVerificationForRider(tx, riderId, existing, gps, {
      deviceTimestamp: deviceTimestamp ?? null,
    });
  });

  const merchantFeedbackSubmitted = await loadRiderMerchantFeedbackSubmitted(
    db,
    riderId,
    (updated.orderId ?? "").trim()
  );
  return { ...mapFoodRowWithStatus(updated), merchantFeedbackSubmitted };
}

async function verifyFoodPickupOtpForRider(
  riderId: number,
  orderRef: string,
  otpInput: string,
  gps?: RiderGpsPayload,
  deviceTimestamp?: string
): Promise<RiderOrderSummary> {
  const settings = await loadFoodPickupVerificationSettings();
  if (!settings.otpEnabled) {
    throw Object.assign(new Error("OTP pickup verification is disabled"), { statusCode: 409 });
  }

  const db = getDb();
  const normalizedOtp = String(otpInput ?? "").trim().replace(/\D/g, "");
  if (normalizedOtp.length !== 4 && normalizedOtp.length !== 6) {
    throw Object.assign(new Error("Enter the pickup OTP"), { statusCode: 400 });
  }

  const updated = await db.transaction(async (tx) => {
    const existing = await loadFoodOrderAwaitingPickupVerification(tx, riderId, orderRef);

    await assertRiderMilestoneGeoFence({
      riderId,
      orderCorePk: existing.id,
      serviceType: "food",
      milestoneKey: "mark_picked_up",
      gps,
    });

    const storedOtp = String(existing.foodPickupOtp ?? existing.corePickupOtp ?? "").trim();
    if (!storedOtp || storedOtp !== normalizedOtp) {
      throw Object.assign(new Error("Incorrect pickup OTP"), { statusCode: 403 });
    }

    return finalizeFoodPickupVerificationForRider(tx, riderId, existing, gps, {
      method: "otp",
      otpVerified: true,
      deviceTimestamp: deviceTimestamp ?? null,
    });
  });

  const merchantFeedbackSubmitted = await loadRiderMerchantFeedbackSubmitted(
    db,
    riderId,
    (updated.orderId ?? "").trim()
  );
  return { ...mapFoodRowWithStatus(updated), merchantFeedbackSubmitted };
}

export async function verifyFoodPickupBarcodeForRider(
  riderId: number,
  orderRef: string,
  barcodeInput: string,
  gps?: RiderGpsPayload,
  deviceTimestamp?: string
): Promise<RiderOrderSummary> {
  const settings = await loadFoodPickupVerificationSettings();
  if (!settings.barcodeEnabled) {
    throw Object.assign(new Error("Barcode pickup verification is disabled"), { statusCode: 409 });
  }

  const db = getDb();
  const scanned = String(barcodeInput ?? "").trim();
  if (!scanned) {
    throw Object.assign(new Error("Scan a valid barcode or QR code"), { statusCode: 400 });
  }

  const updated = await db.transaction(async (tx) => {
    const existing = await loadFoodOrderAwaitingPickupVerification(tx, riderId, orderRef);

    await assertRiderMilestoneGeoFence({
      riderId,
      orderCorePk: existing.id,
      serviceType: "food",
      milestoneKey: "mark_picked_up",
      gps,
    });

    const matches = barcodeMatchesPickupToken(scanned, {
      pickupVerificationToken: existing.pickupVerificationToken,
      formattedOrderId: existing.foodFormattedOrderId ?? existing.formattedOrderId,
      orderIdText: existing.orderId,
    });

    if (!matches) {
      throw Object.assign(
        new Error("Barcode does not match this order. Scan the bill or merchant QR code."),
        { statusCode: 403 }
      );
    }

    return finalizeFoodPickupVerificationForRider(tx, riderId, existing, gps, {
      method: "barcode",
      barcodeValue: scanned,
      deviceTimestamp: deviceTimestamp ?? null,
    });
  });

  const merchantFeedbackSubmitted = await loadRiderMerchantFeedbackSubmitted(
    db,
    riderId,
    (updated.orderId ?? "").trim()
  );
  return { ...mapFoodRowWithStatus(updated), merchantFeedbackSubmitted };
}

async function markReachedFoodCustomerForRider(
  riderId: number,
  orderRef: string,
  gps?: RiderGpsPayload
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        foodStatus: ordersFood.orderStatus,
      })
      .from(ordersCore)
      .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
      .where(
        and(
          orderRefWhere(orderRef),
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "food"),
          notInArray(ordersCore.status, ["delivered", "cancelled", "failed"])
        )
      )
      .limit(1);

    if (!existing?.id || !existing.orderId) {
      throw Object.assign(new Error("Food order not ready for customer arrival"), {
        statusCode: 409,
      });
    }

    const foodSt = String(existing.foodStatus ?? "").trim().toUpperCase();
    if (foodSt !== "OUT_FOR_DELIVERY") {
      throw Object.assign(new Error("Order must be dispatched before reaching customer"), {
        statusCode: 409,
      });
    }

    await assertRiderMilestoneGeoFence({
      riderId,
      orderCorePk: existing.id,
      serviceType: "food",
      milestoneKey: "reach_customer",
      gps,
    });

    const [row] = await tx
      .update(ordersCore)
      .set({
        status: "in_transit",
        currentStatus: "REACHED_CUSTOMER",
        updatedAt: now,
      })
      .where(and(eq(ordersCore.id, existing.id), eq(ordersCore.riderId, riderId)))
      .returning({ id: ordersCore.id });

    if (!row?.id) {
      throw Object.assign(new Error("Could not update food order"), { statusCode: 409 });
    }

    const distance = await riderDistanceAtMilestone(riderId, row.id, gps);
    await recordRiderAssignmentMilestone(tx, {
      orderCorePk: row.id,
      orderIdText: existing.orderId.trim(),
      riderId,
      eventType: "reached_customer",
      occurredAt: now,
      distance,
      statusMessage: "Reached Customer",
    });

    const [full] = await tx
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        distanceKm: ordersCore.distanceKm,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        tipAmount: ordersCore.tipAmount,
        billingSnapshot: ordersCore.billingSnapshot,
        createdAt: ordersCore.createdAt,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        foodStatus: ordersFood.orderStatus,
        restaurantName: ordersFood.restaurantName,
        foodItemsCount: ordersFood.foodItemsCount,
        customerName: ordersFood.customerName,
        customerPhone: ordersFood.customerPhone,
      })
      .from(ordersCore)
      .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
      .where(eq(ordersCore.id, row.id))
      .limit(1);

    if (!full?.orderId) throw new Error("Food order missing after reach customer");
    return mapFoodRowWithStatus(full);
  });

  return updated;
}

async function markReachedPersonRideDropForRider(
  riderId: number,
  orderRef: string,
  gps?: RiderGpsPayload
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
      })
      .from(ordersCore)
      .where(
        and(
          orderRefWhere(orderRef),
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "person_ride"),
          inArray(ordersCore.status, ["picked_up", "in_transit"])
        )
      )
      .limit(1);

    if (!existing?.id || !existing.orderId) {
      throw Object.assign(new Error("Ride not ready for drop arrival"), { statusCode: 409 });
    }

    await assertRiderMilestoneGeoFence({
      riderId,
      orderCorePk: existing.id,
      serviceType: "person_ride",
      milestoneKey: "reach_destination",
      gps,
    });

    const [row] = await tx
      .update(ordersCore)
      .set({
        status: "in_transit",
        currentStatus: "REACHED_CUSTOMER",
        updatedAt: now,
      })
      .where(and(eq(ordersCore.id, existing.id), eq(ordersCore.riderId, riderId)))
      .returning({ id: ordersCore.id });

    if (!row?.id) {
      throw Object.assign(new Error("Could not update ride"), { statusCode: 409 });
    }

    const distance = await riderDistanceAtMilestone(riderId, row.id, gps);
    await recordRiderAssignmentMilestone(tx, {
      orderCorePk: row.id,
      orderIdText: existing.orderId.trim(),
      riderId,
      eventType: "reached_customer",
      occurredAt: now,
      distance,
      statusMessage: "Reached drop location",
    });

    const [full] = await tx
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        dropAddressGeocoded: ordersCore.dropAddressGeocoded,
        distanceKm: ordersCore.distanceKm,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        createdAt: ordersCore.createdAt,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        rideType: ordersRide.rideType,
        estimatedFare: ordersRide.estimatedFare,
        searchExpiresAt: ordersRide.searchExpiresAt,
        pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
        passengerName: ordersRide.passengerName,
        passengerPhone: ordersRide.passengerPhone,
        customerFullName: customers.fullName,
        customerPrimaryMobile: customers.primaryMobile,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .leftJoin(customers, eq(ordersCore.customerId, customers.id))
      .where(eq(ordersCore.id, row.id))
      .limit(1);

    if (!full?.orderId) throw new Error("Ride missing after reach drop");
    return mapRideRowWithStatus(full, full.status, full.currentStatus);
  });

  return updated;
}

export async function markReachedCustomerForRider(
  riderId: number,
  orderRef: string,
  gps?: RiderGpsPayload
): Promise<RiderOrderSummary> {
  const db = getDb();
  const [meta] = await db
    .select({ orderType: ordersCore.orderType })
    .from(ordersCore)
    .where(orderRefWhere(orderRef))
    .limit(1);

  if (meta?.orderType === "food") {
    return markReachedFoodCustomerForRider(riderId, orderRef, gps);
  }

  if (meta?.orderType === "person_ride") {
    return markReachedPersonRideDropForRider(riderId, orderRef, gps);
  }

  throw Object.assign(new Error("Reach customer is only supported for food and person rides"), {
    statusCode: 409,
  });
}

/** Wallet, delivery image, and realtime — must not block verify-delivery-otp response. */
function runFoodDeliveryPostCommitEffects(input: {
  orderCorePk: number;
  orderIdText: string;
  riderId: number;
  proofUrl: string;
  proofKey: string;
  takenAt: Date;
  merchantStoreId: number | null;
}): void {
  const {
    orderCorePk,
    orderIdText,
    riderId,
    proofUrl,
    proofKey,
    takenAt,
    merchantStoreId,
  } = input;

  void (async () => {
    const db = getDb();
    const sideTasks: Promise<unknown>[] = [
      finalizeMerchantOrderDelivered({
        orderIdText,
        previousStatus: "OUT_FOR_DELIVERY",
      }),
      publishOrderEvent(orderIdText, {
        type: "status_changed",
        status: "DELIVERED",
        orderId: orderIdText,
        riderId,
      }),
    ];

    if (merchantStoreId != null && merchantStoreId > 0) {
      sideTasks.push(
        publishStoreEvent(merchantStoreId, {
          type: "order_status_changed",
          orderId: orderIdText,
          status: "DELIVERED",
        })
      );
    }

    await Promise.allSettled(sideTasks);
  })().catch((err) => {
    console.warn("[verifyFoodDeliveryOtpForRider] post-commit effects failed:", err);
  });
}

async function verifyFoodDeliveryOtpForRider(
  riderId: number,
  orderRef: string,
  otpInput: string,
  payload?: RiderDeliveryVerifyPayload
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();
  const proofUrl = String(payload?.deliveryImageUrl ?? "").trim();
  const proofKey = String(payload?.deliveryImageR2Key ?? "").trim();
  if (!proofUrl || !proofKey) {
    throw Object.assign(new Error("Delivery photo is required"), { statusCode: 400 });
  }
  if (!/\/attachments\/proxy/i.test(proofUrl)) {
    throw Object.assign(new Error("Invalid delivery image reference"), { statusCode: 400 });
  }

  let savedCorePk = 0;
  let savedMerchantStoreId: number | null = null;
  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        foodStatus: ordersFood.orderStatus,
        merchantStoreId: ordersCore.merchantStoreId,
      })
      .from(ordersCore)
      .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
      .where(
        and(
          orderRefWhere(orderRef),
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "food"),
          notInArray(ordersCore.status, ["delivered", "cancelled", "failed"])
        )
      )
      .limit(1);

    if (!existing?.id || !existing.orderId) {
      throw Object.assign(new Error("Food order not ready for delivery"), { statusCode: 409 });
    }

    savedMerchantStoreId = existing.merchantStoreId ?? null;

    const otpCandidates = await loadFoodDeliveryOtpCandidates(tx, existing.id);
    assertFoodDeliveryOtpMatch(otpInput, otpCandidates);

    const foodSt = String(existing.foodStatus ?? "").trim().toUpperCase();
    if (foodSt !== "OUT_FOR_DELIVERY") {
      throw Object.assign(new Error("Order is not out for delivery"), { statusCode: 409 });
    }

    await assertRiderMilestoneGeoFence({
      riderId,
      orderCorePk: existing.id,
      serviceType: "food",
      milestoneKey: "mark_delivered",
      gps: payload,
    });

    const [row] = await tx
      .update(ordersCore)
      .set({
        status: "delivered",
        currentStatus: "DELIVERED",
        actualDeliveryTime: now,
        updatedAt: now,
      })
      .where(and(eq(ordersCore.id, existing.id), eq(ordersCore.riderId, riderId)))
      .returning({ id: ordersCore.id });

    if (!row?.id) {
      throw Object.assign(new Error("Could not confirm delivery"), { statusCode: 409 });
    }

    await tx
      .update(ordersFood)
      .set({
        orderStatus: "DELIVERED",
        deliveredAt: now,
        updatedAt: now,
      })
      .where(eq(ordersFood.orderId, row.id));

    try {
      await tx.execute(sql`SAVEPOINT rider_delivery_assignment`);
      await tx.execute(sql`
        UPDATE delivery_assignments
        SET
          assignment_status = 'DELIVERED',
          delivered_at = COALESCE(delivered_at, ${now.toISOString()}::timestamptz),
          updated_at = ${now.toISOString()}::timestamptz
        WHERE order_id = ${existing.orderId.trim()} AND rider_id = ${riderId}
      `);
      await tx.execute(sql`RELEASE SAVEPOINT rider_delivery_assignment`);
    } catch (daErr) {
      try {
        await tx.execute(sql`ROLLBACK TO SAVEPOINT rider_delivery_assignment`);
      } catch {
        /* savepoint may not exist */
      }
      console.warn("[verifyFoodDeliveryOtpForRider] delivery_assignments update skipped:", daErr);
    }

    const [riderProfile] = await tx
      .select({ name: riders.name })
      .from(riders)
      .where(eq(riders.id, riderId))
      .limit(1);

    const riderName = riderProfile?.name ?? null;
    const hasGps =
      payload?.lat != null &&
      payload?.lng != null &&
      Number.isFinite(payload.lat) &&
      Number.isFinite(payload.lng);
    const distance = hasGps
      ? await riderDistanceAtMilestone(riderId, row.id, payload)
      : undefined;

    savedCorePk = row.id;

    try {
      await tx.execute(sql`SAVEPOINT rider_delivered_timeline`);
      await recordDeliveredTimelineTx(tx, {
        orderCorePk: row.id,
        deliveredAt: now,
        riderId,
        riderName,
      });
      await tx.execute(sql`RELEASE SAVEPOINT rider_delivered_timeline`);
    } catch (timelineErr) {
      try {
        await tx.execute(sql`ROLLBACK TO SAVEPOINT rider_delivered_timeline`);
      } catch {
        /* ignore */
      }
      console.warn("[verifyFoodDeliveryOtpForRider] order_timelines insert skipped:", timelineErr);
    }

    try {
      await tx.execute(sql`SAVEPOINT rider_delivered_milestone`);
      await recordRiderAssignmentMilestone(tx, {
        orderCorePk: row.id,
        orderIdText: existing.orderId.trim(),
        riderId,
        eventType: "delivered",
        occurredAt: now,
        distance,
        statusMessage: "Delivered",
      });
      await tx.execute(sql`RELEASE SAVEPOINT rider_delivered_milestone`);
    } catch (milestoneErr) {
      try {
        await tx.execute(sql`ROLLBACK TO SAVEPOINT rider_delivered_milestone`);
      } catch {
        /* ignore */
      }
      console.warn("[verifyFoodDeliveryOtpForRider] rider milestone skipped:", milestoneErr);
    }

    try {
      await tx.execute(sql`SAVEPOINT rider_delivery_proof`);
      await recordOrderDeliveryProofImageTx(tx, {
        orderCorePk: row.id,
        riderId,
        imageUrl: proofUrl,
        r2Key: proofKey || null,
        takenAt: now,
      });
      await tx.execute(sql`RELEASE SAVEPOINT rider_delivery_proof`);
    } catch (imgErr) {
      try {
        await tx.execute(sql`ROLLBACK TO SAVEPOINT rider_delivery_proof`);
      } catch {
        /* ignore */
      }
      console.warn("[verifyFoodDeliveryOtpForRider] delivery image save skipped:", imgErr);
    }

    const [full] = await tx
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        distanceKm: ordersCore.distanceKm,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        tipAmount: ordersCore.tipAmount,
        billingSnapshot: ordersCore.billingSnapshot,
        createdAt: ordersCore.createdAt,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        foodStatus: ordersFood.orderStatus,
        restaurantName: ordersFood.restaurantName,
        foodItemsCount: ordersFood.foodItemsCount,
        customerName: ordersFood.customerName,
        customerPhone: ordersFood.customerPhone,
      })
      .from(ordersCore)
      .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
      .where(eq(ordersCore.id, row.id))
      .limit(1);

    if (!full?.orderId) throw new Error("Food order missing after delivery");
    return { summary: mapFoodRowWithStatus(full), orderIdText: existing.orderId.trim() };
  });

  if (savedCorePk > 0) {
    runFoodDeliveryPostCommitEffects({
      orderCorePk: savedCorePk,
      orderIdText: updated.orderIdText,
      riderId,
      proofUrl,
      proofKey,
      takenAt: now,
      merchantStoreId: savedMerchantStoreId,
    });
  }

  return updated.summary;
}

export async function verifyDeliveryOtpForRider(
  riderId: number,
  orderRef: string,
  otpInput: string,
  payload?: RiderDeliveryVerifyPayload
): Promise<RiderOrderSummary> {
  const db = getDb();
  const [meta] = await db
    .select({ orderType: ordersCore.orderType })
    .from(ordersCore)
    .where(orderRefWhere(orderRef))
    .limit(1);

  if (meta?.orderType === "food") {
    return verifyFoodDeliveryOtpForRider(riderId, orderRef, otpInput, payload);
  }

  if (meta?.orderType === "person_ride") {
    throw Object.assign(
      new Error("Person rides are completed without drop OTP — use complete ride"),
      { statusCode: 409 }
    );
  }

  throw Object.assign(new Error("Delivery OTP is only supported for food orders"), {
    statusCode: 409,
  });
}

export async function completePersonRideForRider(
  riderId: number,
  orderRef: string,
  gps?: RiderGpsPayload
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
      })
      .from(ordersCore)
      .where(
        and(
          orderRefWhere(orderRef),
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "person_ride"),
          inArray(ordersCore.status, ["picked_up", "in_transit"])
        )
      )
      .limit(1);

    if (!existing?.id || !existing.orderId) {
      throw Object.assign(new Error("Ride not ready for completion"), { statusCode: 409 });
    }

    const currentSt = String(existing.currentStatus ?? "").trim().toUpperCase();
    if (currentSt !== "REACHED_CUSTOMER") {
      throw Object.assign(new Error("Reach drop location before completing the ride"), {
        statusCode: 409,
      });
    }

    await assertRiderMilestoneGeoFence({
      riderId,
      orderCorePk: existing.id,
      serviceType: "person_ride",
      milestoneKey: "complete_ride",
      gps,
    });

    const [row] = await tx
      .update(ordersCore)
      .set({
        status: "delivered",
        currentStatus: "DELIVERED",
        actualDeliveryTime: now,
        updatedAt: now,
      })
      .where(and(eq(ordersCore.id, existing.id), eq(ordersCore.riderId, riderId)))
      .returning({ id: ordersCore.id });

    if (!row?.id) {
      throw Object.assign(new Error("Could not complete ride"), { statusCode: 409 });
    }

    const orderIdText = existing.orderId.trim();
    const distance = await riderDistanceAtMilestone(riderId, row.id, gps);
    await recordRiderAssignmentMilestone(tx, {
      orderCorePk: row.id,
      orderIdText,
      riderId,
      eventType: "delivered",
      occurredAt: now,
      distance,
      statusMessage: "Ride completed",
    });

    await appendOrderTimeline(tx, {
      orderCorePk: row.id,
      status: "DELIVERED",
      previousStatus: currentSt,
      actorType: "rider",
      actorId: riderId,
      statusMessage: "Ride completed",
      occurredAt: now,
    });

    void publishOrderEvent(orderIdText, {
      type: "status_changed",
      status: "DELIVERED",
      orderId: orderIdText,
      riderId,
    }).catch(() => {});

    const [full] = await tx
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        dropAddressGeocoded: ordersCore.dropAddressGeocoded,
        distanceKm: ordersCore.distanceKm,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        createdAt: ordersCore.createdAt,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        rideType: ordersRide.rideType,
        estimatedFare: ordersRide.estimatedFare,
        searchExpiresAt: ordersRide.searchExpiresAt,
        pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
        passengerName: ordersRide.passengerName,
        passengerPhone: ordersRide.passengerPhone,
        customerFullName: customers.fullName,
        customerPrimaryMobile: customers.primaryMobile,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .leftJoin(customers, eq(ordersCore.customerId, customers.id))
      .where(eq(ordersCore.id, row.id))
      .limit(1);

    if (!full?.orderId) throw new Error("Ride missing after completion");
    return mapRideRowWithStatus(full, "delivered", full.currentStatus);
  });

  return updated;
}

async function verifyPersonRideDropOtpForRider(
  riderId: number,
  orderRef: string,
  otpInput: string,
  payload?: RiderGpsPayload
): Promise<RiderOrderSummary> {
  const gps = payload;
  const db = getDb();
  const now = new Date();
  const normalizedOtp = String(otpInput ?? "").trim().replace(/\D/g, "");
  if (normalizedOtp.length !== 4) {
    throw Object.assign(new Error("Enter the 4-digit drop OTP"), { statusCode: 400 });
  }

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        deliveryOtp: ordersCore.deliveryOtp,
      })
      .from(ordersCore)
      .where(
        and(
          orderRefWhere(orderRef),
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "person_ride"),
          inArray(ordersCore.status, ["picked_up", "in_transit"])
        )
      )
      .limit(1);

    if (!existing?.id || !existing.orderId) {
      throw Object.assign(new Error("Ride not ready for completion"), { statusCode: 409 });
    }

    const storedOtp = String(existing.deliveryOtp ?? "").trim();
    if (!storedOtp || storedOtp !== normalizedOtp) {
      throw Object.assign(new Error("Incorrect drop OTP"), { statusCode: 403 });
    }

    const [row] = await tx
      .update(ordersCore)
      .set({
        status: "delivered",
        currentStatus: "DELIVERED",
        actualDeliveryTime: now,
        updatedAt: now,
      })
      .where(and(eq(ordersCore.id, existing.id), eq(ordersCore.riderId, riderId)))
      .returning({ id: ordersCore.id });

    if (!row?.id) {
      throw Object.assign(new Error("Could not complete ride"), { statusCode: 409 });
    }

    const orderIdText = existing.orderId.trim();
    const distance = await riderDistanceAtMilestone(riderId, row.id, gps);
    await recordRiderAssignmentMilestone(tx, {
      orderCorePk: row.id,
      orderIdText,
      riderId,
      eventType: "delivered",
      occurredAt: now,
      distance,
      statusMessage: "Ride completed",
    });

    await appendOrderTimeline(tx, {
      orderCorePk: row.id,
      status: "DELIVERED",
      previousStatus: String(existing.currentStatus ?? "REACHED_CUSTOMER"),
      actorType: "rider",
      actorId: riderId,
      statusMessage: "Drop OTP verified — ride completed",
      occurredAt: now,
    });

    void publishOrderEvent(orderIdText, {
      type: "status_changed",
      status: "DELIVERED",
      orderId: orderIdText,
      riderId,
    }).catch(() => {});

    const [full] = await tx
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        dropAddressGeocoded: ordersCore.dropAddressGeocoded,
        distanceKm: ordersCore.distanceKm,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        createdAt: ordersCore.createdAt,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        rideType: ordersRide.rideType,
        estimatedFare: ordersRide.estimatedFare,
        searchExpiresAt: ordersRide.searchExpiresAt,
        pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
        passengerName: ordersRide.passengerName,
        passengerPhone: ordersRide.passengerPhone,
        customerFullName: customers.fullName,
        customerPrimaryMobile: customers.primaryMobile,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .leftJoin(customers, eq(ordersCore.customerId, customers.id))
      .where(eq(ordersCore.id, row.id))
      .limit(1);

    if (!full?.orderId) throw new Error("Ride missing after completion");
    return mapRideRowWithStatus(full, "delivered", full.currentStatus);
  });

  return updated;
}

const RIDER_UNASSIGNABLE_STATUSES = new Set([
  "accepted",
  "reached_store",
  PERSON_RIDE_AT_USER_STATUS,
]);

export async function cancelAssignedRideForRider(
  riderId: number,
  orderRef: string,
  input: { reasonCode: string; reasonText?: string | null }
): Promise<{ ok: true }> {
  const db = getDb();
  const now = new Date();
  const reasonCode = input.reasonCode?.trim();
  if (!reasonCode) {
    throw Object.assign(new Error("Cancellation reason is required"), { statusCode: 400 });
  }

  const cancelled = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
      })
      .from(ordersCore)
      .where(
        and(
          orderRefWhere(orderRef),
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "person_ride")
        )
      )
      .limit(1);

    if (!existing?.id || !existing.orderId) {
      throw Object.assign(new Error("Ride order not found"), { statusCode: 404 });
    }

    const st = String(existing.status ?? "");
    if (!RIDER_UNASSIGNABLE_STATUSES.has(st)) {
      throw Object.assign(new Error("Ride cannot be cancelled in current status"), {
        statusCode: 409,
      });
    }

    const orderIdText = existing.orderId.trim();
    const reasonText = input.reasonText?.trim() || null;

    await recordRideRiderUnassign(tx, {
      orderCorePk: existing.id,
      orderIdText,
      riderId,
      reasonCode,
      reasonText,
      coreStatusBefore: String(existing.currentStatus ?? st),
      occurredAt: now,
    });

    await tx
      .update(ordersCore)
      .set({
        riderId: null,
        status: "assigned",
        currentStatus: "SEARCHING_RIDER",
        updatedAt: now,
      })
      .where(and(eq(ordersCore.id, existing.id), eq(ordersCore.riderId, riderId)));

    await tx
      .update(ordersRide)
      .set({
        assignedRiderId: null,
        riderAssignedAt: null,
        riderReachedPickupAt: null,
        updatedAt: now,
      })
      .where(eq(ordersRide.orderId, existing.id));

    await appendOrderTimeline(tx, {
      orderCorePk: existing.id,
      status: "SEARCHING_RIDER",
      previousStatus: String(existing.currentStatus ?? st.toUpperCase()),
      actorType: "rider",
      actorId: riderId,
      statusMessage: reasonText ?? reasonCode,
      occurredAt: now,
      metadata: {
        riderUnassign: true,
        reasonCode,
        reasonText,
        serviceType: "person_ride",
      },
    });

    return { orderCoreId: existing.id, orderIdText, reasonText };
  });

  await recordRiderDispatchExclusion({
    orderCoreId: cancelled.orderCoreId,
    orderId: cancelled.orderIdText,
    riderId,
    exclusionSource: "rider_cancel_assigned",
    reasonCode,
    reasonText: cancelled.reasonText,
    actorType: "rider",
    actorId: String(riderId),
    metadata: { serviceType: "person_ride" },
  });

  await recordDispatchAssignmentAudit({
    orderCoreId: cancelled.orderCoreId,
    orderId: cancelled.orderIdText,
    riderId,
    eventType: "cancelled",
    cancelledAt: now,
    removalReason: cancelled.reasonText ?? reasonCode,
    actorType: "rider",
    actorId: String(riderId),
    metadata: { reasonCode, reasonText: cancelled.reasonText, serviceType: "person_ride" },
    occurredAt: now,
  });

  return { ok: true };
}

const RIDER_MERCHANT_PICKUP_FEEDBACK_TAGS = new Set([
  "order_given_on_time",
  "merchant_was_nice",
  "easy_to_find",
  "pickup_experience_good",
  "waiting_time_ok",
  "waiting_time_long",
  "long_wait_time",
  "order_not_ready",
  "rude_behavior",
  "wrong_items",
]);

export type RiderMerchantPickupFeedbackPayload = {
  rating?: number;
  tags?: string[];
  skipped?: boolean;
};

async function loadRiderMerchantFeedbackSubmitted(
  db: ReturnType<typeof getDb>,
  riderId: number,
  orderRef: string | number
): Promise<boolean> {
  const orderRefText = String(orderRef ?? "").trim();
  if (!orderRefText) return false;
  const { isNumericId, orderIdNum } = parseOrderRefParam(orderRefText);
  const coreIdMatch = isNumericId ? orderIdNum : -1;
  try {
    const rows = await db.execute<{ submitted: boolean }>(sql`
      SELECT
        (
          ora.rider_merchant_feedback_at IS NOT NULL
          OR ora.rider_merchant_feedback_skipped = TRUE
        ) AS submitted
      FROM order_rider_assignments ora
      INNER JOIN orders_core oc ON oc.id = ora.order_core_id
      WHERE ora.rider_id = ${riderId}
        AND ora.is_active = TRUE
        AND (
          oc.order_id = ${orderRefText}
          OR oc.formatted_order_id = ${orderRefText}
          OR oc.id = ${coreIdMatch}
        )
      ORDER BY ora.id DESC
      LIMIT 1
    `);
    return (rows as { submitted: boolean }[])[0]?.submitted === true;
  } catch (err) {
    console.warn("[loadRiderMerchantFeedbackSubmitted] lookup failed:", err);
    return false;
  }
}

export async function submitRiderMerchantPickupFeedback(
  riderId: number,
  orderRef: string,
  payload: RiderMerchantPickupFeedbackPayload
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();
  const skipped = payload.skipped === true;

  const [meta] = await db
    .select({
      coreId: ordersCore.id,
      orderId: ordersCore.orderId,
      orderType: ordersCore.orderType,
      riderId: ordersCore.riderId,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      foodStatus: ordersFood.orderStatus,
    })
    .from(ordersCore)
    .leftJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(orderRefWhere(orderRef))
    .limit(1);

  if (!meta?.coreId || !meta.orderId) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }
  if (meta.orderType !== "food") {
    throw Object.assign(new Error("Merchant feedback is only for food orders"), { statusCode: 409 });
  }
  if (meta.riderId !== riderId) {
    throw Object.assign(new Error("Order not assigned to you"), { statusCode: 403 });
  }

  const coreSt = String(meta.status ?? "").trim();
  const currentSt = String(meta.currentStatus ?? "").trim().toUpperCase();
  const foodSt = String(meta.foodStatus ?? "").trim().toUpperCase();
  const pickupVerified =
    foodSt === "OUT_FOR_DELIVERY" ||
    currentSt === "OUT_FOR_DELIVERY" ||
    coreSt === "picked_up" ||
    coreSt === "in_transit";
  if (!pickupVerified) {
    throw Object.assign(new Error("Complete pickup verification before submitting feedback"), {
      statusCode: 409,
    });
  }

  const alreadySubmitted = await loadRiderMerchantFeedbackSubmitted(db, riderId, meta.orderId.trim());
  if (alreadySubmitted) {
    return getFoodOrderForRider(riderId, orderRef);
  }

  let rating: number | null = null;
  let tagsJson: string | null = null;

  if (!skipped) {
    const ratingNum = Number(payload.rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      throw Object.assign(new Error("Select a rating from 1 to 5"), { statusCode: 400 });
    }
    rating = ratingNum;
    const rawTags = Array.isArray(payload.tags) ? payload.tags : [];
    const normalizedTags = [
      ...new Set(
        rawTags
          .map((t) => String(t ?? "").trim())
          .filter((t) => RIDER_MERCHANT_PICKUP_FEEDBACK_TAGS.has(t))
      ),
    ];
    tagsJson = JSON.stringify(normalizedTags);
  }

  const feedbackAt = skipped ? sql`NULL` : sql`${now.toISOString()}::timestamptz`;
  const feedbackTags =
    skipped || tagsJson == null ? sql`NULL` : sql`${tagsJson}::jsonb`;

  const updateResult = await db.execute<{ id: number }>(sql`
    UPDATE order_rider_assignments
    SET
      rider_merchant_rating = ${skipped ? null : rating},
      rider_merchant_feedback_tags = ${feedbackTags},
      rider_merchant_feedback_at = ${feedbackAt},
      rider_merchant_feedback_skipped = ${skipped},
      updated_at = ${now.toISOString()}::timestamptz
    WHERE order_core_id = ${meta.coreId}
      AND rider_id = ${riderId}
      AND is_active = TRUE
    RETURNING id
  `);

  if (!(updateResult as { id: number }[])[0]?.id) {
    throw Object.assign(new Error("No active rider assignment found for this order"), {
      statusCode: 404,
    });
  }

  return getFoodOrderForRider(riderId, orderRef);
}

const RIDER_CUSTOMER_DELIVERY_FEEDBACK_TAGS = new Set([
  "polite_customer",
  "clear_instructions",
  "easy_to_find",
  "quick_handover",
  "long_wait_at_door",
  "hard_to_find",
  "rude_customer",
  "wrong_address",
  "customer_unreachable",
]);

export type RiderCustomerDeliveryFeedbackPayload = {
  rating?: number;
  tags?: string[];
  comment?: string;
  skipped?: boolean;
};

async function loadRiderCustomerFeedbackSubmitted(
  db: ReturnType<typeof getDb>,
  riderId: number,
  orderCorePk: number
): Promise<boolean> {
  try {
    const rows = await db.execute<{ submitted: boolean }>(sql`
      SELECT (skipped = TRUE OR submitted_at IS NOT NULL) AS submitted
      FROM rider_customer_delivery_feedback
      WHERE order_core_id = ${orderCorePk}
        AND rider_id = ${riderId}
      LIMIT 1
    `);
    return (rows as { submitted: boolean }[])[0]?.submitted === true;
  } catch (err) {
    console.warn("[loadRiderCustomerFeedbackSubmitted] lookup failed:", err);
    return false;
  }
}

export async function submitRiderCustomerDeliveryFeedback(
  riderId: number,
  orderRef: string,
  payload: RiderCustomerDeliveryFeedbackPayload
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();
  const skipped = payload.skipped === true;

  const [meta] = await db
    .select({
      coreId: ordersCore.id,
      orderId: ordersCore.orderId,
      orderType: ordersCore.orderType,
      riderId: ordersCore.riderId,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      foodStatus: ordersFood.orderStatus,
    })
    .from(ordersCore)
    .leftJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(orderRefWhere(orderRef))
    .limit(1);

  if (!meta?.coreId || !meta.orderId) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }
  if (meta.orderType !== "food") {
    throw Object.assign(new Error("Customer feedback is only for food orders"), {
      statusCode: 409,
    });
  }
  if (meta.riderId !== riderId) {
    throw Object.assign(new Error("Order not assigned to you"), { statusCode: 403 });
  }

  const coreSt = String(meta.status ?? "").trim();
  const foodSt = String(meta.foodStatus ?? "").trim().toUpperCase();
  const delivered =
    coreSt === "delivered" || foodSt === "DELIVERED" || foodSt === "COMPLETED";
  if (!delivered) {
    throw Object.assign(new Error("Complete delivery before submitting customer feedback"), {
      statusCode: 409,
    });
  }

  const alreadySubmitted = await loadRiderCustomerFeedbackSubmitted(
    db,
    riderId,
    meta.coreId
  );
  if (alreadySubmitted) {
    return getFoodOrderForRider(riderId, orderRef);
  }

  let rating: number | null = null;
  let tagsJson: string | null = null;
  let commentText: string | null = null;

  if (!skipped) {
    const ratingNum = Number(payload.rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      throw Object.assign(new Error("Select a rating from 1 to 5"), { statusCode: 400 });
    }
    rating = ratingNum;
    const rawTags = Array.isArray(payload.tags) ? payload.tags : [];
    const normalizedTags = [
      ...new Set(
        rawTags
          .map((t) => String(t ?? "").trim())
          .filter((t) => RIDER_CUSTOMER_DELIVERY_FEEDBACK_TAGS.has(t))
      ),
    ];
    tagsJson = JSON.stringify(normalizedTags);
    const comment = String(payload.comment ?? "").trim();
    commentText = comment.length > 0 ? comment.slice(0, 2000) : null;
  }

  const orderIdText = meta.orderId.trim();
  const submittedAt = skipped ? null : now.toISOString();
  const tagsParam =
    skipped || tagsJson == null ? sql`NULL` : sql`${tagsJson}::jsonb`;

  await db.execute(sql`
    INSERT INTO rider_customer_delivery_feedback (
      order_core_id,
      rider_id,
      order_id_text,
      rating,
      feedback_tags,
      comment_text,
      skipped,
      submitted_at,
      created_at,
      updated_at
    ) VALUES (
      ${meta.coreId},
      ${riderId},
      ${orderIdText},
      ${skipped ? null : rating},
      ${tagsParam},
      ${skipped ? null : commentText},
      ${skipped},
      ${submittedAt != null ? sql`${submittedAt}::timestamptz` : sql`NULL`},
      ${now.toISOString()}::timestamptz,
      ${now.toISOString()}::timestamptz
    )
    ON CONFLICT (order_core_id, rider_id) DO UPDATE SET
      rating = EXCLUDED.rating,
      feedback_tags = EXCLUDED.feedback_tags,
      comment_text = EXCLUDED.comment_text,
      skipped = EXCLUDED.skipped,
      submitted_at = EXCLUDED.submitted_at,
      updated_at = EXCLUDED.updated_at
  `);

  return getFoodOrderForRider(riderId, orderRef);
}

export async function getMilestoneGeoFenceForRiderOrder(
  riderId: number,
  orderRef: string,
  gps?: RiderGpsPayload
): Promise<{
  orderId: string;
  serviceType: "food" | "parcel" | "person_ride";
  milestones: Awaited<ReturnType<typeof getOrderMilestoneGeoFenceStatuses>>;
}> {
  const db = getDb();
  const [row] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      orderType: ordersCore.orderType,
      riderId: ordersCore.riderId,
    })
    .from(ordersCore)
    .where(orderRefWhere(orderRef))
    .limit(1);

  if (!row?.id || !row.orderId) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }
  if (row.riderId !== riderId) {
    throw Object.assign(new Error("Order not assigned to you"), { statusCode: 403 });
  }

  const serviceType = String(row.orderType ?? "").trim() as "food" | "parcel" | "person_ride";
  if (serviceType !== "food" && serviceType !== "parcel" && serviceType !== "person_ride") {
    throw Object.assign(new Error("Unsupported order type"), { statusCode: 409 });
  }

  const milestones = await getOrderMilestoneGeoFenceStatuses({
    riderId,
    orderCorePk: row.id,
    serviceType,
    gps,
  });

  return {
    orderId: row.orderId.trim(),
    serviceType,
    milestones,
  };
}
