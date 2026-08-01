/**
 * Rider dispatch pool — available ride orders, accept, reject.
 */

import { and, eq, isNull, isNotNull, inArray, or, sql, desc, asc, notInArray } from "drizzle-orm";
import { getDb, getSql } from "../../db/client.js";
import { recordRiderOrderMilestoneLocationEvent } from "../../lib/rider-location-business-event.js";
import {
  customers,
  merchantStoreRatings,
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
import { notifyMerchantRiderReachedPickup } from "../../lib/merchant-push-notify.js";
import {
  notifyCustomerFoodLifecycle,
  notifyCustomerParcelLifecycle,
  notifyCustomerRideLifecycle,
} from "../../lib/customer-lifecycle-notify.js";
import {
  publishOrderEvent,
  publishStoreEvent,
} from "../realtime/publish.js";
import type { ActiveRiderAssignmentMilestones, RiderDistanceSnapshot } from "../../lib/order-rider-assignment-history.js";
import { resolveRiderOrderDistanceSnapshot, attachRiderOrderDistanceBreakdown } from "../../lib/rider-order-distance-snapshot.js";
import { recordFoodRiderAssignedTimeline } from "../../lib/food-rider-assigned-timeline.js";
import {
  loadActiveRiderAssignmentMilestones,
  loadActiveRiderAssignmentMilestonesForRider,
  recordRiderAssignmentMilestone,
} from "../../lib/order-rider-assignment-history.js";
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
  fetchLedgerEarningForCoreId,
  fetchLedgerEarningsByCoreIds,
  resolveRiderOrderEarnings,
} from "../../lib/rider-order-earning-resolve.js";
import { resolveOrderRiderPayoutBreakdown } from "../../lib/resolve-order-rider-payout.js";
import { rideAddressLabelsFromCheckoutMetadata, rideGeoFromCheckoutMetadata, resolveRideAddressDisplayLabel, rideTripDistanceFromCheckoutMetadata, roundRideTripDistanceKm } from "../../lib/ride-address-display.js";
import {
  persistRideRiderAcceptPayoutSnapshot,
  persistFoodRiderAcceptPayoutSnapshot,
  persistRideRiderPayoutFromSummary,
  applyRidePickupWaitingToBilling,
  readRideRiderPayoutSnapshot,
  resolveRideRiderPayoutForDisplay,
  ensureRidePickupWaitingBillingReconciled,
  isRideFarePaymentPending,
  maskRideEarningsIfWalletCreditPending,
} from "../../lib/ride-rider-payout-snapshot.js";
import {
  attachRidePickupWaitFields,
  computeRidePickupWaitSeconds,
  resolveRidePickupFreeWaitMinutes,
} from "../../lib/ride-pickup-wait.js";
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
import { recordDispatchAssignmentAudit, recordPendingDispatchOffersMissed, listPendingDispatchOffersForOrder } from "../../lib/rider-dispatch-assignment-audit.js";
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
import { resolveRiderCustomerContactFields } from "../../lib/order-alternate-contact.js";

export const RIDER_ACCEPT_WINDOW_SEC = 60;
export { RIDER_DISPATCH_LOCATION_MAX_AGE_MINUTES } from "../../lib/order-assignment-engine.js";

/** Person ride pickup after OTP — passenger at pickup (not food `reached_store`). */
export const PERSON_RIDE_AT_USER_STATUS = "reached_user" as const;

/** Before OTP: only accepted (reach slide does not change orders_core.status). */
const PERSON_RIDE_PRE_PICKUP_OTP_STATUSES = ["accepted", "reached_store"] as const;

/** After OTP verified — start ride requires reached_user only. */
const PERSON_RIDE_READY_TO_START_STATUSES = [PERSON_RIDE_AT_USER_STATUS] as const;

function noteRiderOrderLocationMilestone(
  riderId: number,
  orderId: string | null | undefined,
  status: string,
  gps?: { lat?: number | null; lng?: number | null }
): void {
  const oid = orderId?.trim();
  if (!oid) return;
  void recordRiderOrderMilestoneLocationEvent({
    riderId,
    orderId: oid,
    status,
    lat: gps?.lat ?? null,
    lng: gps?.lng ?? null,
  });
}

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
  /** Base slab payout before surge (pickup + drop + base fare). */
  baseEarning?: number;
  /** Customer-added tip (ride tip boost / food tip). */
  customerTipAmount?: number;
  /** Waiting charge included in slab quote (usually 0 at offer time). */
  waitingEarning?: number;
  /** Total surge amount when multiple surges are active. */
  surgeEarning?: number;
  /** Individual surge lines with names for rider offer UI. */
  appliedSurges?: { name: string; amount: number }[];
  /** Slab + surge + waiting before tip. */
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
  /** Rider tapped "Okay, I'm picking!" on the pick-order sheet for this assignment. */
  pickupAcknowledged?: boolean;
  /** ISO timestamp when rider acknowledged pickup intent. */
  pickupAcknowledgedAt?: string | null;
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
  /** Person ride: free OTP grace minutes from geo slab. */
  ridePickupWaitFreeMinutes?: number;
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
  customerPrimaryName?: string | null;
  customerPrimaryPhone?: string | null;
  customerAlternateName?: string | null;
  customerAlternatePhone?: string | null;
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
  /** Admin released rider while customer fare still due. */
  adminRiderPaymentClearedAt?: string | null;
  /** Delivered ride: customer fare unpaid — earnings not yet in wallet/ledger. */
  walletCreditPending?: boolean;
  /** Average rider feedback rating for this customer (1–5). */
  customerRating?: number | null;
  /** Person ride: passenger's star rating for this trip (1–5). */
  passengerRating?: number | null;
  /** Admin/dashboard cancellation penalty debited from rider wallet. */
  cancellationPenaltyApplied?: boolean;
  cancellationPenaltyAmount?: number | null;
};

export type RiderFoodOrderItem = {
  name: string;
  quantity: number;
  variantName?: string | null;
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

function resolveRiderDeliveryFee(row: {
  riderEarning: string | null;
  fareAmount: string | null;
  billingSnapshot?: unknown;
}): number {
  return resolveRiderOrderEarnings(row).baseEarning;
}

function resolveCustomerTipAmount(tipAmount: unknown): number {
  const tip = Number(tipAmount);
  return Number.isFinite(tip) && tip > 0 ? Math.round(tip) : 0;
}

type RideRow = {
  orderId: string | null;
  formattedOrderId: string | null;
  pickupAddressRaw: string;
  pickupAddressNormalized?: string | null;
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
  checkoutMetadata?: unknown;
  billingSnapshot?: unknown;
  acceptPayoutSnapshot?: unknown;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  tipAmount?: string | null;
  adminRiderPaymentClearedAt?: Date | null;
};

function resolveRideCustomer(row: RideRow): { name: string | null; phone: string | null } {
  const name = row.passengerName?.trim() || row.customerFullName?.trim() || null;
  const phone = row.passengerPhone?.trim() || row.customerPrimaryMobile?.trim() || null;
  return { name, phone };
}

function resolveRideStoredTripKm(row: {
  distanceKm: string | null;
  checkoutMetadata?: unknown;
}): number | undefined {
  const fromBooking = rideTripDistanceFromCheckoutMetadata(row.checkoutMetadata);
  if (fromBooking != null) return fromBooking;
  const fromCore = row.distanceKm != null ? Number(row.distanceKm) : undefined;
  return roundRideTripDistanceKm(fromCore);
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
    order.category === "ride"
      ? roundRideTripDistanceKm(order.tripDistanceKm ?? order.distanceKm)
      : order.distanceKm != null && Number.isFinite(order.distanceKm) && order.distanceKm > 0
        ? Math.round(order.distanceKm * 10) / 10
        : pickupLat && pickupLng && dropLat && dropLng
          ? Math.round((haversineDistanceMeters(pickupLat, pickupLng, dropLat, dropLng) / 1000) * 10) / 10
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

function applyRidePayoutSnapshot(
  summary: RiderOrderSummary,
  billingSnapshot?: unknown,
  acceptPayoutSnapshot?: unknown
): RiderOrderSummary {
  const snap = resolveRideRiderPayoutForDisplay({
    billingSnapshot,
    acceptPayoutSnapshot,
  });
  if (!snap) return summary;
  const tip = summary.customerTipAmount ?? 0;
  const distancePatch =
    snap.tripDistanceKm != null
      ? {
          pickupDistanceKm: snap.pickupDistanceKm,
          tripDistanceKm: snap.tripDistanceKm,
          totalDistanceKm: snap.totalDistanceKm,
          distanceKm: snap.tripDistanceKm,
        }
      : {};
  return {
    ...summary,
    ...distancePatch,
    baseEarning: snap.baseEarning,
    waitingEarning: snap.waitingEarning > 0 ? snap.waitingEarning : undefined,
    surgeEarning: snap.surgeEarning > 0 ? snap.surgeEarning : undefined,
    appliedSurges: snap.appliedSurges.length > 0 ? snap.appliedSurges : undefined,
    estimatedEarning: snap.totalEarning,
    totalEarning: snap.totalEarning,
  };
}

function mapRideRow(row: RideRow, ledgerTotal?: number | null): RiderOrderSummary {
  const fare = row.estimatedFare ?? row.grandTotal ?? row.fareAmount;
  let earnings = resolveRiderOrderEarnings(
    {
      riderEarning: row.riderEarning,
      fareAmount: row.fareAmount,
      tipAmount: row.customerTipAmount ?? row.tipAmount ?? null,
      billingSnapshot: row.billingSnapshot,
    },
    ledgerTotal
  );

  // Pending dispatch: never surface customer fare as rider earning.
  // Rider Fare Engine v3.0 (applyGeoSlabRiderEarnings) fills the real payout.
  const hasFrozenPayout =
    (ledgerTotal != null && ledgerTotal > 0) ||
    (Number.isFinite(Number(row.riderEarning)) && Number(row.riderEarning) > 0);
  if (!hasFrozenPayout) {
    const tipRounded = resolveCustomerTipAmount(row.customerTipAmount ?? row.tipAmount);
    earnings = {
      baseEarning: 0,
      customerTipAmount: tipRounded > 0 ? tipRounded : undefined,
      totalEarning: tipRounded,
      estimatedEarning: 0,
    };
  } else if (earnings.totalEarning <= 0) {
    const tipRounded = resolveCustomerTipAmount(row.customerTipAmount);
    earnings = {
      baseEarning: 0,
      customerTipAmount: tipRounded > 0 ? tipRounded : undefined,
      totalEarning: tipRounded,
      estimatedEarning: 0,
    };
  }

  const addressLabels = rideAddressLabelsFromCheckoutMetadata(row.checkoutMetadata);
  const bookingTripKm = resolveRideStoredTripKm(row);
  const canonicalId = row.orderId?.trim() || row.formattedOrderId?.trim() || "";
  const payment = resolveOrderPaymentFields(row);
  const customer = resolveRideCustomer(row);
  const mapped: RiderOrderSummary = {
    id: canonicalId,
    status: "pending",
    category: "ride",
    pickup: {
      address: resolveRideAddressDisplayLabel({
        label: addressLabels.pickupLabel,
        fullAddress: addressLabels.pickupFullAddress,
        fallbacks: [row.ridePickupAddress, row.pickupAddressGeocoded, row.pickupAddressRaw],
        defaultLabel: "Pickup",
      }),
      lat: parseCoord(row.pickupLat),
      lng: parseCoord(row.pickupLon),
    },
    delivery: {
      address: resolveRideAddressDisplayLabel({
        label: addressLabels.dropLabel,
        fullAddress: addressLabels.dropFullAddress,
        fallbacks: [row.rideDropAddress, row.dropAddressGeocoded, row.dropAddressRaw],
        defaultLabel: "Drop location",
      }),
      lat: parseCoord(row.dropLat),
      lng: parseCoord(row.dropLon),
    },
    distanceKm: bookingTripKm,
    tripDistanceKm: bookingTripKm,
    baseEarning: earnings.baseEarning,
    customerTipAmount: earnings.customerTipAmount,
    totalEarning: earnings.totalEarning,
    estimatedEarning: earnings.estimatedEarning,
    higherDispatchPriority: row.higherDispatchPriority === true,
    createdAt: row.createdAt.toISOString(),
    acceptDeadlineAt: row.searchExpiresAt?.toISOString?.() ?? undefined,
    rideType: row.rideType ?? undefined,
    formattedOrderId: row.formattedOrderId,
    customerName: customer.name,
    customerPhone: customer.phone,
    pickupAddressGeocoded: row.pickupAddressGeocoded?.trim() || undefined,
    dropAddressGeocoded: row.dropAddressGeocoded?.trim() || undefined,
    paymentMethod: payment.paymentMethod,
    paymentStatus: payment.paymentStatus,
    adminRiderPaymentClearedAt: row.adminRiderPaymentClearedAt
      ? row.adminRiderPaymentClearedAt instanceof Date
        ? row.adminRiderPaymentClearedAt.toISOString()
        : String(row.adminRiderPaymentClearedAt)
      : undefined,
  };
  return applyRidePayoutSnapshot(mapped, row.billingSnapshot, row.acceptPayoutSnapshot);
}

type FoodRow = {
  orderId: string | null;
  formattedOrderId: string | null;
  pickupAddressRaw: string;
  pickupAddressNormalized?: string | null;
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
  alternateContactName?: string | null;
  alternateContactPhone?: string | null;
  deliveryPrimaryContactName?: string | null;
  deliveryPrimaryContactPhone?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
};

function resolveOrderPaymentFields(row: {
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  billingSnapshot?: unknown;
}): { paymentMethod: string | null; paymentStatus: string | null } {
  let paymentMethod = row.paymentMethod?.trim() || null;
  let paymentStatus = row.paymentStatus?.trim() || null;
  if (row.billingSnapshot && typeof row.billingSnapshot === "object") {
    const snap = row.billingSnapshot as Record<string, unknown>;
    if (!paymentMethod) {
      const fromSnap =
        typeof snap.paymentMethod === "string"
          ? snap.paymentMethod
          : typeof snap.payment_method === "string"
            ? snap.payment_method
            : null;
      if (fromSnap?.trim()) paymentMethod = fromSnap.trim();
    }
    if (!paymentStatus) {
      const fromSnap =
        typeof snap.paymentStatus === "string"
          ? snap.paymentStatus
          : typeof snap.payment_status === "string"
            ? snap.payment_status
            : null;
      if (fromSnap?.trim()) paymentStatus = fromSnap.trim();
    }
  }
  return { paymentMethod, paymentStatus };
}

function mapFoodRow(row: FoodRow, ledgerTotal?: number | null): RiderOrderSummary {
  const payment = resolveOrderPaymentFields(row);
  let earnings = resolveRiderOrderEarnings(row, ledgerTotal);
  const hasFrozenPayout =
    (ledgerTotal != null && ledgerTotal > 0) ||
    (Number.isFinite(Number(row.riderEarning)) && Number(row.riderEarning) > 0);
  if (!hasFrozenPayout) {
    const tipRounded = resolveCustomerTipAmount(row.tipAmount);
    earnings = {
      baseEarning: 0,
      customerTipAmount: tipRounded > 0 ? tipRounded : undefined,
      totalEarning: tipRounded,
      estimatedEarning: 0,
    };
  }
  const canonicalId = row.orderId?.trim() || row.formattedOrderId?.trim() || "";
  const pickupPin = resolvePickupCoordinates(
    row.pickupLat,
    row.pickupLon,
    row.pickupAddressGeocoded
  );
  const dropPin = resolveDropCoordinates(row.dropLat, row.dropLon, row.dropAddressGeocoded);
  const contacts = resolveRiderCustomerContactFields({
    foodCustomerName: row.customerName,
    foodCustomerPhone: row.customerPhone,
    alternate: row,
  });
  const mapped: RiderOrderSummary = {
    id: canonicalId,
    status: "pending",
    category: "food",
    pickup: {
      address: resolveHumanAddressLabel(
        [row.pickupAddressNormalized, row.pickupAddressRaw, row.restaurantName],
        "Restaurant pickup"
      ),
      lat: pickupPin?.lat ?? 0,
      lng: pickupPin?.lng ?? 0,
    },
    delivery: {
      address: row.dropAddressRaw?.trim() || "Delivery location",
      lat: dropPin?.lat ?? 0,
      lng: dropPin?.lng ?? 0,
    },
    distanceKm: row.distanceKm != null ? Number(row.distanceKm) : undefined,
    estimatedEarning: earnings.estimatedEarning,
    baseEarning: earnings.baseEarning,
    customerTipAmount: earnings.customerTipAmount,
    totalEarning: earnings.totalEarning,
    merchantName: row.restaurantName,
    itemCount: row.foodItemsCount ?? undefined,
    createdAt: row.createdAt.toISOString(),
    formattedOrderId: row.formattedOrderId,
    customerName: contacts.customerName,
    customerPhone: contacts.customerPhone,
    customerPrimaryName: contacts.customerPrimaryName,
    customerPrimaryPhone: contacts.customerPrimaryPhone,
    customerAlternateName: contacts.customerAlternateName,
    customerAlternatePhone: contacts.customerAlternatePhone,
    pickupAddressGeocoded: row.pickupAddressGeocoded?.trim() || undefined,
    dropAddressGeocoded: row.dropAddressGeocoded?.trim() || undefined,
    paymentMethod: payment.paymentMethod,
    paymentStatus: payment.paymentStatus,
  };
  const withSnapshot = applyRidePayoutSnapshot(mapped, row.billingSnapshot);
  if (ledgerTotal != null && ledgerTotal > 0) {
    return { ...withSnapshot, totalEarning: ledgerTotal, estimatedEarning: ledgerTotal };
  }
  return withSnapshot;
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

type RidePickupWaitRow = {
  checkoutMetadata?: unknown;
  pickupLat?: unknown;
  pickupLon?: unknown;
  rideType?: string | null;
  riderReachedPickupAt?: Date | string | null;
  pickupWaitSeconds?: number | null;
  pickupOtpVerifiedAt?: Date | string | null;
};

async function loadPassengerRatingForOrder(
  db: ReturnType<typeof getDb>,
  coreOrderPk: number
): Promise<number | null> {
  const [row] = await db
    .select({
      serviceRating: merchantStoreRatings.serviceRating,
      rating: merchantStoreRatings.rating,
    })
    .from(merchantStoreRatings)
    .where(eq(merchantStoreRatings.orderId, coreOrderPk))
    .limit(1);
  const raw =
    row?.serviceRating != null && Number(row.serviceRating) >= 1
      ? Number(row.serviceRating)
      : row?.rating != null && Number(row.rating) >= 1
        ? Number(row.rating)
        : null;
  if (raw != null && Number.isFinite(raw) && raw >= 1 && raw <= 5) {
    return Math.round(raw);
  }
  return null;
}

async function enrichRideOrderSummary(
  summary: RiderOrderSummary,
  row: RidePickupWaitRow
): Promise<RiderOrderSummary> {
  if (summary.category !== "ride") return summary;
  const freeMinutes = await resolveRidePickupFreeWaitMinutes({
    checkoutMetadata: row.checkoutMetadata,
    pickupLat: Number(row.pickupLat),
    pickupLng: Number(row.pickupLon),
    rideType: row.rideType,
  });
  return attachRidePickupWaitFields(summary, {
    riderReachedPickupAt: row.riderReachedPickupAt,
    pickupWaitSeconds: row.pickupWaitSeconds,
    pickupOtpVerifiedAt: row.pickupOtpVerifiedAt,
    pickupWaitFreeMinutes: freeMinutes,
  });
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
  }));
}

function resolveFoodWorkflowMilestones(
  activeAssignment: ActiveRiderAssignmentMilestones | null | undefined,
  row: FoodRowWithStatus,
  coreSt: string,
  currentSt: string,
  foodSt: string
): {
  atPickup: boolean;
  rideStarted: boolean;
  atCustomer: boolean;
  delivered: boolean;
  pickupWaitReachedAt: Date | string | null;
} {
  const orderReachedAt = toIsoOrNull(row.riderReachedPickupAt);
  const reachedMerchant =
    activeAssignment?.reachedMerchantAt != null ||
    orderReachedAt != null ||
    coreSt === "reached_store" ||
    currentSt === "RIDER_AT_PICKUP";

  const pickedUp =
    activeAssignment?.pickedUpAt != null ||
    (row.pickupDurationSeconds != null &&
      Number.isFinite(Number(row.pickupDurationSeconds)));

  const reachedCustomer =
    activeAssignment?.reachedCustomerAt != null || currentSt === "REACHED_CUSTOMER";
  const delivered =
    activeAssignment?.deliveredAt != null ||
    coreSt === "delivered" ||
    foodSt === "DELIVERED";

  const pickupWaitReachedAt =
    activeAssignment?.reachedMerchantAt ?? row.riderReachedPickupAt ?? null;

  return {
    atPickup: reachedMerchant && !pickedUp,
    rideStarted: pickedUp && !delivered,
    atCustomer: reachedCustomer && !delivered,
    delivered,
    pickupWaitReachedAt,
  };
}

function mapFoodRowWithStatus(
  row: FoodRowWithStatus,
  ledgerTotal?: number | null,
  riderAssignmentStatus?: string | null,
  activeAssignment?: ActiveRiderAssignmentMilestones | null
): RiderOrderSummary {
  const base = mapFoodRow(row, ledgerTotal);
  const coreSt = String(row.status ?? "accepted");
  const foodSt = String(row.foodStatus ?? "").trim().toUpperCase();
  const currentSt = String(row.currentStatus ?? "").trim().toUpperCase();
  const merchantOrderReady = isMerchantFoodOrderReady(foodSt);

  let atPickup: boolean;
  let rideStarted: boolean;
  let atCustomer: boolean;
  let status: RiderOrderSummary["status"];

  if (activeAssignment != null) {
    const workflow = resolveFoodWorkflowMilestones(
      activeAssignment,
      row,
      coreSt,
      currentSt,
      foodSt
    );
    atPickup = workflow.atPickup;
    rideStarted = workflow.rideStarted;
    atCustomer = workflow.atCustomer;

    if (workflow.delivered) {
      status = "delivered";
    } else if (
      coreSt === "cancelled" ||
      foodSt === "CANCELLED" ||
      foodSt === "RTO" ||
      currentSt === "CANCELLED"
    ) {
      status = "cancelled";
    } else if (rideStarted) {
      status = "in_transit";
    } else {
      status = "assigned";
    }
  } else {
    atPickup = coreSt === "reached_store" || currentSt === "RIDER_AT_PICKUP";
    /** Rider left restaurant with order — not merchant/dashboard "Dispatch Ready" alone. */
    const foodPickedUp =
      foodSt === "OUT_FOR_DELIVERY" ||
      currentSt === "OUT_FOR_DELIVERY" ||
      currentSt === "DISPATCHED" ||
      currentSt === "IN_TRANSIT" ||
      coreSt === "in_transit";
    atCustomer = currentSt === "REACHED_CUSTOMER";
    rideStarted =
      foodPickedUp && coreSt !== "delivered" && foodSt !== "DELIVERED";
    status = "assigned";
    if (coreSt === "delivered" || foodSt === "DELIVERED") status = "delivered";
    else if (
      coreSt === "cancelled" ||
      foodSt === "CANCELLED" ||
      foodSt === "RTO" ||
      currentSt === "CANCELLED"
    ) {
      status = "cancelled";
    } else if (rideStarted) status = "in_transit";
  }

  status = applyRiderAssignmentHistoryStatus(
    status,
    riderAssignmentStatus ?? activeAssignment?.assignmentStatus
  );

  const workflowPickupWaitReachedAt =
    activeAssignment != null
      ? resolveFoodWorkflowMilestones(activeAssignment, row, coreSt, currentSt, foodSt)
          .pickupWaitReachedAt
      : row.riderReachedPickupAt;
  const pickupWaitReachedAt = workflowPickupWaitReachedAt;
  const pickupDurationSeconds = activeAssignment
    ? activeAssignment.pickedUpAt != null
      ? row.pickupDurationSeconds
      : null
    : row.pickupDurationSeconds;
  const pickupWaitSeconds = activeAssignment
    ? activeAssignment.pickedUpAt != null
      ? row.pickupWaitSeconds
      : null
    : row.pickupWaitSeconds;
  const pickupTimerStartedAt = activeAssignment
    ? activeAssignment.pickedUpAt != null
      ? null
      : row.pickupTimerStartedAt
    : row.pickupTimerStartedAt;

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
        pickupAcknowledged: activeAssignment?.pickupAcknowledged === true,
        pickupAcknowledgedAt: toIsoOrNull(activeAssignment?.pickupAcknowledgedAt ?? null),
      },
      pickupWaitReachedAt,
      pickupWaitSeconds,
      pickupTimerStartedAt,
      pickupDurationSeconds,
      row.preparedAt
    ),
    row
  );
}

async function mapFoodRowForActiveRider(
  dbOrTx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0] | ReturnType<typeof getDb>,
  row: FoodRowWithStatus,
  riderId: number,
  orderCorePk: number,
  ledgerTotal?: number | null
): Promise<RiderOrderSummary> {
  const activeAssignment = await loadActiveRiderAssignmentMilestones(
    dbOrTx,
    orderCorePk,
    riderId
  );
  return mapFoodRowWithStatus(row, ledgerTotal, null, activeAssignment);
}

type ParcelRowWithStatus = ParcelRow & {
  status?: string | null;
  currentStatus?: string | null;
};

function mapParcelRowWithStatus(
  row: ParcelRowWithStatus,
  ledgerTotal?: number | null,
  riderAssignmentStatus?: string | null
): RiderOrderSummary {
  const base = mapParcelRow(row, ledgerTotal);
  const coreSt = String(row.status ?? "accepted");
  const currentSt = String(row.currentStatus ?? "").trim().toUpperCase();
  const atPickup = coreSt === "reached_store" || currentSt === "RIDER_AT_PICKUP";
  const rideStarted =
    coreSt === "picked_up" || coreSt === "in_transit" || currentSt === "OUT_FOR_DELIVERY";
  let status: RiderOrderSummary["status"] = "assigned";
  if (coreSt === "delivered") status = "delivered";
  else if (coreSt === "cancelled") status = "cancelled";
  else if (rideStarted) status = "in_transit";
  status = applyRiderAssignmentHistoryStatus(status, riderAssignmentStatus);
  return { ...base, atPickup, rideStarted, status };
}

type ParcelRow = {
  orderId: string | null;
  formattedOrderId: string | null;
  pickupAddressRaw: string;
  pickupAddressNormalized?: string | null;
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
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  createdAt: Date;
};

function mapParcelRow(row: ParcelRow, ledgerTotal?: number | null): RiderOrderSummary {
  const payment = resolveOrderPaymentFields(row);
  let earnings = resolveRiderOrderEarnings(row, ledgerTotal);
  const hasFrozenPayout =
    (ledgerTotal != null && ledgerTotal > 0) ||
    (Number.isFinite(Number(row.riderEarning)) && Number(row.riderEarning) > 0);
  if (!hasFrozenPayout) {
    const tipRounded = resolveCustomerTipAmount(row.tipAmount);
    earnings = {
      baseEarning: 0,
      customerTipAmount: tipRounded > 0 ? tipRounded : undefined,
      totalEarning: tipRounded,
      estimatedEarning: 0,
    };
  }
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
    estimatedEarning: earnings.estimatedEarning,
    baseEarning: earnings.baseEarning,
    customerTipAmount: earnings.customerTipAmount,
    totalEarning: earnings.totalEarning,
    createdAt: row.createdAt.toISOString(),
    formattedOrderId: row.formattedOrderId,
    paymentMethod: payment.paymentMethod,
    paymentStatus: payment.paymentStatus,
  };
}

/**
 * Rider Fare Engine v3.0: rider payout is a percentage of the customer's
 * fare, so we must read the fare directly from orders_core/orders_ride here
 * rather than deriving it from RiderOrderSummary — that type is serialized
 * verbatim to rider-facing API responses (see getAvailableOrdersForRider),
 * and must never carry the customer's fare amount.
 */
async function resolveCustomerFareForPayout(
  orderCoreId: number,
  service: "food" | "parcel" | "ride"
): Promise<number> {
  const { resolveCustomerFareForRiderPayout } = await import(
    "../../lib/build-dispatch-offer-rider-earnings.js"
  );
  return resolveCustomerFareForRiderPayout(orderCoreId, service);
}

async function applyGeoSlabRiderEarnings(
  order: RiderOrderSummary,
  ctx: { riderId: number; riderLat: number; riderLng: number; orderCoreId: number },
  rideCheckoutMetadata?: unknown
): Promise<RiderOrderSummary> {
  const service =
    order.category === "ride" ? "ride" : order.category === "parcel" ? "parcel" : "food";
  try {
    const customerFare = await resolveCustomerFareForPayout(ctx.orderCoreId, service);
    if (customerFare <= 0) return order;

    const bookingTripKm =
      service === "ride"
        ? rideTripDistanceFromCheckoutMetadata(rideCheckoutMetadata) ??
          roundRideTripDistanceKm(order.tripDistanceKm ?? order.distanceKm)
        : roundRideTripDistanceKm(order.tripDistanceKm ?? order.distanceKm);
    const rideGeo =
      service === "ride" ? rideGeoFromCheckoutMetadata(rideCheckoutMetadata) : {};

    const payout = await resolveOrderRiderPayoutBreakdown({
      service,
      customerFare,
      pickupLat: order.pickup.lat,
      pickupLng: order.pickup.lng,
      dropLat: order.delivery.lat,
      dropLng: order.delivery.lng,
      pickupKm: order.pickupDistanceKm,
      dropKm: bookingTripKm,
      riderLat: ctx.riderLat,
      riderLng: ctx.riderLng,
      riderId: ctx.riderId,
      rideCatalogCode: order.rideType,
      pincode: rideGeo.pickupPincode,
      state: rideGeo.pickupState,
    });
    if (payout == null || payout.finalAmount <= 0) return order;
    const tip = order.customerTipAmount ?? 0;
    const total = payout.finalAmount + tip;
    return {
      ...order,
      baseEarning: payout.subtotalBeforeSurge,
      waitingEarning: payout.waitingAmount > 0 ? payout.waitingAmount : undefined,
      surgeEarning: payout.surgeTotal > 0 ? payout.surgeTotal : undefined,
      appliedSurges: payout.appliedSurges.length > 0 ? payout.appliedSurges : undefined,
      estimatedEarning: total,
      totalEarning: total,
    };
  } catch (err) {
    console.warn("[dispatch] geo rider payout failed", order.id, (err as Error).message);
    return order;
  }
}

async function hydrateDispatchPoolOrder(
  entry: DispatchPoolOrderRow,
  riderLat: number,
  riderLng: number,
  riderId: number
): Promise<RiderOrderSummary | null> {
  const db = getDb();

  if (entry.serviceType === "person_ride") {
    const [row] = await db
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
        pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropAddressGeocoded: ordersCore.dropAddressGeocoded,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        distanceKm: ordersCore.distanceKm,
        checkoutMetadata: ordersCore.checkoutMetadata,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        createdAt: ordersCore.createdAt,
        rideType: ordersRide.rideType,
        estimatedFare: ordersRide.estimatedFare,
        searchExpiresAt: ordersRide.searchExpiresAt,
        customerTipAmount: ordersRide.customerTipAmount,
        higherDispatchPriority: ordersRide.higherDispatchPriority,
        ridePickupAddress: ordersRide.pickupAddress,
        rideDropAddress: ordersRide.dropAddress,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .where(eq(ordersCore.id, entry.orderCoreId))
      .limit(1);
    if (!row?.orderId) return null;
    return applyGeoSlabRiderEarnings(
      enrichOrderDistances(mapRideRow(row as RideRow), riderLat, riderLng),
      { riderId, riderLat, riderLng, orderCoreId: entry.orderCoreId },
      row.checkoutMetadata
    );
  }

  if (entry.serviceType === "food") {
    const [row] = await db
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
        alternateContactName: ordersCore.alternateContactName,
        alternateContactPhone: ordersCore.alternateContactPhone,
        deliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
        deliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
      })
      .from(ordersCore)
      .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
      .where(eq(ordersCore.id, entry.orderCoreId))
      .limit(1);
    if (!row?.orderId) return null;
    return applyGeoSlabRiderEarnings(
      enrichOrderDistances(mapFoodRow(row), riderLat, riderLng),
      { riderId, riderLat, riderLng, orderCoreId: entry.orderCoreId }
    );
  }

  const [row] = await db
    .select({
      coreId: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
      paymentMethod: ordersCore.paymentMethod,
      paymentStatus: ordersCore.paymentStatus,
      createdAt: ordersCore.createdAt,
    })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(eq(ordersCore.id, entry.orderCoreId))
    .limit(1);
  if (!row?.orderId) return null;
  return applyGeoSlabRiderEarnings(
    enrichOrderDistances(mapParcelRow(row), riderLat, riderLng),
    { riderId, riderLat, riderLng, orderCoreId: entry.orderCoreId }
  );
}

export async function getAvailableOrdersForRider(riderId: number): Promise<RiderOrderSummary[]> {
  const { isRiderSubscriptionDispatchBlocked } = await import(
    "../../lib/rider-subscription-wallet.js"
  );
  if (await isRiderSubscriptionDispatchBlocked(riderId)) {
    return [];
  }

  const pool = await listDispatchPoolOrdersForRider(riderId);
  if (pool.length === 0) return [];

  const ctx = await resolveRiderAssignmentContext(riderId, { skipAssignmentCheck: true });
  if (!ctx) return [];

  const summaries: RiderOrderSummary[] = [];
  for (const entry of pool) {
    try {
      const summary = await hydrateDispatchPoolOrder(entry, ctx.lat, ctx.lng, riderId);
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

export type RidePaymentHoldSummary = {
  orderId: string;
  formattedOrderId: string | null;
  totalEarning: number;
  passengerFare: number;
  completedAt: string;
};

/** Delivered rides where customer fare is unpaid and admin has not cleared rider hold. */
export async function getRidePaymentHoldsForRider(
  riderId: number
): Promise<RidePaymentHoldSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      grandTotal: ordersCore.grandTotal,
      riderEarning: ordersCore.riderEarning,
      billingSnapshot: ordersCore.billingSnapshot,
      customerTipAmount: ordersRide.customerTipAmount,
      actualDeliveryTime: ordersCore.actualDeliveryTime,
      updatedAt: ordersCore.updatedAt,
      paymentStatus: ordersCore.paymentStatus,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(
      and(
        eq(ordersCore.riderId, riderId),
        eq(ordersCore.orderType, "person_ride"),
        eq(ordersCore.status, "delivered"),
        isNull(ordersRide.adminRiderPaymentClearedAt)
      )
    )
    .orderBy(desc(ordersCore.updatedAt))
    .limit(5);

  return rows
    .filter((row) => row.orderId?.trim() && isRideFarePaymentPending(row.paymentStatus))
    .map((row) => {
      const snap = readRideRiderPayoutSnapshot(row.billingSnapshot);
      const tip = Math.max(0, Number(row.customerTipAmount) || 0);
      const totalEarning =
        snap?.totalEarning ?? Math.round(Number(row.riderEarning) || 0) + tip;
      const at = row.actualDeliveryTime ?? row.updatedAt;
      return {
        orderId: row.orderId!.trim(),
        formattedOrderId: row.formattedOrderId?.trim() || null,
        totalEarning,
        passengerFare: Math.round(Number(row.grandTotal) || 0),
        completedAt: (at instanceof Date ? at : new Date(at)).toISOString(),
      };
    });
}

export async function getActiveOrdersForRider(riderId: number): Promise<RiderOrderSummary[]> {
  const db = getDb();

  const [rideRows, foodRows, parcelRows] = await Promise.all([
    db
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
        pickupAddressGeocoded: ordersCore.pickupAddressGeocoded,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        dropAddressRaw: ordersCore.dropAddressRaw,
        dropAddressGeocoded: ordersCore.dropAddressGeocoded,
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
        distanceKm: ordersCore.distanceKm,
        checkoutMetadata: ordersCore.checkoutMetadata,
        riderEarning: ordersCore.riderEarning,
        fareAmount: ordersCore.fareAmount,
        grandTotal: ordersCore.grandTotal,
        createdAt: ordersCore.createdAt,
        status: ordersCore.status,
        rideType: ordersRide.rideType,
        estimatedFare: ordersRide.estimatedFare,
        searchExpiresAt: ordersRide.searchExpiresAt,
        pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
        riderReachedPickupAt: ordersRide.riderReachedPickupAt,
        pickupWaitSeconds: ordersRide.pickupWaitSeconds,
        passengerName: ordersRide.passengerName,
        passengerPhone: ordersRide.passengerPhone,
        customerTipAmount: ordersRide.customerTipAmount,
        higherDispatchPriority: ordersRide.higherDispatchPriority,
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
        coreId: ordersCore.id,
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
        customerId: ordersCore.customerId,
        alternateContactName: ordersCore.alternateContactName,
        alternateContactPhone: ordersCore.alternateContactPhone,
        deliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
        deliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
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
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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

  const foodCustomerIds = foodRows
    .map((r) => Number((r as { customerId?: unknown }).customerId))
    .filter((id) => Number.isFinite(id) && id > 0);
  let ratingByCustomer = new Map<number, number>();
  if (foodCustomerIds.length > 0) {
    const { loadCustomerAverageRatingsMap } = await import(
      "../../lib/customer-average-rating-for-rider.js"
    );
    ratingByCustomer = await loadCustomerAverageRatingsMap(foodCustomerIds);
  }

  const foodCoreIds = foodRows
    .map((r) => Number((r as { coreId?: unknown }).coreId))
    .filter((id) => Number.isFinite(id) && id > 0);
  const foodAssignmentMap = await loadActiveRiderAssignmentMilestonesForRider(
    db,
    riderId,
    foodCoreIds
  );

  const rideSummaries = await Promise.all(
    rideRows
      .filter((r) => r.orderId)
      .map((r) =>
        enrichRideOrderSummary(
          mapRideRowWithStatus(r as RideRow & { status?: string | null }, r.status),
          r
        )
      )
  );

  const summaries: RiderOrderSummary[] = [
    ...rideSummaries,
    ...foodRows.filter((r) => r.orderId).map((r) => {
      const coreId = Number((r as { coreId?: unknown }).coreId);
      const activeAssignment =
        Number.isFinite(coreId) && coreId > 0
          ? (foodAssignmentMap.get(coreId) ?? null)
          : null;
      const summary = mapFoodRowWithStatus(r, undefined, null, activeAssignment);
      const customerId = Number((r as { customerId?: unknown }).customerId);
      const rating = customerId > 0 ? ratingByCustomer.get(customerId) : undefined;
      return rating != null ? { ...summary, customerRating: rating } : summary;
    }),
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

function sqlRiderAssignmentEndedForHistory(riderId: number) {
  return sql`(
    EXISTS (
      SELECT 1
      FROM order_rider_assignments ora
      WHERE ora.order_core_id = ${ordersCore.id}
        AND ora.rider_id = ${riderId}
        AND (
          ora.assignment_status IN ('cancelled', 'unassigned')
          OR ora.cancelled_at IS NOT NULL
          OR ora.unassigned_at IS NOT NULL
          OR (ora.assignment_status = 'rejected' AND ora.accepted_at IS NOT NULL)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM order_rider_ride_unassignments uru
      WHERE uru.order_core_id = ${ordersCore.id}
        AND uru.rider_id = ${riderId}
    )
  )`;
}

function sqlRiderAssignmentStatusForHistory(riderId: number) {
  return sql<string | null>`(
    SELECT ora.assignment_status::text
    FROM order_rider_assignments ora
    WHERE ora.order_core_id = ${ordersCore.id}
      AND ora.rider_id = ${riderId}
    ORDER BY ora.updated_at DESC, ora.id DESC
    LIMIT 1
  )`.as("rider_assignment_status");
}

function applyRiderAssignmentHistoryStatus(
  status: RiderOrderSummary["status"],
  riderAssignmentStatus?: string | null,
  riderRideUnassigned?: boolean
): RiderOrderSummary["status"] {
  if (status === "delivered") return status;
  if (riderRideUnassigned) return "cancelled";
  const assignSt = String(riderAssignmentStatus ?? "")
    .trim()
    .toLowerCase();
  if (assignSt === "cancelled" || assignSt === "unassigned" || assignSt === "rejected") {
    return "cancelled";
  }
  return status;
}

async function attachRiderOrderCancellationPenalty(
  summary: RiderOrderSummary,
  orderCorePk: number,
  riderId: number
): Promise<RiderOrderSummary> {
  if (summary.status !== "cancelled") return summary;
  try {
    const db = getDb();
    const ocrRows = await db.execute<{
      penalty_applied: boolean | null;
      penalty_amount: string | null;
    }>(sql`
      SELECT penalty_applied, penalty_amount::text
      FROM order_cancellation_reasons
      WHERE order_id = ${orderCorePk}
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const ocr = (ocrRows as { penalty_applied: boolean | null; penalty_amount: string | null }[])[0];
    const fromReason =
      ocr?.penalty_amount != null && Number.isFinite(Number(ocr.penalty_amount))
        ? Number(ocr.penalty_amount)
        : null;
    if (fromReason != null && fromReason > 0) {
      return {
        ...summary,
        cancellationPenaltyApplied: true,
        cancellationPenaltyAmount: fromReason,
      };
    }

    const ledgerRows = await db.execute<{ total: string | null }>(sql`
      SELECT COALESCE(SUM(amount), 0)::text AS total
      FROM wallet_ledger
      WHERE rider_id = ${riderId}
        AND direction = 'DEBIT'
        AND ref LIKE ${`rider_cancel_pen:${orderCorePk}:%`}
    `);
    const ledgerTotal = Number((ledgerRows as { total: string | null }[])[0]?.total ?? 0);
    if (Number.isFinite(ledgerTotal) && ledgerTotal > 0) {
      return {
        ...summary,
        cancellationPenaltyApplied: true,
        cancellationPenaltyAmount: ledgerTotal,
      };
    }

    if (ocr?.penalty_applied === true) {
      return { ...summary, cancellationPenaltyApplied: true, cancellationPenaltyAmount: null };
    }
  } catch {
    /* optional tables */
  }
  return summary;
}

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
    eq(ordersCore.orderType, "person_ride"),
    or(
      and(
        eq(ordersCore.riderId, riderId),
        or(
          inArray(ordersCore.status, [...HISTORY_CORE_TERMINAL]),
          sql`${ordersRide.cancelledAt} IS NOT NULL`
        )
      ),
      sqlRiderAssignmentEndedForHistory(riderId)
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
      coreId: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
      adminRiderPaymentClearedAt: ordersRide.adminRiderPaymentClearedAt,
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
      riderAssignmentStatus: sqlRiderAssignmentStatusForHistory(riderId),
      riderRideUnassigned: sql<boolean>`EXISTS (
        SELECT 1
        FROM order_rider_ride_unassignments uru
        WHERE uru.order_core_id = ${ordersCore.id}
          AND uru.rider_id = ${riderId}
      )`.as("rider_ride_unassigned"),
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .leftJoin(customers, eq(ordersCore.customerId, customers.id))
    .where(historyWhere)
    .orderBy(desc(ordersCore.updatedAt))
    .limit(limit)
    .offset(offset);

  const coreIds = rideRows
    .map((r) => Number((r as { coreId?: unknown }).coreId))
    .filter((id) => Number.isFinite(id) && id > 0);
  const ledgerMap = await fetchLedgerEarningsByCoreIds(riderId, coreIds);

  const orders = rideRows
    .filter((r) => r.orderId)
    .map((r) =>
      mapRideRowWithStatus(
        {
          ...r,
          customerTipAmount: r.tipAmount,
          ridePickupAddress: r.ridePickupAddress,
          rideDropAddress: r.rideDropAddress,
          billingSnapshot: r.billingSnapshot,
          paymentMethod: r.paymentMethod,
          paymentStatus: r.paymentStatus,
          adminRiderPaymentClearedAt: r.adminRiderPaymentClearedAt,
        } as RideRow & {
          status?: string | null;
          pickupOtpVerifiedAt?: Date | null;
          currentStatus?: string | null;
        },
        r.status,
        r.currentStatus,
        ledgerMap.get(Number((r as { coreId?: unknown }).coreId)) ?? null,
        (r as { riderAssignmentStatus?: string | null }).riderAssignmentStatus,
        (r as { riderRideUnassigned?: boolean }).riderRideUnassigned === true
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
    eq(ordersCore.orderType, "food"),
    or(
      and(
        eq(ordersCore.riderId, riderId),
        or(
          inArray(ordersCore.status, [...HISTORY_CORE_TERMINAL]),
          inArray(ordersFood.orderStatus, [...HISTORY_FOOD_TERMINAL]),
          sql`${ordersFood.cancelledAt} IS NOT NULL`
        )
      ),
      sqlRiderAssignmentEndedForHistory(riderId)
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
      coreId: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
      restaurantName: ordersFood.restaurantName,
      foodItemsCount: ordersFood.foodItemsCount,
      customerName: ordersFood.customerName,
      customerPhone: ordersFood.customerPhone,
      alternateContactName: ordersCore.alternateContactName,
      alternateContactPhone: ordersCore.alternateContactPhone,
      deliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
      deliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
      riderAssignmentStatus: sqlRiderAssignmentStatusForHistory(riderId),
    })
    .from(ordersCore)
    .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(historyWhere)
    .orderBy(desc(ordersCore.updatedAt))
    .limit(limit)
    .offset(offset);

  const foodCoreIds = foodRows
    .map((r) => Number((r as { coreId?: unknown }).coreId))
    .filter((id) => Number.isFinite(id) && id > 0);
  const foodLedgerMap = await fetchLedgerEarningsByCoreIds(riderId, foodCoreIds);

  const orders = foodRows
    .filter((r) => r.orderId)
    .map((r) =>
      mapFoodRowWithStatus(
        r as FoodRowWithStatus,
        foodLedgerMap.get(Number((r as { coreId?: unknown }).coreId)) ?? null,
        (r as { riderAssignmentStatus?: string | null }).riderAssignmentStatus
      )
    );

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
    eq(ordersCore.orderType, "parcel"),
    or(
      and(
        eq(ordersCore.riderId, riderId),
        inArray(ordersCore.status, [...HISTORY_CORE_TERMINAL])
      ),
      sqlRiderAssignmentEndedForHistory(riderId)
    )
  );

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(historyWhere);

  const total = Number(countRow?.count ?? 0);

  const parcelRows = await db
    .select({
      coreId: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
      paymentMethod: ordersCore.paymentMethod,
      paymentStatus: ordersCore.paymentStatus,
      createdAt: ordersCore.createdAt,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      riderAssignmentStatus: sqlRiderAssignmentStatusForHistory(riderId),
    })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(historyWhere)
    .orderBy(desc(ordersCore.updatedAt))
    .limit(limit)
    .offset(offset);

  const parcelCoreIds = parcelRows
    .map((r) => Number((r as { coreId?: unknown }).coreId))
    .filter((id) => Number.isFinite(id) && id > 0);
  const parcelLedgerMap = await fetchLedgerEarningsByCoreIds(riderId, parcelCoreIds);

  const orders = parcelRows
    .filter((r) => r.orderId)
    .map((r) =>
      mapParcelRowWithStatus(
        r as ParcelRowWithStatus,
        parcelLedgerMap.get(Number((r as { coreId?: unknown }).coreId)) ?? null,
        (r as { riderAssignmentStatus?: string | null }).riderAssignmentStatus
      )
    );

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
      coreId: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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

/** Idempotent accept fallback when the rider owns the food order but it is briefly missing from actives. */
async function loadOwnedFoodSummaryForRider(
  riderId: number,
  orderCorePk: number
): Promise<RiderOrderSummary | null> {
  const db = getDb();
  const [row] = await db
    .select({
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
      alternateContactName: ordersCore.alternateContactName,
      alternateContactPhone: ordersCore.alternateContactPhone,
      deliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
      deliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
    })
    .from(ordersCore)
    .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(and(eq(ordersCore.id, orderCorePk), eq(ordersCore.riderId, riderId)))
    .limit(1);

  if (!row?.orderId) return null;
  return mapFoodRowForActiveRider(db, row, riderId, orderCorePk);
}

async function loadOwnedParcelSummaryForRider(
  riderId: number,
  orderRef: string
): Promise<RiderOrderSummary | null> {
  const db = getDb();
  const [row] = await db
    .select({
      coreId: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
        eq(ordersCore.orderType, "parcel"),
        eq(ordersCore.riderId, riderId)
      )
    )
    .limit(1);

  if (!row?.orderId || row.coreId == null) return null;
  return mapParcelRowWithStatus(row, null, null);
}

export async function acceptOrderForRider(
  riderId: number,
  orderRef: string
): Promise<RiderOrderSummary> {
  const { isRiderSubscriptionDispatchBlocked } = await import(
    "../../lib/rider-subscription-wallet.js"
  );
  if (await isRiderSubscriptionDispatchBlocked(riderId)) {
    throw Object.assign(new Error("Subscription dues pending — clear outstanding balance to accept orders"), {
      statusCode: 403,
      code: "subscription_dispatch_blocked",
    });
  }

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

  // Idempotent re-accept (retry after timeout) — do not 409 the winner.
  const [alreadyOwned] = await db
    .select({ id: ordersCore.id, orderId: ordersCore.orderId })
    .from(ordersCore)
    .where(
      and(
        orderRefWhere(orderRef),
        eq(ordersCore.orderType, "food"),
        eq(ordersCore.riderId, riderId)
      )
    )
    .limit(1);
  if (alreadyOwned?.id) {
    const actives = await getActiveOrdersForRider(riderId);
    const hit = actives.find(
      (o) =>
        o.id === alreadyOwned.orderId?.trim() ||
        o.id === orderRef.trim() ||
        o.formattedOrderId?.trim() === orderRef.trim()
    );
    if (hit) return hit;
    // Owned but temporarily absent from actives list (e.g. status race) — never 409 the owner.
    const ownedSummary = await loadOwnedFoodSummaryForRider(riderId, alreadyOwned.id);
    if (ownedSummary) return { ...ownedSummary, status: "assigned" };
  }

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
    // Claim FIRST — conditional UPDATE is the atomic lock (no unlocked re-select race window).
    const currentFoodStatus = String(foodStatusAtAccept).trim().toUpperCase();
    const readyNow = currentFoodStatus === "READY_FOR_PICKUP";
    const nextCoreStatus = readyNow ? "OUT_FOR_DELIVERY" : "RIDER_ASSIGNED";
    const nextFoodStatus = readyNow ? "OUT_FOR_DELIVERY" : currentFoodStatus;

    const [updated] = await tx
      .update(ordersCore)
      .set({
        riderId,
        status: "accepted",
        currentStatus: readyNow ? "RIDER_ASSIGNED" : nextCoreStatus,
        actualPickupTime: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(ordersCore.id, preCheck.id),
          isNull(ordersCore.riderId),
          eq(ordersCore.orderType, "food")
        )
      )
      .returning({ id: ordersCore.id, orderId: ordersCore.orderId });

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
        riderReachedPickupAt: null,
        pickupDurationSeconds: null,
        pickupTimerStartedAt: null,
        pickupWaitSeconds: null,
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

    const orderIdText = (updated.orderId ?? preCheck.orderId ?? "").trim();
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
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
        alternateContactName: ordersCore.alternateContactName,
        alternateContactPhone: ordersCore.alternateContactPhone,
        deliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
        deliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
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

  await recordPendingDispatchOffersMissed({
    orderCoreId: preCheck.id,
    excludeRiderId: riderId,
    reason: "order_accepted_by_other_rider",
    missSource: "dispatch_accept",
    occurredAt: now,
  }).catch((err) => {
    console.warn("[acceptFoodOrderForRider] missed-offer audit failed:", err);
  });

  void (async () => {
    try {
      const ctx = await resolveRiderAssignmentContext(riderId, { skipAssignmentCheck: true });
      if (!ctx) {
        await persistFoodRiderAcceptPayoutSnapshot(preCheck.id, riderId);
        return;
      }
      const withDistances = await attachRiderOrderDistanceBreakdown(
        riderId,
        preCheck.id,
        accepted
      );
      const withEarnings = await applyGeoSlabRiderEarnings(withDistances, {
        riderId,
        riderLat: ctx.lat,
        riderLng: ctx.lng,
        orderCoreId: preCheck.id,
      });
      await persistRideRiderPayoutFromSummary(preCheck.id, {
        baseEarning: withEarnings.baseEarning,
        waitingEarning: withEarnings.waitingEarning,
        surgeEarning: withEarnings.surgeEarning,
        appliedSurges: withEarnings.appliedSurges,
        totalEarning: withEarnings.totalEarning,
        estimatedEarning: withEarnings.estimatedEarning,
        customerTipAmount: withEarnings.customerTipAmount,
        pickupDistanceKm: withEarnings.pickupDistanceKm,
        tripDistanceKm: withEarnings.tripDistanceKm,
        totalDistanceKm: withEarnings.totalDistanceKm,
      });
    } catch (err) {
      console.warn("[acceptFoodOrderForRider] payout snapshot failed:", err);
      await persistFoodRiderAcceptPayoutSnapshot(preCheck.id, riderId).catch(() => {});
    }
  })();

  noteRiderOrderLocationMilestone(riderId, accepted.id, "accepted");

  void (async () => {
    const riderName = String(riderProfile?.name ?? "").trim() || "Your rider";
    const merchantName = String(accepted.merchantName ?? "").trim() || null;
    if (foodStatusAtAccept === "READY_FOR_PICKUP") {
      await notifyCustomerFoodLifecycle({
        orderIdText,
        templateCode: "ORDER_OUT_FOR_DELIVERY",
        riderId,
        riderName,
        merchantName,
      });
    } else {
      await notifyCustomerFoodLifecycle({
        orderIdText,
        templateCode: "ORDER_RIDER_ASSIGNED",
        riderId,
        riderName,
        merchantName,
      });
    }
  })();

  return { ...accepted, status: "assigned" };
}

async function acceptParcelOrderForRider(
  riderId: number,
  orderRef: string
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();

  // Idempotent re-accept (retry after timeout / flaky network) — do not 409 the winner.
  const alreadyOwned = await loadOwnedParcelSummaryForRider(riderId, orderRef);
  if (alreadyOwned) {
    return { ...alreadyOwned, status: "assigned" };
  }

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
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
    metadata: { serviceType: "parcel" },
    occurredAt: now,
  });
  await recordPendingDispatchOffersMissed({
    orderCoreId: preCheck.id,
    excludeRiderId: riderId,
    reason: "order_accepted_by_other_rider",
    missSource: "dispatch_accept",
    occurredAt: now,
  }).catch((err) => {
    console.warn("[acceptParcelOrderForRider] missed-offer audit failed:", err);
  });

  await completeOrderDispatch(preCheck.id, "accepted");
  noteRiderOrderLocationMilestone(riderId, accepted.id, "accepted");
  void notifyCustomerParcelLifecycle({
    orderIdText,
    templateCode: "PARCEL_RIDER_ON_THE_WAY",
    riderId,
  });
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

  const [riderProfile] = await db
    .select({ name: riders.name, mobile: riders.mobile })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);

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
        riderName: riderProfile?.name ?? null,
        riderMobile: riderProfile?.mobile ?? null,
      });
    }

    const [row] = await tx
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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

  const orderIdText = accepted.id?.trim() || orderRef.trim();
  await recordDispatchAssignmentAudit({
    orderCoreId: preCheck.id,
    orderId: orderIdText,
    riderId,
    eventType: "accepted",
    acceptedAt: now,
    responseReceivedAt: now,
    actorType: "rider",
    actorId: String(riderId),
    metadata: { serviceType: "person_ride" },
    occurredAt: now,
  });
  await recordPendingDispatchOffersMissed({
    orderCoreId: preCheck.id,
    excludeRiderId: riderId,
    reason: "order_accepted_by_other_rider",
    missSource: "dispatch_accept",
    occurredAt: now,
  }).catch((err) => {
    console.warn("[acceptRideOrderForRider] missed-offer audit failed:", err);
  });

  await completeOrderDispatch(preCheck.id, "accepted");

  const { notifyCustomerRideCaptainOnTheWay } = await import(
    "../../lib/customer-ride-captain-notify.js"
  );
  void notifyCustomerRideCaptainOnTheWay(preCheck.id, orderIdText, riderId);

  void (async () => {
    try {
      const ctx = await resolveRiderAssignmentContext(riderId, { skipAssignmentCheck: true });
      if (!ctx) {
        await persistRideRiderAcceptPayoutSnapshot(preCheck.id, riderId);
        return;
      }
      const [metaRow] = await db
        .select({ checkoutMetadata: ordersCore.checkoutMetadata })
        .from(ordersCore)
        .where(eq(ordersCore.id, preCheck.id))
        .limit(1);
      const withDistances = await attachRiderOrderDistanceBreakdown(
        riderId,
        preCheck.id,
        accepted
      );
      const withEarnings = await applyGeoSlabRiderEarnings(
        withDistances,
        { riderId, riderLat: ctx.lat, riderLng: ctx.lng, orderCoreId: preCheck.id },
        metaRow?.checkoutMetadata
      );
      await persistRideRiderPayoutFromSummary(preCheck.id, {
        baseEarning: withEarnings.baseEarning,
        waitingEarning: withEarnings.waitingEarning,
        surgeEarning: withEarnings.surgeEarning,
        appliedSurges: withEarnings.appliedSurges,
        totalEarning: withEarnings.totalEarning,
        estimatedEarning: withEarnings.estimatedEarning,
        customerTipAmount: withEarnings.customerTipAmount,
        pickupDistanceKm: withEarnings.pickupDistanceKm,
        tripDistanceKm: withEarnings.tripDistanceKm,
        totalDistanceKm: withEarnings.totalDistanceKm,
      });
    } catch (err) {
      console.warn("[acceptRideOrderForRider] payout snapshot failed:", err);
      await persistRideRiderAcceptPayoutSnapshot(preCheck.id, riderId).catch(() => {});
    }
  })();

  noteRiderOrderLocationMilestone(riderId, accepted.id, "accepted");
  return { ...accepted, status: "assigned" };
}

/** Rider did not accept before offer timer expired (or dismissed incoming modal). */
export async function missOrderOfferForRider(
  riderId: number,
  orderRef: string,
  input?: { reason?: string | null }
): Promise<{ ok: true; recorded: boolean }> {
  const now = new Date();
  const reason = input?.reason?.trim() || "timer_expired";

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

  if (row.riderId != null && Number(row.riderId) !== riderId) {
    return { ok: true, recorded: false };
  }

  if (row.riderId != null && Number(row.riderId) === riderId) {
    return { ok: true, recorded: false };
  }

  const pending = await listPendingDispatchOffersForOrder(row.id, null);
  const mine = pending.filter((p) => p.rider_id === riderId);
  if (mine.length === 0) {
    return { ok: true, recorded: false };
  }

  for (const offer of mine) {
    await recordDispatchAssignmentAudit({
      orderCoreId: row.id,
      orderId: offer.order_id,
      riderId,
      eventType: "timeout",
      assignmentAttemptNumber: offer.assignment_attempt_number,
      dispatchSessionId: offer.dispatch_session_id,
      waveNumber: offer.wave_number,
      timeoutAt: now,
      responseReceivedAt: now,
      actorType: "rider",
      actorId: String(riderId),
      metadata: {
        missReason: reason,
        serviceType: row.orderType ?? offer.metadata?.serviceType ?? null,
      },
      occurredAt: now,
    });
  }

  return { ok: true, recorded: true };
}

export async function rejectOrderForRider(
  riderId: number,
  orderRef: string,
  input: { reasonCode: string; reasonText?: string | null }
): Promise<{ ok: true; penaltyApplied?: boolean; penaltyAmount?: number }> {
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
  currentStatusRaw?: string | null,
  ledgerTotal?: number | null,
  riderAssignmentStatus?: string | null,
  riderRideUnassigned?: boolean
): RiderOrderSummary {
  const base = mapRideRow(row, ledgerTotal);
  const st = String(dbStatus ?? "accepted");
  const currentSt = String(currentStatusRaw ?? row.currentStatus ?? "").trim().toUpperCase();
  const rideStarted = st === "picked_up" || st === "in_transit" || st === "delivered";
  const pickupOtpVerified = row.pickupOtpVerifiedAt != null;
  const atPickup =
    pickupOtpVerified &&
    !rideStarted &&
    (st === PERSON_RIDE_AT_USER_STATUS || currentSt === "RIDER_AT_PICKUP");
  const atCustomer = currentSt === "REACHED_CUSTOMER";
  let status: RiderOrderSummary["status"] =
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
              : ("assigned" as const);
  status = applyRiderAssignmentHistoryStatus(
    status,
    riderAssignmentStatus,
    riderRideUnassigned
  );
  return maskRideEarningsIfWalletCreditPending(
    {
      ...base,
      atPickup,
      pickupOtpVerified,
      rideStarted,
      atCustomer,
      status,
    },
    ledgerTotal
  );
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
      pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
      customerId: ordersCore.customerId,
      alternateContactName: ordersCore.alternateContactName,
      alternateContactPhone: ordersCore.alternateContactPhone,
      deliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
      deliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
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

  const ledgerTotal = await fetchLedgerEarningForCoreId(riderId, row.coreId);
  const activeAssignment = await loadActiveRiderAssignmentMilestones(db, row.coreId, riderId);
  const summary = mapFoodRowWithStatus(row, ledgerTotal, null, activeAssignment);
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
  let customerRating: number | null = null;
  const customerId = Number((row as { customerId?: unknown }).customerId);
  if (Number.isFinite(customerId) && customerId > 0) {
    const { getCustomerAverageRatingByCustomerId } = await import(
      "../../lib/customer-average-rating-for-rider.js"
    );
    customerRating = await getCustomerAverageRatingByCustomerId(customerId);
  }
  return attachRiderOrderCancellationPenalty(
    await attachRiderOrderDistanceBreakdown(riderId, row.coreId, {
      ...summary,
      foodItems,
      deliveryInstructions: row.deliveryInstructions?.trim() || null,
      requiresUtensils: row.requiresUtensils === true,
      restaurantPhone: row.restaurantPhone?.trim() || null,
      merchantFeedbackSubmitted,
      customerFeedbackSubmitted,
      customerRating,
    }),
    row.coreId,
    riderId
  );
}

export async function getParcelOrderForRider(
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
      pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
      paymentMethod: ordersCore.paymentMethod,
      paymentStatus: ordersCore.paymentStatus,
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

  const ledgerTotal = await fetchLedgerEarningForCoreId(riderId, row.coreId);
  return attachRiderOrderDistanceBreakdown(
    riderId,
    row.coreId,
    mapParcelRowWithStatus(row, ledgerTotal)
  );
}

export async function getRideOrderForRider(
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
      pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
      riderReachedPickupAt: ordersRide.riderReachedPickupAt,
      pickupWaitSeconds: ordersRide.pickupWaitSeconds,
      checkoutMetadata: ordersCore.checkoutMetadata,
      billingSnapshot: ordersCore.billingSnapshot,
      acceptPayoutSnapshot: ordersRide.acceptPayoutSnapshot,
      paymentMethod: ordersCore.paymentMethod,
      paymentStatus: ordersCore.paymentStatus,
      tipAmount: ordersCore.tipAmount,
      adminRiderPaymentClearedAt: ordersRide.adminRiderPaymentClearedAt,
      customerTipAmount: ordersRide.customerTipAmount,
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

  if (
    row.status === "delivered" &&
    isRideFarePaymentPending(row.paymentStatus) &&
    row.pickupWaitSeconds != null &&
    Number(row.pickupWaitSeconds) > 0
  ) {
    await ensureRidePickupWaitingBillingReconciled(row.coreId, riderId);
    const [refreshed] = await db
      .select({
        billingSnapshot: ordersCore.billingSnapshot,
        acceptPayoutSnapshot: ordersRide.acceptPayoutSnapshot,
        grandTotal: ordersCore.grandTotal,
        riderEarning: ordersCore.riderEarning,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .where(eq(ordersCore.id, row.coreId))
      .limit(1);
    if (refreshed) {
      row.billingSnapshot = refreshed.billingSnapshot;
      row.acceptPayoutSnapshot = refreshed.acceptPayoutSnapshot;
      row.grandTotal = refreshed.grandTotal;
      row.riderEarning = refreshed.riderEarning;
    }
  }

  const ledgerTotal = await fetchLedgerEarningForCoreId(riderId, row.coreId);
  const withDistances = await attachRiderOrderDistanceBreakdown(
    riderId,
    row.coreId,
    mapRideRowWithStatus(row, row.status, row.currentStatus, ledgerTotal)
  );
  const enriched = await enrichRideOrderSummary(withDistances, row);
  const passengerRating = await loadPassengerRatingForOrder(db, row.coreId);
  const withRating =
    passengerRating != null ? { ...enriched, passengerRating } : enriched;
  return attachRiderOrderCancellationPenalty(withRating, row.coreId, riderId);
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
  if (meta?.orderType === "parcel") {
    // Parcel pickup OTP uses core pickup_otp when present; otherwise mark picked up.
    const db = getDb();
    const [row] = await db
      .select({ pickupOtp: ordersCore.pickupOtp })
      .from(ordersCore)
      .where(and(orderRefWhere(orderRef), eq(ordersCore.orderType, "parcel"), eq(ordersCore.riderId, riderId)))
      .limit(1);
    const expected = String(row?.pickupOtp ?? "").trim();
    if (expected) {
      const got = String(otpInput ?? "").trim().replace(/\D/g, "");
      if (expected !== got) {
        throw Object.assign(new Error("Incorrect pickup OTP"), { statusCode: 403 });
      }
    }
    return markParcelPickedUpForRider(riderId, orderRef, gps);
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
        riderReachedPickupAt: ordersRide.riderReachedPickupAt,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .where(
        and(
          orderRefWhere(orderRef),
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "person_ride"),
          inArray(ordersCore.status, [...PERSON_RIDE_PRE_PICKUP_OTP_STATUSES]),
          isNull(ordersRide.pickupOtpVerifiedAt),
          isNotNull(ordersRide.riderReachedPickupAt)
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

    const waitSeconds = computeRidePickupWaitSeconds(
      existing.riderReachedPickupAt!,
      now
    );

    await tx
      .update(ordersRide)
      .set({
        pickupOtpVerifiedAt: now,
        pickupWaitSeconds: waitSeconds,
        updatedAt: now,
      })
      .where(eq(ordersRide.orderId, existing.id));

    const orderIdText = existing.orderId.trim();
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
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
    return { corePk: existing.id, summary: mapRideRowWithStatus(full, full.status, full.currentStatus) };
  });

  try {
    await applyRidePickupWaitingToBilling(updated.corePk, riderId);
  } catch (err) {
    console.warn("[verifyPickupOtpForRider] waiting billing update failed:", err);
  }

  void notifyCustomerRideLifecycle({
    orderIdText: orderRef.trim(),
    templateCode: "RIDE_RIDER_ARRIVED",
    riderId,
  });

  return getRideOrderForRider(riderId, orderRef);
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
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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

  noteRiderOrderLocationMilestone(riderId, updated.id, "picked_up", gps);
  void notifyCustomerRideLifecycle({
    orderIdText: updated.id,
    templateCode: "RIDE_TRIP_STARTED",
    riderId,
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
  if (meta?.orderType === "parcel") {
    return markReachedParcelPickupForRider(riderId, orderRef, gps);
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        status: ordersCore.status,
        riderReachedPickupAt: ordersRide.riderReachedPickupAt,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .where(
        and(
          orderRefWhere(orderRef),
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "person_ride"),
          eq(ordersCore.status, "accepted")
        )
      )
      .limit(1);

    if (!existing?.id || !existing.orderId) {
      throw Object.assign(new Error("Ride not in accepted state"), { statusCode: 409 });
    }

    if (existing.riderReachedPickupAt) {
      return;
    }

    await assertRiderMilestoneGeoFence({
      riderId,
      orderCorePk: existing.id,
      serviceType: "person_ride",
      milestoneKey: "reach_pickup",
      gps,
    });
    await assertRiderMilestoneGeoFence({
      riderId,
      orderCorePk: existing.id,
      serviceType: "person_ride",
      milestoneKey: "pickup_confirmation",
      gps,
    });

    const orderIdText = existing.orderId.trim();
    await recordRideRiderReachedPickup(tx, {
      orderCorePk: existing.id,
      orderIdText,
      riderId,
      occurredAt: now,
    });

    const distance = await riderDistanceAtMilestone(riderId, existing.id, gps);
    try {
      await recordRiderAssignmentMilestone(tx, {
        orderCorePk: existing.id,
        orderIdText,
        riderId,
        eventType: "reached_merchant",
        occurredAt: now,
        distance,
        statusMessage: "Reached pickup — waiting for passenger OTP",
      });
    } catch (milestoneErr) {
      console.warn("[markReachedPickupForRider] milestone recording failed:", milestoneErr);
    }

    await appendOrderTimeline(tx, {
      orderCorePk: existing.id,
      status: "RIDER_WAITING_FOR_OTP",
      previousStatus: String(existing.status ?? "accepted"),
      actorType: "rider",
      actorId: riderId,
      statusMessage: "Captain reached pickup — waiting for passenger OTP",
      occurredAt: now,
      metadata: { riderReachedPickupAt: now.toISOString() },
    });
  });

  noteRiderOrderLocationMilestone(riderId, orderRef, "reached_store", gps);
  void notifyCustomerRideLifecycle({
    orderIdText: orderRef.trim(),
    templateCode: "RIDE_RIDER_NEARBY",
    riderId,
  });
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
      pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
      alternateContactName: ordersCore.alternateContactName,
      alternateContactPhone: ordersCore.alternateContactPhone,
      deliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
      deliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
    })
    .from(ordersCore)
    .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);

  return full?.orderId ? (full as FoodRowWithStatus) : null;
}

async function markReachedParcelPickupForRider(
  riderId: number,
  orderRef: string,
  gps?: RiderGpsPayload
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();
  let newlyReached = false;
  let orderIdText = "";

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
      })
      .from(ordersCore)
      .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
      .where(
        and(
          orderRefWhere(orderRef),
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "parcel"),
          notInArray(ordersCore.status, ["delivered", "cancelled", "failed"])
        )
      )
      .limit(1);

    if (!existing?.id || !existing.orderId) {
      throw Object.assign(new Error("Parcel order not found"), { statusCode: 404 });
    }
    orderIdText = existing.orderId.trim();

    const activeAssignment = await loadActiveRiderAssignmentMilestones(tx, existing.id, riderId);
    if (activeAssignment?.pickedUpAt) {
      throw Object.assign(new Error("Parcel already picked up"), { statusCode: 409 });
    }
    const curSt = String(existing.currentStatus ?? "").trim().toUpperCase();
    const alreadyAtPickup =
      activeAssignment?.reachedMerchantAt != null ||
      existing.status === "reached_store" ||
      curSt === "RIDER_AT_PICKUP";
    if (alreadyAtPickup) return;

    await assertRiderMilestoneGeoFence({
      riderId,
      orderCorePk: existing.id,
      serviceType: "parcel",
      milestoneKey: "reach_pickup",
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
      throw Object.assign(new Error("Could not update parcel order"), { statusCode: 409 });
    }

    const distance = await riderDistanceAtMilestone(riderId, row.id, gps);
    await recordRiderAssignmentMilestone(tx, {
      orderCorePk: row.id,
      orderIdText,
      riderId,
      eventType: "reached_merchant",
      occurredAt: now,
      distance,
      statusMessage: "Reached Parcel Pickup",
    });
    newlyReached = true;
  });

  if (newlyReached && orderIdText) {
    void publishOrderEvent(orderIdText, {
      type: "status_changed",
      status: "RIDER_AT_PICKUP",
      orderId: orderIdText,
      riderId,
    }).catch(() => {});
    noteRiderOrderLocationMilestone(riderId, orderIdText, "reached_store", gps);
  }

  return getParcelOrderForRider(riderId, orderRef);
}

async function markParcelPickedUpForRider(
  riderId: number,
  orderRef: string,
  gps?: RiderGpsPayload
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();
  let orderIdText = "";
  let newlyPicked = false;

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
      })
      .from(ordersCore)
      .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
      .where(
        and(
          orderRefWhere(orderRef),
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "parcel"),
          notInArray(ordersCore.status, ["delivered", "cancelled", "failed"])
        )
      )
      .limit(1);

    if (!existing?.id || !existing.orderId) {
      throw Object.assign(new Error("Parcel order not found"), { statusCode: 404 });
    }
    orderIdText = existing.orderId.trim();

    const activeAssignment = await loadActiveRiderAssignmentMilestones(tx, existing.id, riderId);
    if (activeAssignment?.pickedUpAt) {
      return;
    }

    await assertRiderMilestoneGeoFence({
      riderId,
      orderCorePk: existing.id,
      serviceType: "parcel",
      milestoneKey: "pickup_confirmation",
      gps,
    });

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
      throw Object.assign(new Error("Could not mark parcel picked up"), { statusCode: 409 });
    }

    const distance = await riderDistanceAtMilestone(riderId, row.id, gps);
    await recordRiderAssignmentMilestone(tx, {
      orderCorePk: row.id,
      orderIdText,
      riderId,
      eventType: "picked_up",
      occurredAt: now,
      distance,
      statusMessage: "Parcel Picked Up",
    });
    newlyPicked = true;
  });

  if (newlyPicked && orderIdText) {
    void notifyCustomerParcelLifecycle({
      orderIdText,
      templateCode: "PARCEL_PICKED_UP",
      riderId,
    });
    void publishOrderEvent(orderIdText, {
      type: "status_changed",
      status: "OUT_FOR_DELIVERY",
      orderId: orderIdText,
      riderId,
    }).catch(() => {});
    noteRiderOrderLocationMilestone(riderId, orderIdText, "picked_up", gps);
  }

  return getParcelOrderForRider(riderId, orderRef);
}

async function markReachedParcelCustomerForRider(
  riderId: number,
  orderRef: string,
  gps?: RiderGpsPayload
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();
  let orderIdText = "";
  let newlyReached = false;

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
      })
      .from(ordersCore)
      .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
      .where(
        and(
          orderRefWhere(orderRef),
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "parcel"),
          notInArray(ordersCore.status, ["delivered", "cancelled", "failed"])
        )
      )
      .limit(1);

    if (!existing?.id || !existing.orderId) {
      throw Object.assign(new Error("Parcel not ready for drop arrival"), { statusCode: 409 });
    }
    orderIdText = existing.orderId.trim();

    const curSt = String(existing.currentStatus ?? "").trim().toUpperCase();
    if (curSt === "REACHED_CUSTOMER") return;

    const activeAssignment = await loadActiveRiderAssignmentMilestones(tx, existing.id, riderId);
    if (
      !activeAssignment?.pickedUpAt &&
      existing.status !== "picked_up" &&
      existing.status !== "in_transit"
    ) {
      throw Object.assign(new Error("Pick up the parcel before reaching the drop"), {
        statusCode: 409,
      });
    }

    await assertRiderMilestoneGeoFence({
      riderId,
      orderCorePk: existing.id,
      serviceType: "parcel",
      milestoneKey: "reach_drop",
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
      throw Object.assign(new Error("Could not update parcel order"), { statusCode: 409 });
    }

    const distance = await riderDistanceAtMilestone(riderId, row.id, gps);
    await recordRiderAssignmentMilestone(tx, {
      orderCorePk: row.id,
      orderIdText,
      riderId,
      eventType: "reached_customer",
      occurredAt: now,
      distance,
      statusMessage: "Reached Parcel Drop",
    });
    newlyReached = true;
  });

  if (newlyReached && orderIdText) {
    void notifyCustomerParcelLifecycle({
      orderIdText,
      templateCode: "PARCEL_RIDER_NEARBY",
      riderId,
    });
    void publishOrderEvent(orderIdText, {
      type: "status_changed",
      status: "REACHED_CUSTOMER",
      orderId: orderIdText,
      riderId,
    }).catch(() => {});
  }

  return getParcelOrderForRider(riderId, orderRef);
}

async function verifyParcelDeliveryOtpForRider(
  riderId: number,
  orderRef: string,
  otpInput: string,
  payload?: RiderDeliveryVerifyPayload
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();
  let orderIdText = "";
  let orderCorePk = 0;
  let newlyDelivered = false;

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        deliveryOtp: ordersCore.deliveryOtp,
        requiresOtp: ordersParcel.requiresOtpVerification,
      })
      .from(ordersCore)
      .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
      .where(
        and(
          orderRefWhere(orderRef),
          eq(ordersCore.riderId, riderId),
          eq(ordersCore.orderType, "parcel"),
          notInArray(ordersCore.status, ["delivered", "cancelled", "failed"])
        )
      )
      .limit(1);

    if (!existing?.id || !existing.orderId) {
      throw Object.assign(new Error("Parcel not ready for delivery"), { statusCode: 409 });
    }
    orderIdText = existing.orderId.trim();
    orderCorePk = existing.id;

    if (existing.requiresOtp) {
      const expected = String(existing.deliveryOtp ?? "").trim();
      const got = String(otpInput ?? "").trim().replace(/\D/g, "");
      if (!expected || expected !== got) {
        throw Object.assign(new Error("Incorrect delivery OTP"), { statusCode: 403 });
      }
    }

    await assertRiderMilestoneGeoFence({
      riderId,
      orderCorePk: existing.id,
      serviceType: "parcel",
      milestoneKey: "delivery_confirmation",
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
      throw Object.assign(new Error("Could not confirm parcel delivery"), { statusCode: 409 });
    }

    const distance = await riderDistanceAtMilestone(riderId, row.id, payload);
    await recordRiderAssignmentMilestone(tx, {
      orderCorePk: row.id,
      orderIdText,
      riderId,
      eventType: "delivered",
      occurredAt: now,
      distance,
      statusMessage: "Parcel Delivered",
    });

    const proofUrl = String(payload?.deliveryImageUrl ?? "").trim();
    const proofKey = String(payload?.deliveryImageR2Key ?? "").trim();
    if (proofUrl && proofKey) {
      await recordOrderDeliveryProofImageTx(tx, {
        orderCorePk: row.id,
        riderId,
        imageUrl: proofUrl,
        r2Key: proofKey,
        takenAt: now,
      });
    }
    newlyDelivered = true;
  });

  if (newlyDelivered && orderIdText) {
    void notifyCustomerParcelLifecycle({
      orderIdText,
      templateCode: "PARCEL_DELIVERED",
      riderId,
    });
    void publishOrderEvent(orderIdText, {
      type: "status_changed",
      status: "DELIVERED",
      orderId: orderIdText,
      riderId,
    }).catch(() => {});
    void import("../../lib/credit-rider-order-on-delivered.js")
      .then(({ creditRiderOrderEarningOnDelivered }) =>
        creditRiderOrderEarningOnDelivered({
          ordersCoreId: orderCorePk,
          riderId,
          orderType: "parcel",
          orderIdText,
        })
      )
      .catch(() => {});
    noteRiderOrderLocationMilestone(riderId, orderIdText, "delivered", payload);
  }

  return getParcelOrderForRider(riderId, orderRef);
}

async function markReachedFoodPickupForRider(
  riderId: number,
  orderRef: string,
  gps?: RiderGpsPayload
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();
  let didNewlyReachStore = false;

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

    const activeAssignment = await loadActiveRiderAssignmentMilestones(
      tx,
      existing.id,
      riderId
    );

    if (activeAssignment?.pickedUpAt) {
      throw Object.assign(new Error("Food order already picked up"), { statusCode: 409 });
    }

    const alreadyAtStore =
      activeAssignment?.reachedMerchantAt != null ||
      coreSt === "reached_store" ||
      curSt === "RIDER_AT_PICKUP";

    if (alreadyAtStore) {
      const full = await selectFoodOrderRowForRider(tx, existing.id);
      if (!full?.orderId) throw new Error("Food order missing after update");
      return mapFoodRowForActiveRider(tx, full, riderId, existing.id);
    }

    const effectiveCoreSt =
      coreSt === "in_transit" && !activeAssignment?.pickedUpAt ? "accepted" : coreSt;

    if (!(FOOD_REACH_STORE_CORE_STATUSES as readonly string[]).includes(effectiveCoreSt)) {
      throw Object.assign(new Error("Food order not ready for pickup arrival"), {
        statusCode: 409,
      });
    }

    if (coreSt === "in_transit" && !activeAssignment?.pickedUpAt) {
      await tx
        .update(ordersCore)
        .set({
          status: "accepted",
          currentStatus: "RIDER_ASSIGNED",
          actualPickupTime: null,
          updatedAt: now,
        })
        .where(and(eq(ordersCore.id, existing.id), eq(ordersCore.riderId, riderId)));
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
    didNewlyReachStore = true;
    return mapFoodRowForActiveRider(tx, full, riderId, row.id);
  });

  if (didNewlyReachStore) {
    void (async () => {
      try {
        const sql = getSql();
        const orderIdText = updated.id?.trim();
        if (!orderIdText) return;
        const rows = await sql`
          SELECT
            f.id::text AS food_id,
            f.formatted_order_id,
            f.merchant_store_id,
            f.pickup_otp,
            c.formatted_order_id AS core_formatted
          FROM orders_core c
          INNER JOIN orders_food f ON f.order_id = c.id
          WHERE c.order_id = ${orderIdText}
          LIMIT 1
        `;
        const meta = rows[0] as
          | {
              food_id?: string;
              formatted_order_id?: string | null;
              merchant_store_id?: number;
              pickup_otp?: string | null;
              core_formatted?: string | null;
            }
          | undefined;
        const storeId = Number(meta?.merchant_store_id);
        if (!Number.isFinite(storeId) || storeId < 1) return;
        const riderRows = await sql`
          SELECT name FROM riders WHERE id = ${riderId} LIMIT 1
        `;
        const riderName = String((riderRows[0] as { name?: string } | undefined)?.name ?? "Rider");
        const displayOrderId =
          (meta?.formatted_order_id && String(meta.formatted_order_id).trim()) ||
          (meta?.core_formatted && String(meta.core_formatted).trim()) ||
          orderIdText;
        const foodOrderId =
          meta?.food_id != null && /^\d+$/.test(String(meta.food_id))
            ? Number(meta.food_id)
            : null;
        await notifyMerchantRiderReachedPickup(sql, {
          storeId,
          displayOrderId,
          riderName,
          foodOrderId,
          pickupOtp: meta?.pickup_otp ?? null,
        });
        void notifyCustomerFoodLifecycle({
          orderIdText,
          templateCode: "ORDER_RIDER_AT_STORE",
          riderId,
          riderName,
        });
      } catch (err) {
        console.warn(
          "[markReachedFoodPickupForRider] merchant pickup notify failed",
          (err as Error).message
        );
      }
    })();
  }

  const merchantFeedbackSubmitted = await loadRiderMerchantFeedbackSubmitted(
    db,
    riderId,
    updated.id
  );

  const orderIdForEta = updated.id?.trim();
  if (orderIdForEta) {
    void import("../../modules/eta/eta.live-engine.js")
      .then(({ runLiveEtaForOrder }) => runLiveEtaForOrder(orderIdForEta, "STATUS_CHANGE"))
      .catch((e) =>
        console.warn("[markReachedFoodPickupForRider] live ETA refresh failed", (e as Error).message)
      );
  }

  noteRiderOrderLocationMilestone(riderId, updated.id, "reached_store", gps);
  if (didNewlyReachStore) {
    const orderIdText = updated.id?.trim();
    if (orderIdText) {
      void publishOrderEvent(orderIdText, {
        type: "status_changed",
        status: "RIDER_AT_PICKUP",
        orderId: orderIdText,
        riderId,
      }).catch(() => {});
    }
  }
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

  const activeAssignment = await loadActiveRiderAssignmentMilestones(
    tx,
    existing.id,
    riderId
  );
  if (activeAssignment?.pickedUpAt || foodSt === "DELIVERED") {
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
    UPDATE orders_food
    SET rider_picked_up_at = COALESCE(rider_picked_up_at, ${now.toISOString()}::timestamptz)
    WHERE order_id = ${row.id}
  `);

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
    statusMessage: null,
    metadata: {
      actor_type: "rider",
      actor_id: "GatiMitra App",
    },
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
      status: ordersCore.status,
    })
    .from(ordersCore)
    .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(
      and(
        orderRefWhere(orderRef),
        eq(ordersCore.riderId, riderId),
        eq(ordersCore.orderType, "food"),
        inArray(ordersCore.status, [...FOOD_REACH_STORE_CORE_STATUSES, "in_transit"])
      )
    )
    .limit(1);

  if (!existing?.id || !existing.orderId) {
    throw Object.assign(new Error("Food order not ready for pickup verification"), {
      statusCode: 409,
    });
  }

  const activeAssignment = await loadActiveRiderAssignmentMilestones(
    tx,
    existing.id,
    riderId
  );
  if (activeAssignment?.pickedUpAt) {
    throw Object.assign(new Error("Food order already picked up"), { statusCode: 409 });
  }

  const coreSt = String(existing.status ?? "").trim();
  if (
    coreSt === "in_transit" &&
    !(FOOD_REACH_STORE_CORE_STATUSES as readonly string[]).includes(coreSt)
  ) {
    const now = new Date();
    await tx
      .update(ordersCore)
      .set({
        status: "reached_store",
        currentStatus: "RIDER_AT_PICKUP",
        actualPickupTime: null,
        updatedAt: now,
      })
      .where(and(eq(ordersCore.id, existing.id), eq(ordersCore.riderId, riderId)));
  }

  let pickupVerificationToken: string | null = null;
  let securePickupToken: string | null = null;
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

  try {
    const secureRows = await tx.execute<{ token: string | null }>(sql`
      SELECT token
      FROM order_pickup_tokens
      WHERE order_id = ${existing.id}
      LIMIT 1
    `);
    securePickupToken = (secureRows as { token: string | null }[])[0]?.token ?? null;
  } catch (secureErr) {
    console.warn(
      "[loadFoodOrderAwaitingPickupVerification] order_pickup_tokens unavailable:",
      secureErr
    );
  }

  return {
    ...existing,
    pickupVerificationToken,
    securePickupToken,
    foodFormattedOrderId,
  };
}

/** Rider tapped "Okay, I'm picking!" — persisted per active assignment. */
export async function acknowledgeFoodPickupForRider(
  riderId: number,
  orderRef: string
): Promise<RiderOrderSummary> {
  const db = getDb();
  const now = new Date();

  const summary = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        riderId: ordersCore.riderId,
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

    const activeAssignment = await loadActiveRiderAssignmentMilestones(
      tx,
      existing.id,
      riderId
    );

    if (activeAssignment?.pickedUpAt) {
      throw Object.assign(new Error("Food order already picked up"), { statusCode: 409 });
    }

    const foodSt = String(existing.foodStatus ?? "").trim().toUpperCase();
    if (!isMerchantFoodOrderReady(foodSt)) {
      throw Object.assign(
        new Error("Order is not ready yet. Wait for the restaurant to mark it ready."),
        { statusCode: 409 }
      );
    }

    if (!activeAssignment?.pickupAcknowledged) {
      await tx.execute(sql`
        UPDATE order_rider_assignments
        SET
          pickup_acknowledged = TRUE,
          pickup_acknowledged_at = COALESCE(pickup_acknowledged_at, ${now.toISOString()}::timestamptz),
          pickup_acknowledged_by = COALESCE(pickup_acknowledged_by, ${riderId}),
          pickup_acknowledgement_version = GREATEST(pickup_acknowledgement_version, 1),
          updated_at = ${now.toISOString()}::timestamptz
        WHERE order_core_id = ${existing.id}
          AND rider_id = ${riderId}
          AND is_active = TRUE
      `);
    }

    const full = await selectFoodOrderRowForRider(tx, existing.id);
    if (!full?.orderId) throw new Error("Food order missing after update");
    return mapFoodRowForActiveRider(tx, full, riderId, existing.id);
  });

  const merchantFeedbackSubmitted = await loadRiderMerchantFeedbackSubmitted(
    db,
    riderId,
    summary.id
  );
  return { ...summary, merchantFeedbackSubmitted };
}

export async function markFoodPickupWithoutVerificationForRider(
  riderId: number,
  orderRef: string,
  gps?: RiderGpsPayload,
  deviceTimestamp?: string
): Promise<RiderOrderSummary> {
  const dbMeta = getDb();
  const [meta] = await dbMeta
    .select({ orderType: ordersCore.orderType })
    .from(ordersCore)
    .where(orderRefWhere(orderRef))
    .limit(1);
  if (meta?.orderType === "parcel") {
    return markParcelPickedUpForRider(riderId, orderRef, gps);
  }

  const settings = await loadFoodPickupVerificationSettings();
  if (settings.verificationRequired) {
    throw Object.assign(new Error("Pickup verification is required for this order"), {
      statusCode: 409,
    });
  }

  const db = getDb();
  let orderCorePk = 0;
  const updated = await db.transaction(async (tx) => {
    const existing = await loadFoodOrderAwaitingPickupVerification(tx, riderId, orderRef);
    orderCorePk = existing.id;

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
  void notifyCustomerFoodLifecycle({
    orderIdText: (updated.orderId ?? "").trim(),
    templateCode: "ORDER_OUT_FOR_DELIVERY",
    riderId,
  });
  const orderIdText = (updated.orderId ?? "").trim();
  if (orderIdText) {
    void publishOrderEvent(orderIdText, {
      type: "status_changed",
      status: "OUT_FOR_DELIVERY",
      orderId: orderIdText,
      riderId,
    }).catch(() => {});
  }
  const summary = await mapFoodRowForActiveRider(db, updated, riderId, orderCorePk);
  return { ...summary, merchantFeedbackSubmitted };
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

  let orderCorePk = 0;
  const updated = await db.transaction(async (tx) => {
    const existing = await loadFoodOrderAwaitingPickupVerification(tx, riderId, orderRef);
    orderCorePk = existing.id;

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

    const finalized = await finalizeFoodPickupVerificationForRider(tx, riderId, existing, gps, {
      method: "otp",
      otpVerified: true,
      deviceTimestamp: deviceTimestamp ?? null,
    });

    // Keep QR ACTIVE so a reassigned rider can scan the same printed KOT code.
    try {
      await tx.execute(sql`
        UPDATE order_pickup_tokens
        SET status = 'ACTIVE',
            scanned_at = COALESCE(scanned_at, now()),
            scanned_by_rider_id = COALESCE(scanned_by_rider_id, ${riderId}),
            assigned_rider_id = ${riderId},
            used_at = NULL,
            expires_at = NULL,
            updated_at = now()
        WHERE order_id = ${existing.id}
      `);
    } catch (consumeErr) {
      console.warn(
        "[verifyFoodPickupOtpForRider] order_pickup_tokens scan mark failed:",
        consumeErr
      );
    }

    return finalized;
  });

  const merchantFeedbackSubmitted = await loadRiderMerchantFeedbackSubmitted(
    db,
    riderId,
    (updated.orderId ?? "").trim()
  );

  void import("../../modules/eta/eta.live-engine.js")
    .then(({ runLiveEtaForOrder }) => runLiveEtaForOrder((updated.orderId ?? "").trim(), "RIDER_PICKED_UP"))
    .catch(() => undefined);

  void notifyCustomerFoodLifecycle({
    orderIdText: (updated.orderId ?? "").trim(),
    templateCode: "ORDER_OUT_FOR_DELIVERY",
    riderId,
  });

  const summary = await mapFoodRowForActiveRider(db, updated, riderId, orderCorePk);
  return { ...summary, merchantFeedbackSubmitted };
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

  let orderCorePk = 0;
  const updated = await db.transaction(async (tx) => {
    const existing = await loadFoodOrderAwaitingPickupVerification(tx, riderId, orderRef);
    orderCorePk = existing.id;

    await assertRiderMilestoneGeoFence({
      riderId,
      orderCorePk: existing.id,
      serviceType: "food",
      milestoneKey: "mark_picked_up",
      gps,
    });

    const matches = barcodeMatchesPickupToken(scanned, {
      pickupVerificationToken: existing.pickupVerificationToken,
      securePickupToken: existing.securePickupToken,
      formattedOrderId: existing.foodFormattedOrderId ?? existing.formattedOrderId,
      orderIdText: existing.orderId,
    });

    if (!matches) {
      throw Object.assign(
        new Error("Barcode does not match this order. Scan the bill or merchant QR code."),
        { statusCode: 403 }
      );
    }

    const finalized = await finalizeFoodPickupVerificationForRider(tx, riderId, existing, gps, {
      method: "barcode",
      barcodeValue: scanned,
      deviceTimestamp: deviceTimestamp ?? null,
    });

    // Keep QR ACTIVE so a reassigned rider can scan the same printed KOT code.
    try {
      await tx.execute(sql`
        UPDATE order_pickup_tokens
        SET status = 'ACTIVE',
            scanned_at = COALESCE(scanned_at, now()),
            scanned_by_rider_id = COALESCE(scanned_by_rider_id, ${riderId}),
            assigned_rider_id = ${riderId},
            used_at = NULL,
            expires_at = NULL,
            updated_at = now()
        WHERE order_id = ${existing.id}
      `);
    } catch (consumeErr) {
      console.warn(
        "[verifyFoodPickupBarcodeForRider] order_pickup_tokens scan mark failed:",
        consumeErr
      );
    }

    return finalized;
  });

  const merchantFeedbackSubmitted = await loadRiderMerchantFeedbackSubmitted(
    db,
    riderId,
    (updated.orderId ?? "").trim()
  );
  void notifyCustomerFoodLifecycle({
    orderIdText: (updated.orderId ?? "").trim(),
    templateCode: "ORDER_OUT_FOR_DELIVERY",
    riderId,
  });
  const summary = await mapFoodRowForActiveRider(db, updated, riderId, orderCorePk);
  return { ...summary, merchantFeedbackSubmitted };
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
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
        alternateContactName: ordersCore.alternateContactName,
        alternateContactPhone: ordersCore.alternateContactPhone,
        deliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
        deliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
      })
      .from(ordersCore)
      .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
      .where(eq(ordersCore.id, row.id))
      .limit(1);

    if (!full?.orderId) throw new Error("Food order missing after reach customer");
    return mapFoodRowForActiveRider(tx, full, riderId, row.id);
  });

  noteRiderOrderLocationMilestone(riderId, updated.id, "reached_user", gps);
  void notifyCustomerFoodLifecycle({
    orderIdText: updated.id,
    templateCode: "ORDER_RIDER_ARRIVING",
    riderId,
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
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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

  noteRiderOrderLocationMilestone(riderId, updated.id, "reached_user", gps);
  void notifyCustomerRideLifecycle({
    orderIdText: updated.id,
    templateCode: "RIDE_NEAR_DESTINATION",
    riderId,
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

  if (meta?.orderType === "parcel") {
    return markReachedParcelCustomerForRider(riderId, orderRef, gps);
  }

  throw Object.assign(new Error("Reach customer is only supported for food, parcel, and person rides"), {
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
    const { creditRiderOrderEarningOnDelivered } = await import(
      "../../lib/credit-rider-order-on-delivered.js"
    );
    const sideTasks: Promise<unknown>[] = [
      finalizeMerchantOrderDelivered({
        orderIdText,
        previousStatus: "OUT_FOR_DELIVERY",
      }),
      creditRiderOrderEarningOnDelivered({
        ordersCoreId: orderCorePk,
        riderId,
        orderType: "food",
        orderIdText,
      }),
      publishOrderEvent(orderIdText, {
        type: "status_changed",
        status: "DELIVERED",
        orderId: orderIdText,
        riderId,
      }),
      notifyCustomerFoodLifecycle({
        orderIdText,
        templateCode: "ORDER_DELIVERED",
        riderId,
      }),
      import("../../modules/eta/eta.live-engine.js").then(({ recordDeliveryEtaAccuracy }) =>
        recordDeliveryEtaAccuracy(orderIdText)
      ),
    ];

    if (merchantStoreId != null && merchantStoreId > 0) {
      sideTasks.push(
        publishStoreEvent(merchantStoreId, {
          type: "order_status_changed",
          orderId: orderIdText,
          status: "DELIVERED",
        })
      );
      sideTasks.push(
        (async () => {
          const { clearMerchantStoreOrderNotificationsByOrderRef } = await import(
            "../../lib/clear-merchant-order-notifications.js"
          );
          await clearMerchantStoreOrderNotificationsByOrderRef(getSql(), {
            merchantStoreId,
            orderIdText,
            formattedOrderId: orderIdText,
          });
        })()
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
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
        alternateContactName: ordersCore.alternateContactName,
        alternateContactPhone: ordersCore.alternateContactPhone,
        deliveryPrimaryContactName: ordersCore.deliveryPrimaryContactName,
        deliveryPrimaryContactPhone: ordersCore.deliveryPrimaryContactPhone,
      })
      .from(ordersCore)
      .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
      .where(eq(ordersCore.id, row.id))
      .limit(1);

    if (!full?.orderId) throw new Error("Food order missing after delivery");
    const summary = await mapFoodRowForActiveRider(tx, full, riderId, row.id);
    return { summary, orderIdText: existing.orderId.trim() };
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

  if (meta?.orderType === "parcel") {
    return verifyParcelDeliveryOtpForRider(riderId, orderRef, otpInput, payload);
  }

  if (meta?.orderType === "person_ride") {
    throw Object.assign(
      new Error("Person rides are completed without drop OTP — use complete ride"),
      { statusCode: 409 }
    );
  }

  throw Object.assign(new Error("Delivery OTP is only supported for food and parcel orders"), {
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
  let savedCorePk = 0;
  let savedOrderIdText = "";

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
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
        billingSnapshot: ordersCore.billingSnapshot,
        paymentMethod: ordersCore.paymentMethod,
        paymentStatus: ordersCore.paymentStatus,
        tipAmount: ordersCore.tipAmount,
        checkoutMetadata: ordersCore.checkoutMetadata,
        createdAt: ordersCore.createdAt,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        rideType: ordersRide.rideType,
        estimatedFare: ordersRide.estimatedFare,
        searchExpiresAt: ordersRide.searchExpiresAt,
        pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
        customerTipAmount: ordersRide.customerTipAmount,
        passengerName: ordersRide.passengerName,
        passengerPhone: ordersRide.passengerPhone,
        customerFullName: customers.fullName,
        customerPrimaryMobile: customers.primaryMobile,
        adminRiderPaymentClearedAt: ordersRide.adminRiderPaymentClearedAt,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .leftJoin(customers, eq(ordersCore.customerId, customers.id))
      .where(eq(ordersCore.id, row.id))
      .limit(1);

    if (!full?.orderId) throw new Error("Ride missing after completion");
    savedCorePk = row.id;
    savedOrderIdText = orderIdText;
    return mapRideRowWithStatus(full, "delivered", full.currentStatus);
  });

  if (savedCorePk > 0) {
    void applyRidePickupWaitingToBilling(savedCorePk, riderId).catch((err) => {
      console.warn("[completePersonRideForRider] waiting billing update failed:", err);
    });
    void persistRideRiderAcceptPayoutSnapshot(savedCorePk, riderId).catch(() => {});
    void import("../../lib/credit-rider-order-on-delivered.js")
      .then(async ({ creditRiderOrderEarningOnDelivered }) => {
        const db = getDb();
        const [payRow] = await db
          .select({ paymentStatus: ordersCore.paymentStatus })
          .from(ordersCore)
          .where(eq(ordersCore.id, savedCorePk))
          .limit(1);
        if (isRideFarePaymentPending(payRow?.paymentStatus)) return;
        return creditRiderOrderEarningOnDelivered({
          ordersCoreId: savedCorePk,
          riderId,
          orderType: "person_ride",
          orderIdText: savedOrderIdText,
        });
      })
      .catch((err) => {
        console.warn("[completePersonRideForRider] rider wallet credit skipped:", err);
      });
  }

  const withDistances = await attachRiderOrderDistanceBreakdown(riderId, savedCorePk, updated);
  return withDistances;
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

  let savedCorePk = 0;
  let savedOrderIdText = "";

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

    void notifyCustomerRideLifecycle({
      orderIdText,
      templateCode: "RIDE_COMPLETED",
      riderId,
    });

    const [full] = await tx
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
        pickupAddressRaw: ordersCore.pickupAddressRaw,
        pickupAddressNormalized: ordersCore.pickupAddressNormalized,
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
        billingSnapshot: ordersCore.billingSnapshot,
        paymentMethod: ordersCore.paymentMethod,
        paymentStatus: ordersCore.paymentStatus,
        tipAmount: ordersCore.tipAmount,
        checkoutMetadata: ordersCore.checkoutMetadata,
        createdAt: ordersCore.createdAt,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        rideType: ordersRide.rideType,
        estimatedFare: ordersRide.estimatedFare,
        searchExpiresAt: ordersRide.searchExpiresAt,
        pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
        customerTipAmount: ordersRide.customerTipAmount,
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
    savedCorePk = row.id;
    savedOrderIdText = orderIdText;
    return mapRideRowWithStatus(full, "delivered", full.currentStatus);
  });

  if (savedCorePk > 0) {
    void applyRidePickupWaitingToBilling(savedCorePk, riderId).catch((err) => {
      console.warn("[verifyPersonRideDropOtpForRider] waiting billing update failed:", err);
    });
    void persistRideRiderAcceptPayoutSnapshot(savedCorePk, riderId).catch(() => {});
    void import("../../lib/credit-rider-order-on-delivered.js")
      .then(async ({ creditRiderOrderEarningOnDelivered }) => {
        const db = getDb();
        const [payRow] = await db
          .select({ paymentStatus: ordersCore.paymentStatus })
          .from(ordersCore)
          .where(eq(ordersCore.id, savedCorePk))
          .limit(1);
        if (isRideFarePaymentPending(payRow?.paymentStatus)) return;
        return creditRiderOrderEarningOnDelivered({
          ordersCoreId: savedCorePk,
          riderId,
          orderType: "person_ride",
          orderIdText: savedOrderIdText,
        });
      })
      .catch((err) => {
        console.warn("[verifyPersonRideDropOtpForRider] rider wallet credit skipped:", err);
      });
  }

  noteRiderOrderLocationMilestone(riderId, updated.id, "delivered");
  return updated;
}

const FOOD_RIDER_SELF_CANCEL_BLOCKED_FOOD_STATUS = new Set([
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "IN_TRANSIT",
  "ON_THE_WAY",
  "DELIVERED",
  "CANCELLED",
  "RTO",
  "REACHED_CUSTOMER",
  "AT_CUSTOMER",
  "RIDER_AT_DROP",
]);

const RIDER_UNASSIGNABLE_STATUSES = new Set([
  "accepted",
  "reached_store",
  PERSON_RIDE_AT_USER_STATUS,
  // After pickup / trip started — rider may still self-cancel (penalty applies).
  "picked_up",
  "in_transit",
]);

async function applySelfCancelPenaltyForRider(args: {
  riderId: number;
  orderCoreId: number;
  orderType: "food" | "person_ride";
  reasonCode: string;
}): Promise<{ penaltyApplied: boolean; penaltyAmount: number }> {
  const { applyRiderAppCancellationPenalty } = await import(
    "../../lib/rider-cancellation-penalty.service.js"
  );
  const penalty = await applyRiderAppCancellationPenalty({
    riderId: args.riderId,
    orderCoreId: args.orderCoreId,
    orderType: args.orderType,
    reasonCode: args.reasonCode,
  });
  return {
    penaltyApplied: Boolean(penalty.applied),
    penaltyAmount: penalty.amount ?? 0,
  };
}

export async function cancelAssignedRideForRider(
  riderId: number,
  orderRef: string,
  input: { reasonCode: string; reasonText?: string | null }
): Promise<{ ok: true; penaltyApplied?: boolean; penaltyAmount?: number }> {
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

    const st = String(existing.status ?? "").trim().toLowerCase();
    if (!RIDER_UNASSIGNABLE_STATUSES.has(st)) {
      throw Object.assign(
        new Error(
          st === "delivered" || st === "cancelled"
            ? "Ride is already closed and cannot be cancelled"
            : "Ride cannot be cancelled in current status"
        ),
        { statusCode: 409 }
      );
    }

    const orderIdText = existing.orderId.trim();
    const reasonText = input.reasonText?.trim() || null;

    return { orderCoreId: existing.id, orderIdText, reasonText, status: st, currentStatus: existing.currentStatus };
  });

  let penalty: { penaltyApplied: boolean; penaltyAmount: number } = {
    penaltyApplied: false,
    penaltyAmount: 0,
  };
  try {
    penalty = await applySelfCancelPenaltyForRider({
      riderId,
      orderCoreId: cancelled.orderCoreId,
      orderType: "person_ride",
      reasonCode,
    });
  } catch (err) {
    // Never block unassign/redispatch on wallet debit failure — ledger can be reconciled later.
    console.warn("[cancelAssignedRideForRider] penalty apply failed:", err);
  }

  await db.transaction(async (tx) => {
    await recordRideRiderUnassign(tx, {
      orderCorePk: cancelled.orderCoreId,
      orderIdText: cancelled.orderIdText,
      riderId,
      reasonCode,
      reasonText: cancelled.reasonText,
      coreStatusBefore: String(cancelled.currentStatus ?? cancelled.status),
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
      .where(and(eq(ordersCore.id, cancelled.orderCoreId), eq(ordersCore.riderId, riderId)));

    await tx
      .update(ordersRide)
      .set({
        assignedRiderId: null,
        riderAssignedAt: null,
        riderReachedPickupAt: null,
        updatedAt: now,
      })
      .where(eq(ordersRide.orderId, cancelled.orderCoreId));

    await appendOrderTimeline(tx, {
      orderCorePk: cancelled.orderCoreId,
      status: "SEARCHING_RIDER",
      previousStatus: String(cancelled.currentStatus ?? cancelled.status).toUpperCase(),
      actorType: "rider",
      actorId: riderId,
      statusMessage: cancelled.reasonText ?? reasonCode,
      occurredAt: now,
      metadata: {
        riderUnassign: true,
        reasonCode,
        reasonText: cancelled.reasonText,
        serviceType: "person_ride",
        penaltyApplied: penalty.penaltyApplied,
        penaltyAmount: penalty.penaltyAmount,
      },
    });
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

  const { notifyCustomerRideCaptainCancelled } = await import(
    "../../lib/customer-ride-captain-notify.js"
  );
  void notifyCustomerRideCaptainCancelled(cancelled.orderCoreId, cancelled.orderIdText);

  const { restartOrderDispatch } = await import("../../lib/order-dispatch.service.js");
  void restartOrderDispatch(cancelled.orderCoreId);

  return {
    ok: true as const,
    penaltyApplied: penalty.penaltyApplied,
    penaltyAmount: penalty.penaltyAmount,
  };
}

export async function cancelAssignedFoodForRider(
  riderId: number,
  orderRef: string,
  input: { reasonCode: string; reasonText?: string | null }
): Promise<{ ok: true; penaltyApplied?: boolean; penaltyAmount?: number }> {
  const db = getDb();
  const reasonCode = input.reasonCode?.trim();
  if (!reasonCode) {
    throw Object.assign(new Error("Cancellation reason is required"), { statusCode: 400 });
  }

  const [existing] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
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

  if (!existing?.id || !existing.orderId) {
    throw Object.assign(new Error("Food order not found"), { statusCode: 404 });
  }

  const foodSt = String(existing.foodStatus ?? "")
    .trim()
    .toUpperCase();
  if (FOOD_RIDER_SELF_CANCEL_BLOCKED_FOOD_STATUS.has(foodSt)) {
    throw Object.assign(new Error("Delivery cannot be cancelled in current status"), {
      statusCode: 409,
    });
  }

  const penalty = await applySelfCancelPenaltyForRider({
    riderId,
    orderCoreId: existing.id,
    orderType: "food",
    reasonCode,
  });

  const { unassignFoodRiderAndRestartDispatch } = await import(
    "../../lib/food-rider-unassign.service.js"
  );

  await unassignFoodRiderAndRestartDispatch({
    orderCorePk: existing.id,
    orderIdText: existing.orderId.trim(),
    riderId,
    reasonCode,
    reasonText: input.reasonText?.trim() || null,
    removedBy: String(riderId),
    actorType: "rider",
    actorId: String(riderId),
  });

  return {
    ok: true as const,
    penaltyApplied: penalty.penaltyApplied,
    penaltyAmount: penalty.penaltyAmount,
  };
}

export async function cancelAssignedOrderForRider(
  riderId: number,
  orderRef: string,
  input: { reasonCode: string; reasonText?: string | null }
): Promise<{ ok: true; penaltyApplied?: boolean; penaltyAmount?: number }> {
  const db = getDb();
  const [existing] = await db
    .select({ orderType: ordersCore.orderType })
    .from(ordersCore)
    .where(and(orderRefWhere(orderRef), eq(ordersCore.riderId, riderId)))
    .limit(1);

  if (!existing?.orderType) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }

  const orderType = String(existing.orderType).trim().toLowerCase();
  if (orderType === "food") {
    return cancelAssignedFoodForRider(riderId, orderRef, input);
  }
  if (orderType === "person_ride") {
    return cancelAssignedRideForRider(riderId, orderRef, input);
  }

  throw Object.assign(new Error("Order type does not support rider cancellation"), {
    statusCode: 409,
  });
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

const RIDER_MERCHANT_PICKUP_FEEDBACK_LABELS: Record<string, string> = {
  order_given_on_time: "Order given on time",
  merchant_was_nice: "Merchant was nice",
  easy_to_find: "Easy to find store",
  pickup_experience_good: "Smooth pickup experience",
  waiting_time_ok: "Waiting time was fine",
  waiting_time_long: "Long waiting time",
  long_wait_time: "Long wait time",
  order_not_ready: "Order not ready",
  rude_behavior: "Rude behavior",
  wrong_items: "Wrong items",
};

function normalizeFeedbackTagIds(raw: unknown, allowed: Set<string>): string[] {
  return [
    ...new Set(
      (Array.isArray(raw) ? raw : [])
        .map((t) => String(t ?? "").trim())
        .filter((t) => allowed.has(t))
    ),
  ];
}

function feedbackTagLabels(ids: string[], labels: Record<string, string>): string[] {
  return ids.map((id) => labels[id] ?? id);
}

function normalizeFeedbackMessages(raw: unknown, max = 12): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .map((m) => String(m ?? "").trim())
        .filter((m) => m.length > 0)
        .map((m) => m.slice(0, 200))
    ),
  ].slice(0, max);
}

/** Safe TEXT[] literal for postgres.js — avoids ERR_INVALID_ARG_TYPE on JS arrays. */
function buildPostgresTextArrayLiteral(items: string[]): string {
  return `{${items
    .map((s) => {
      const t = String(s);
      return `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    })
    .join(",")}}`;
}

export type RiderMerchantPickupFeedbackPayload = {
  rating?: number;
  tags?: string[];
  messages?: string[];
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
      LEFT JOIN orders_food f ON f.order_id = oc.id
      WHERE ora.rider_id = ${riderId}
        AND (
          oc.order_id = ${orderRefText}
          OR oc.formatted_order_id = ${orderRefText}
          OR oc.id = ${coreIdMatch}
          OR f.formatted_order_id = ${orderRefText}
          OR f.core_order_id = ${orderRefText}
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
  let normalizedTagIds: string[] = [];
  let feedbackMessages: string[] = [];

  if (!skipped) {
    const ratingNum = Number(payload.rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      throw Object.assign(new Error("Select a rating from 1 to 5"), { statusCode: 400 });
    }
    rating = ratingNum;
    normalizedTagIds = normalizeFeedbackTagIds(payload.tags, RIDER_MERCHANT_PICKUP_FEEDBACK_TAGS);
    const derivedMessages = feedbackTagLabels(
      normalizedTagIds,
      RIDER_MERCHANT_PICKUP_FEEDBACK_LABELS
    );
    const explicitMessages = normalizeFeedbackMessages(payload.messages);
    feedbackMessages =
      explicitMessages.length > 0 ? explicitMessages : derivedMessages;
  }

  const feedbackAt = skipped ? sql`NULL` : sql`${now.toISOString()}::timestamptz`;

  const assignmentRow = await db.execute<{ id: number }>(sql`
    SELECT id
    FROM order_rider_assignments
    WHERE order_core_id = ${meta.coreId}
      AND rider_id = ${riderId}
    ORDER BY is_active DESC, id DESC
    LIMIT 1
  `);
  const assignmentId = Number((assignmentRow as { id: number }[])[0]?.id ?? 0);
  if (!assignmentId) {
    throw Object.assign(new Error("No rider assignment found for this order"), {
      statusCode: 404,
    });
  }

  await db.execute(sql`
    UPDATE order_rider_assignments
    SET
      rider_merchant_rating = ${skipped ? null : rating},
      rider_merchant_feedback_tags = ${
        skipped ? sql`NULL::jsonb` : sql`${JSON.stringify(normalizedTagIds)}::jsonb`
      },
      rider_merchant_feedback_messages = ${
        skipped || feedbackMessages.length === 0
          ? sql`NULL::text[]`
          : sql`${buildPostgresTextArrayLiteral(feedbackMessages)}::text[]`
      },
      rider_merchant_feedback_at = ${feedbackAt},
      rider_merchant_feedback_skipped = ${skipped},
      updated_at = ${now.toISOString()}::timestamptz
    WHERE id = ${assignmentId}
  `);

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

const RIDER_CUSTOMER_DELIVERY_FEEDBACK_LABELS: Record<string, string> = {
  polite_customer: "Polite & cooperative",
  clear_instructions: "Clear delivery instructions",
  easy_to_find: "Easy to find location",
  quick_handover: "Quick handover",
  long_wait_at_door: "Long wait at door",
  hard_to_find: "Hard to find address",
  rude_customer: "Rude or unresponsive",
  wrong_address: "Wrong address given",
  customer_unreachable: "Customer unreachable",
};

export type RiderCustomerDeliveryFeedbackPayload = {
  rating?: number;
  tags?: string[];
  messages?: string[];
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
  let normalizedTagIds: string[] = [];
  let feedbackMessages: string[] = [];
  let commentText: string | null = null;

  if (!skipped) {
    const ratingNum = Number(payload.rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      throw Object.assign(new Error("Select a rating from 1 to 5"), { statusCode: 400 });
    }
    rating = ratingNum;
    normalizedTagIds = normalizeFeedbackTagIds(
      payload.tags,
      RIDER_CUSTOMER_DELIVERY_FEEDBACK_TAGS
    );
    const derivedMessages = feedbackTagLabels(
      normalizedTagIds,
      RIDER_CUSTOMER_DELIVERY_FEEDBACK_LABELS
    );
    const explicitMessages = normalizeFeedbackMessages(payload.messages);
    const comment = String(payload.comment ?? "").trim();
    commentText = comment.length > 0 ? comment.slice(0, 2000) : null;
    feedbackMessages =
      explicitMessages.length > 0
        ? explicitMessages
        : commentText
          ? [...derivedMessages, commentText]
          : derivedMessages;
  }

  const orderIdText = meta.orderId.trim();
  const submittedAt = skipped ? null : now.toISOString();

  const feedbackMessagesSql =
    skipped || feedbackMessages.length === 0
      ? sql`NULL::text[]`
      : sql`${buildPostgresTextArrayLiteral(feedbackMessages)}::text[]`;

  try {
    await db.execute(sql`
      INSERT INTO rider_customer_delivery_feedback (
        order_core_id,
        rider_id,
        order_id_text,
        rating,
        feedback_tags,
        feedback_messages,
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
        ${skipped ? sql`NULL::jsonb` : sql`${JSON.stringify(normalizedTagIds)}::jsonb`},
        ${feedbackMessagesSql},
        ${skipped ? null : commentText},
        ${skipped},
        ${submittedAt != null ? sql`${submittedAt}::timestamptz` : sql`NULL`},
        ${now.toISOString()}::timestamptz,
        ${now.toISOString()}::timestamptz
      )
      ON CONFLICT (order_core_id, rider_id) DO UPDATE SET
        rating = EXCLUDED.rating,
        feedback_tags = EXCLUDED.feedback_tags,
        feedback_messages = EXCLUDED.feedback_messages,
        comment_text = EXCLUDED.comment_text,
        skipped = EXCLUDED.skipped,
        submitted_at = EXCLUDED.submitted_at,
        updated_at = EXCLUDED.updated_at
    `);
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    const missingMessagesColumn =
      /feedback_messages/i.test(message) &&
      (/does not exist|unknown column/i.test(message) || /column/i.test(message));
    if (!missingMessagesColumn) {
      console.error("[submitRiderCustomerDeliveryFeedback] insert failed:", err);
      throw err;
    }

    console.warn(
      "[submitRiderCustomerDeliveryFeedback] feedback_messages column missing — run migration 0330; saving legacy row"
    );
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
        ${skipped ? sql`NULL::jsonb` : sql`${JSON.stringify(normalizedTagIds)}::jsonb`},
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
  }

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
