/**
 * Ride order placement + cancellation (person_ride → orders_core + orders_ride).
 */

import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb, getSql } from "../../db/client.js";
import { customers, ordersCore, ordersRide } from "../../db/schema.js";
import { appendOrderTimeline } from "../../lib/order-placement-timeline.js";
import { maybeStartOrderDispatch } from "../../lib/order-dispatch.service.js";
import { generateFourDigitOtp } from "../../lib/food-order-otps.js";
import { recordOrderCancellation } from "../../lib/record-order-cancellation.js";
import { customerOrderRefWhere } from "../../lib/order-ref-resolve.js";
import { getRoute } from "../distance/distance.service.js";
import { getEnv } from "../../config/env.js";
import { RIDE_TIP_AMOUNTS } from "./ride.tip-boost.service.js";
import {
  isCatalogOptionEligibleForTrip,
  loadRideVehicleLimitsForState,
  resolveRideStateIdFromCoords,
} from "../ride-state-config/index.js";
import { quoteCustomerRideFare } from "../ride-state-config/rideQuote.service.js";
import { resolveRideAddressDisplayLabel } from "../../lib/ride-address-display.js";
import { resolveRidePickupFreeWaitMinutes, resolveRidePickupWaitingChargePerMin } from "../../lib/ride-pickup-wait.js";
import { findCustomerOutstandingRideFare } from "../../lib/ride-fare-gate.js";
import { countDispatchDeclinedForOrder } from "../../lib/rider-dispatch-assignment-audit-read.js";
import { computeBillForRide } from "../billing/rideBilling.service.js";
import type { BillingResult } from "../billing/types.js";
import { insertRideCustomerPaymentSnapshot } from "../../lib/persist-ride-customer-payment-snapshot.js";
import {
  loadCustomerAssignedRiderProfile,
  type CustomerAssignedRiderProfile,
} from "../../lib/customer-assigned-rider-profile.js";

export const DEFAULT_RIDE_SEARCH_TIMEOUT_SEC = 4 * 60;

/** Auto-cancel when rider search expires without assignment. */
export const RIDE_SEARCH_TIMEOUT_REASON_CODE = "Auto Cancelled";
export const RIDE_SEARCH_TIMEOUT_REASON_TEXT = "Rider Not Assigned";
export const RIDE_SEARCH_TIMEOUT_DISPLAY_REASON = "Auto Cancelled";

const CANCELLABLE_STATUSES = new Set(["assigned", "accepted"]);

const VEHICLE_TYPE_BY_RIDE: Record<string, string> = {
  bike: "two_wheeler",
  "bike-lite": "two_wheeler",
  auto: "auto",
  "cab-economy": "cab",
  "cab-premium": "cab",
  travel: "cab",
};

export type RideIntermediateStop = {
  sequence: number;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

export type PlaceRideOrderInput = {
  customerPk: number;
  pickupAddress: string;
  pickupLabel?: string | null;
  pickupLat: number;
  pickupLng: number;
  dropAddress: string;
  dropLabel?: string | null;
  dropLat: number;
  dropLng: number;
  intermediateStops?: RideIntermediateStop[];
  rideType: string;
  vehicleTypeRequired?: string;
  estimatedFare: number;
  tripKm?: number | null;
  paymentMethod?: "cash" | "upi" | "card" | "wallet" | "online" | "cod";
  bookedForSelf?: boolean;
  passengerName?: string | null;
  passengerPhone?: string | null;
  pickupDistanceFromBookerKm?: number | null;
  farPickupPromptShown?: boolean;
  farPickupAcknowledged?: boolean;
  searchTimeoutSec?: number;
  customerTipAmount?: number;
  pickupPincode?: string | null;
  pickupState?: string | null;
};

export type PlaceRideOrderResult = {
  orderId: string;
  formattedOrderId: string | null;
  coreOrderId: number;
  status: string;
  totalAmount: number;
  searchTimeoutSec: number;
  searchExpiresAt: string;
  createdAt: string;
  /** 4-digit code customer shares with rider at pickup. */
  pickupOtp: string;
};

export type CancelRideOrderInput = {
  customerPk: number;
  orderRef: string;
  reasonCode?: string;
  reasonText?: string | null;
  cancelMode?: "manual" | "auto" | "timeout";
  cancelledByType?: "customer" | "system";
};

function sanitizeAddress(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function paymentMethodToEnum(
  method: PlaceRideOrderInput["paymentMethod"]
): "cash" | "upi" | "card" | "wallet" | "online" | "cod" | "other" {
  if (method === "cash") return "cash";
  if (method === "cod") return "cod";
  if (method === "upi" || method === "card" || method === "wallet" || method === "online") {
    return method;
  }
  return "cod";
}

async function resolveDistanceKm(
  pickupLat: number,
  pickupLng: number,
  dropLat: number,
  dropLng: number,
  tripKm?: number | null
): Promise<number> {
  if (tripKm != null && Number.isFinite(tripKm) && tripKm > 0) {
    const km = Math.round(tripKm * 100) / 100;
    // eslint-disable-next-line no-console
    console.log(
      "[ride-placement] distance",
      JSON.stringify({
        source: "client_route",
        routeDistanceKm: km,
        pickupLat,
        pickupLng,
        dropLat,
        dropLng,
      })
    );
    return km;
  }
  try {
    const env = getEnv();
    const route = await getRoute({
      origin: { lat: pickupLat, lng: pickupLng },
      destination: { lat: dropLat, lng: dropLng },
      profile: "driving",
      mapboxToken: env.MAPBOX_ACCESS_TOKEN || undefined,
      osrmBaseUrl: env.OSRM_BASE_URL || undefined,
    });
    return route.distanceKm;
  } catch {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(dropLat - pickupLat);
    const dLon = toRad(dropLng - pickupLng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(pickupLat)) *
        Math.cos(toRad(dropLat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100;
  }
}

function firstRow<T extends Record<string, unknown>>(result: unknown): T | null {
  if (Array.isArray(result)) {
    const row = result[0];
    return row && typeof row === "object" ? (row as T) : null;
  }
  const rows = (result as { rows?: unknown[] })?.rows;
  if (Array.isArray(rows) && rows[0] && typeof rows[0] === "object") {
    return rows[0] as T;
  }
  return null;
}

function coordString(value: number): string {
  return String(Number(value.toFixed(6)));
}

async function resolvePassengerContact(
  db: ReturnType<typeof getDb>,
  customerPk: number,
  input: PlaceRideOrderInput,
  bookedForSelf: boolean
): Promise<{ passengerName: string | null; passengerPhone: string | null }> {
  const [customer] = await db
    .select({
      fullName: customers.fullName,
      primaryMobile: customers.primaryMobile,
    })
    .from(customers)
    .where(eq(customers.id, customerPk))
    .limit(1);

  const customerName = customer?.fullName?.trim() || null;
  const customerPhone = customer?.primaryMobile?.trim() || null;

  if (bookedForSelf) {
    return {
      passengerName: customerName ?? input.passengerName?.trim() ?? null,
      passengerPhone: customerPhone ?? input.passengerPhone?.trim() ?? null,
    };
  }

  return {
    passengerName: input.passengerName?.trim() ?? customerName,
    passengerPhone: input.passengerPhone?.trim() ?? customerPhone,
  };
}

function normalizeIntermediateStops(stops: RideIntermediateStop[]): RideIntermediateStop[] {
  const out: RideIntermediateStop[] = [];
  for (const raw of stops.slice(0, 2)) {
    const address = sanitizeAddress(raw.address || "");
    if (!address) continue;
    if (
      raw.latitude == null ||
      raw.longitude == null ||
      !Number.isFinite(raw.latitude) ||
      !Number.isFinite(raw.longitude)
    ) {
      throw Object.assign(
        new Error(`Stop "${address}" is missing map coordinates. Select it from search or map.`),
        { statusCode: 400 }
      );
    }
    out.push({
      sequence: out.length + 1,
      address,
      latitude: raw.latitude,
      longitude: raw.longitude,
    });
  }
  return out;
}

type RideStopColumns = {
  stop1Address: string | null;
  stop1Lat: string | null;
  stop1Lon: string | null;
  stop2Address: string | null;
  stop2Lat: string | null;
  stop2Lon: string | null;
};

function rideStopColumns(stops: RideIntermediateStop[]): RideStopColumns {
  const s1 = stops[0];
  const s2 = stops[1];
  return {
    stop1Address: s1?.address ?? null,
    stop1Lat: s1?.latitude != null ? coordString(s1.latitude) : null,
    stop1Lon: s1?.longitude != null ? coordString(s1.longitude) : null,
    stop2Address: s2?.address ?? null,
    stop2Lat: s2?.latitude != null ? coordString(s2.latitude) : null,
    stop2Lon: s2?.longitude != null ? coordString(s2.longitude) : null,
  };
}

export async function placeRideOrder(input: PlaceRideOrderInput): Promise<PlaceRideOrderResult> {
  const db = getDb();
  const now = new Date();
  const searchTimeoutSec = Math.min(
    600,
    Math.max(60, input.searchTimeoutSec ?? DEFAULT_RIDE_SEARCH_TIMEOUT_SEC)
  );
  const searchExpiresAt = new Date(now.getTime() + searchTimeoutSec * 1000);

  const pickupAddress = sanitizeAddress(input.pickupAddress);
  const dropAddress = sanitizeAddress(input.dropAddress);
  if (!pickupAddress || !dropAddress) {
    throw Object.assign(new Error("Pickup and drop addresses are required"), { statusCode: 400 });
  }

  if (
    !Number.isFinite(input.pickupLat) ||
    !Number.isFinite(input.pickupLng) ||
    !Number.isFinite(input.dropLat) ||
    !Number.isFinite(input.dropLng)
  ) {
    throw Object.assign(new Error("Invalid pickup or drop coordinates"), { statusCode: 400 });
  }

  const outstandingFare = await findCustomerOutstandingRideFare(input.customerPk);
  if (outstandingFare) {
    throw Object.assign(
      new Error("Please clear your previous due ride fare before booking a new ride"),
      {
        statusCode: 409,
        code: "RIDE_FARE_DUE",
        outstandingOrderId: outstandingFare.orderId,
      }
    );
  }

  const bookedForSelf = input.bookedForSelf !== false;
  if (!bookedForSelf && !input.passengerName?.trim()) {
    throw Object.assign(new Error("Passenger name is required for guest booking"), {
      statusCode: 400,
    });
  }

  const estimatedFareInput = Math.max(0, Math.round(input.estimatedFare));
  const customerTipAmount = Math.max(0, Math.round(input.customerTipAmount ?? 0));
  if (!RIDE_TIP_AMOUNTS.has(customerTipAmount)) {
    throw Object.assign(new Error("Invalid tip amount"), { statusCode: 400 });
  }
  if (input.tripKm == null || !Number.isFinite(input.tripKm) || input.tripKm <= 0) {
    throw Object.assign(
      new Error("Trip route distance is required — refresh ride options and try again"),
      { statusCode: 400, code: "TRIP_DISTANCE_REQUIRED" }
    );
  }
  const distanceKm = await resolveDistanceKm(
    input.pickupLat,
    input.pickupLng,
    input.dropLat,
    input.dropLng,
    input.tripKm
  );

  const fareQuote = await quoteCustomerRideFare({
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    dropLat: input.dropLat,
    dropLng: input.dropLng,
    tripKm: distanceKm,
    catalogCode: input.rideType,
    pickupPincode: input.pickupPincode,
    pickupState: input.pickupState,
  });

  if (!fareQuote.ok) {
    throw Object.assign(new Error(fareQuote.message), {
      statusCode: 400,
      code: fareQuote.code,
    });
  }
  if (!fareQuote.eligible || fareQuote.finalFare <= 0) {
    throw Object.assign(
      new Error("This vehicle is not available for trips of this distance in your area"),
      { statusCode: 400, code: "VEHICLE_DISTANCE_EXCEEDED" }
    );
  }

  const serverFare = Math.round(fareQuote.finalFare);
  if (Math.abs(serverFare - estimatedFareInput) > 2) {
    throw Object.assign(
      new Error("Fare has changed. Please go back and refresh the ride options."),
      { statusCode: 400, code: "FARE_MISMATCH" }
    );
  }
  const estimatedFare = serverFare;

  let grandTotal = estimatedFare + customerTipAmount;
  let billingSnapshot: Record<string, unknown> | null = null;
  let billingRulesetVersion: number | null = null;
  let placementBillingForSnapshot: BillingResult | null = null;

  if (getEnv().BILLING_RULES_ENABLED) {
    const billRes = await computeBillForRide(db, {
      customerId: input.customerPk,
      rideFare: estimatedFare,
      distanceKm,
      pickupLat: input.pickupLat,
      pickupLng: input.pickupLng,
      dropLat: input.dropLat,
      dropLon: input.dropLng,
      tipAmount: customerTipAmount,
      pickupPincode: input.pickupPincode,
      pickupState: input.pickupState,
    });
    if (!billRes.ok) {
      throw Object.assign(new Error(billRes.message), {
        statusCode: 400,
        code: billRes.code,
      });
    }
    grandTotal = billRes.billing.final_amount;
    billingSnapshot = billRes.snapshot;
    billingRulesetVersion = billRes.billing.ruleset_version;
    placementBillingForSnapshot = billRes.billing;
  }

  const pickupWaitFreeMinutes = await resolveRidePickupFreeWaitMinutes({
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    rideType: input.rideType,
    checkoutMetadata: {
      pickupPincode: input.pickupPincode?.trim(),
      pickupState: input.pickupState?.trim(),
    },
  });
  const pickupWaitingChargePerMin = await resolveRidePickupWaitingChargePerMin({
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    rideType: input.rideType,
    checkoutMetadata: {
      pickupPincode: input.pickupPincode?.trim(),
      pickupState: input.pickupState?.trim(),
    },
  });

  const stateId = await resolveRideStateIdFromCoords({
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    pickupPincode: input.pickupPincode,
    pickupState: input.pickupState,
  });
  if (stateId) {
    const limits = await loadRideVehicleLimitsForState(stateId);
    if (limits.length > 0 &&
      !isCatalogOptionEligibleForTrip({
        catalogCode: input.rideType,
        tripKm: distanceKm,
        limits,
      })
    ) {
      throw Object.assign(
        new Error("This vehicle is not available for trips of this distance in your state"),
        { statusCode: 400, code: "VEHICLE_DISTANCE_EXCEEDED" }
      );
    }
  }

  const paymentMethodEnum = paymentMethodToEnum(input.paymentMethod);
  const vehicleType =
    input.vehicleTypeRequired?.trim() ||
    VEHICLE_TYPE_BY_RIDE[input.rideType] ||
    input.rideType;
  const stops = normalizeIntermediateStops(input.intermediateStops ?? []);
  const stopCols = rideStopColumns(stops);
  const passengerContact = await resolvePassengerContact(
    db,
    input.customerPk,
    input,
    bookedForSelf
  );

  const result = await db.transaction(async (tx) => {
    const seqResult = await tx.execute(
      sql`SELECT ('GM' || nextval('order_id_seq'))::text as order_id`
    );
    const seqRow = firstRow<{ order_id?: string }>(seqResult);
    const orderIdText = seqRow?.order_id?.trim();
    if (!orderIdText) throw new Error("Failed to generate order_id");

    const pickupOtp = generateFourDigitOtp();

    const [insertedCore] = await tx
      .insert(ordersCore)
      .values({
        orderId: orderIdText,
        orderType: "person_ride",
        orderSource: "internal",
        customerId: input.customerPk,
        status: "assigned",
        currentStatus: "SEARCHING_RIDER",
        pickupOtp,
        pickupAddressRaw: pickupAddress,
        pickupLat: String(input.pickupLat),
        pickupLon: String(input.pickupLng),
        dropAddressRaw: dropAddress,
        dropLat: String(input.dropLat),
        dropLon: String(input.dropLng),
        deliveryAddress: dropAddress,
        deliveryLatitude: String(input.dropLat),
        deliveryLongitude: String(input.dropLng),
        distanceKm: String(distanceKm),
        fareAmount: String(estimatedFare),
        grandTotal: String(grandTotal),
        tipAmount: customerTipAmount > 0 ? String(customerTipAmount) : "0",
        itemTotal: String(estimatedFare),
        addonTotal: "0",
        billingSnapshot: billingSnapshot ?? undefined,
        billingRulesetVersion: billingRulesetVersion ?? undefined,
        placedAt: now,
        paymentStatus: "pending",
        paymentMethod: paymentMethodEnum,
        deliveryType: "delivery",
        checkoutMetadata: {
          serviceType: "RIDE",
          rideType: input.rideType,
          vehicleTypeRequired: vehicleType,
          searchTimeoutSec,
          pickupLabel: resolveRideAddressDisplayLabel({
            label: input.pickupLabel,
            fullAddress: pickupAddress,
            defaultLabel: pickupAddress,
          }),
          dropLabel: resolveRideAddressDisplayLabel({
            label: input.dropLabel,
            fullAddress: dropAddress,
            defaultLabel: dropAddress,
          }),
          pickupFullAddress: pickupAddress,
          dropFullAddress: dropAddress,
          routeDistanceKm: distanceKm,
          tripKm: distanceKm,
          pickupPincode: input.pickupPincode?.trim() || undefined,
          pickupState: input.pickupState?.trim() || undefined,
          pickupWaitFreeMinutes,
          estimatedFare,
          ...(fareQuote.waitingChargeNote
            ? { waitingChargeNote: fareQuote.waitingChargeNote }
            : {}),
          ...(pickupWaitingChargePerMin > 0
            ? { pickupWaitingChargePerMin }
            : {}),
        },
      })
      .returning({
        id: ordersCore.id,
        createdAt: ordersCore.createdAt,
        formattedOrderId: ordersCore.formattedOrderId,
      });

    const orderCorePk = insertedCore?.id;
    if (orderCorePk == null) throw new Error("orders_core insert failed");

    await tx.insert(ordersRide).values({
      orderId: orderCorePk,
      passengerName: passengerContact.passengerName,
      passengerPhone: passengerContact.passengerPhone,
      passengerCount: 1,
      bookedForSelf,
      pickupDistanceFromBookerKm:
        input.pickupDistanceFromBookerKm != null
          ? String(input.pickupDistanceFromBookerKm)
          : undefined,
      farPickupPromptShown: input.farPickupPromptShown === true,
      farPickupAcknowledged: input.farPickupAcknowledged === true,
      intermediateStops: stops,
      pickupAddress: pickupAddress,
      pickupLat: coordString(input.pickupLat),
      pickupLon: coordString(input.pickupLng),
      dropAddress: dropAddress,
      dropLat: coordString(input.dropLat),
      dropLon: coordString(input.dropLng),
      stop1Address: stopCols.stop1Address,
      stop1Lat: stopCols.stop1Lat,
      stop1Lon: stopCols.stop1Lon,
      stop2Address: stopCols.stop2Address,
      stop2Lat: stopCols.stop2Lat,
      stop2Lon: stopCols.stop2Lon,
      pickupOtp,
      rideType: input.rideType,
      vehicleTypeRequired: vehicleType,
      estimatedFare: String(estimatedFare),
      customerTipAmount: String(customerTipAmount),
      prebookTipAmount: String(customerTipAmount),
      tipBoostApplied: customerTipAmount > 0,
      higherDispatchPriority: customerTipAmount > 0,
      amountCollected: "0",
      currency: "INR",
      paymentMethod: paymentMethodEnum,
      searchStartedAt: now,
      searchExpiresAt,
    });

    await appendOrderTimeline(tx as PostgresJsDatabase<Record<string, unknown>>, {
      orderCorePk,
      status: "SEARCHING_RIDER",
      previousStatus: null,
      actorType: "customer",
      actorId: input.customerPk,
      statusMessage: "Ride booked — searching for rider",
      occurredAt: now,
      metadata: { rideType: input.rideType, estimatedFare, customerTipAmount },
    });

    return {
      orderId: orderIdText,
      formattedOrderId: insertedCore?.formattedOrderId ?? null,
      coreOrderId: orderCorePk,
      createdAt: insertedCore.createdAt ?? now,
      pickupOtp,
    };
  });

  void maybeStartOrderDispatch(result.coreOrderId);

  const bookingBilling: BillingResult =
    placementBillingForSnapshot ??
    ({
      item_total: estimatedFare,
      addon_total: 0,
      discount_total: 0,
      delivery_fee: 0,
      delivery_fee_gross: 0,
      delivery_subsidy: 0,
      platform_fee: 0,
      packaging_fee: 0,
      surge_fee: 0,
      small_order_fee: 0,
      convenience_fee: 0,
      misc_fee: 0,
      tax_total: 0,
      tip_amount: customerTipAmount,
      donation_amount: 0,
      final_amount: grandTotal,
      items_net_after_discounts: estimatedFare,
      taxes_by_group: {},
      gst_components: {
        items: { original: estimatedFare, discount: 0, taxable_value: estimatedFare, gst: 0 },
        delivery: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
        platform: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
        surge: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
        packaging: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
        small_order: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
        convenience: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
        subscription: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
      },
      gst_totals: { total_discount: 0, total_tax: 0, final_payable: grandTotal },
      charges: [],
      discounts: [],
      taxes: [],
      breakdown_steps: [],
      ruleset_version: billingRulesetVersion ?? 1,
      eligible_subtotal: estimatedFare,
      order_line_eligibility: [
        {
          menuItemId: "ride",
          lineTotal: estimatedFare,
          quantity: 1,
          isDiscountEligible: true,
          ineligibilityReason: null,
        },
      ],
      order_line_pricing: [
        {
          menuItemId: "ride",
          quantity: 1,
          catalogLineTotal: estimatedFare,
          effectiveLineTotal: estimatedFare,
          offerDiscountAmount: 0,
          appliedOfferId: null,
          appliedOfferLabel: null,
          appliedOfferType: null,
          // Offer engine's per-item discount modifiers (allset merge). A ride
          // is a single fare with no per-item offer applicability, so null.
          appliedOfferDiscountPct: null,
          appliedOfferDiscountFlat: null,
          isDiscountEligible: true,
          ineligibilityReason: null,
        },
      ],
    } satisfies BillingResult);

  void insertRideCustomerPaymentSnapshot(db, {
    orderCoreId: result.coreOrderId,
    orderIdText: result.orderId,
    customerId: input.customerPk,
    phase: "booking",
    billing: bookingBilling,
    billingSnapshot: billingSnapshot ?? {
      ride_fare: estimatedFare,
      final_amount: grandTotal,
    },
    rideContext: {
      rideType: input.rideType,
      pickupAddress,
      dropAddress,
      distanceKm,
    },
    paymentContext: { paymentMethod: paymentMethodEnum },
  });

  return {
    orderId: result.orderId,
    formattedOrderId: result.formattedOrderId,
    coreOrderId: result.coreOrderId,
    status: "SEARCHING_RIDER",
    totalAmount: grandTotal,
    searchTimeoutSec,
    searchExpiresAt: searchExpiresAt.toISOString(),
    createdAt: (result.createdAt instanceof Date
      ? result.createdAt
      : new Date(result.createdAt)
    ).toISOString(),
    pickupOtp: result.pickupOtp,
  };
}

export async function cancelRideOrder(input: CancelRideOrderInput): Promise<{
  orderId: string;
  status: string;
}> {
  const db = getDb();
  const [row] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      status: ordersCore.status,
      riderId: ordersCore.riderId,
    })
    .from(ordersCore)
    .where(customerOrderRefWhere(input.customerPk, input.orderRef))
    .limit(1);

  if (!row?.id || !row.orderId) {
    throw Object.assign(new Error("Ride order not found"), { statusCode: 404 });
  }

  return cancelRideOrderForRow(
    { id: row.id, orderId: row.orderId, status: row.status, riderId: row.riderId },
    {
    customerPk: input.customerPk,
    reasonCode: input.reasonCode,
    reasonText: input.reasonText,
    cancelMode: input.cancelMode,
    cancelledByType: input.cancelledByType,
  });
}

/** System auto-cancel when search_expires_at passes (background job). */
export async function autoCancelExpiredRideOrder(orderCorePk: number): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      status: ordersCore.status,
      riderId: ordersCore.riderId,
    })
    .from(ordersCore)
    .where(and(eq(ordersCore.id, orderCorePk), eq(ordersCore.orderType, "person_ride")))
    .limit(1);

  if (!row?.id || !row.orderId) return false;

  await cancelRideOrderForRow(
    { id: row.id, orderId: row.orderId, status: row.status, riderId: row.riderId },
    {
    customerPk: null,
    cancelledByType: "system",
    cancelMode: "timeout",
  });
  return true;
}

async function cancelRideOrderForRow(
  row: { id: number; orderId: string; status: string | null; riderId: number | null },
  input: {
    customerPk: number | null;
    reasonCode?: string;
    reasonText?: string | null;
    cancelMode?: "manual" | "auto" | "timeout";
    cancelledByType?: "customer" | "system";
  }
): Promise<{ orderId: string; status: string }> {
  const db = getDb();
  const sqlClient = getSql();
  const now = new Date();
  const cancelMode = input.cancelMode ?? "manual";
  const cancelledByType =
    input.cancelledByType ?? (cancelMode === "timeout" ? "system" : "customer");
  const reasonCode =
    input.reasonCode?.trim() ||
    (cancelMode === "timeout"
      ? RIDE_SEARCH_TIMEOUT_REASON_CODE
      : "CUSTOMER_CANCELLED");
  const reasonText =
    input.reasonText?.trim() ||
    (cancelMode === "timeout"
      ? RIDE_SEARCH_TIMEOUT_REASON_TEXT
      : "Customer cancelled ride");

  const status = String(row.status ?? "");
  if (status === "cancelled") {
    return { orderId: row.orderId, status: "CANCELLED" };
  }
  if (!CANCELLABLE_STATUSES.has(status)) {
    throw Object.assign(new Error("Ride cannot be cancelled in current status"), {
      statusCode: 409,
    });
  }
  if (row.riderId != null && cancelMode === "timeout") {
    throw Object.assign(new Error("Rider already assigned"), { statusCode: 409 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(ordersCore)
      .set({
        status: "cancelled",
        currentStatus: "CANCELLED",
        cancelledAt: now,
        cancelledBy: cancelledByType === "system" ? "SYSTEM" : "customer",
        cancelledById: cancelledByType === "customer" ? input.customerPk : null,
        updatedAt: now,
      })
      .where(eq(ordersCore.id, row.id));

    await tx
      .update(ordersRide)
      .set({
        cancelledByType,
        cancelledAt: now,
        cancellationReasonCode: reasonCode,
        cancellationReasonText: reasonText,
        cancelMode,
        updatedAt: now,
      })
      .where(eq(ordersRide.orderId, row.id));
  });

  await recordOrderCancellation(sqlClient, {
    orderCorePk: row.id,
    cancelledBy: cancelledByType === "system" ? "SYSTEM" : "customer",
    cancelledById: cancelledByType === "customer" ? input.customerPk : null,
    reasonCode:
      cancelMode === "timeout" ? "AUTO_CANCELLED" : reasonCode,
    reasonText,
    previousStatus: status,
    displayReason:
      cancelMode === "timeout" ? RIDE_SEARCH_TIMEOUT_DISPLAY_REASON : reasonText,
    cancelledByType,
    cancelledByLabel:
      cancelMode === "timeout" ? RIDE_SEARCH_TIMEOUT_DISPLAY_REASON : "Customer",
    cancelMode: cancelMode === "timeout" ? "auto" : cancelMode,
    actionSource: cancelMode === "timeout" ? "ride_search_timeout" : "ride_search",
    metadata: { serviceType: "person_ride", cancelMode, timeout: cancelMode === "timeout" },
  });

  await appendOrderTimeline(db as PostgresJsDatabase<Record<string, unknown>>, {
    orderCorePk: row.id,
    status: "CANCELLED",
    previousStatus: status.toUpperCase(),
    actorType: cancelledByType === "system" ? "system" : "customer",
    actorId: cancelledByType === "customer" ? input.customerPk : null,
    statusMessage: reasonText,
    occurredAt: now,
    metadata: { reasonCode, cancelMode, displayReason: reasonCode },
  });

  return { orderId: row.orderId, status: "CANCELLED" };
}

export async function getRideOrderForCustomer(
  customerPk: number,
  orderRef: string
): Promise<{
  orderId: string;
  coreOrderId: number;
  status: string;
  appStatus: string;
  riderId: number | null;
  riderAssigned: boolean;
  rider: CustomerAssignedRiderProfile | null;
  totalAmount: number;
  searchExpiresAt: string | null;
  cancelled: boolean;
  pickupOtp: string | null;
  rideStarted: boolean;
  riderReachedPickupAt: string | null;
  pickupOtpVerifiedAt: string | null;
  pickupWaitSeconds: number | null;
  pickupWaitFreeMinutes: number;
  pickupWaitingChargePerMin: number;
  estimatedPickupWaitingCharge: number;
  awaitingTipBoost: boolean;
  dispatchRetryCount: number;
  dispatchDeclinedCount: number;
  customerTipAmount: number;
  prebookTipAmount: number;
  searchBoostTip1: number;
  searchBoostTip2: number;
  estimatedFare: number;
} | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      riderId: ordersCore.riderId,
      grandTotal: ordersCore.grandTotal,
      pickupOtp: ordersCore.pickupOtp,
      checkoutMetadata: ordersCore.checkoutMetadata,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
    })
    .from(ordersCore)
    .where(
      and(customerOrderRefWhere(customerPk, orderRef), eq(ordersCore.orderType, "person_ride"))
    )
    .limit(1);

  if (!row?.id || !row.orderId) return null;

  const [rideRow] = await db
    .select({
      searchExpiresAt: ordersRide.searchExpiresAt,
      assignedRiderId: ordersRide.assignedRiderId,
      cancelledAt: ordersRide.cancelledAt,
      pickupOtpVerifiedAt: ordersRide.pickupOtpVerifiedAt,
      riderReachedPickupAt: ordersRide.riderReachedPickupAt,
      pickupWaitSeconds: ordersRide.pickupWaitSeconds,
      rideType: ordersRide.rideType,
      awaitingTipBoost: ordersRide.awaitingTipBoost,
      dispatchRetryCount: ordersRide.dispatchRetryCount,
      customerTipAmount: ordersRide.customerTipAmount,
      prebookTipAmount: ordersRide.prebookTipAmount,
      searchBoostTip1: ordersRide.searchBoostTip1,
      searchBoostTip2: ordersRide.searchBoostTip2,
      estimatedFare: ordersRide.estimatedFare,
    })
    .from(ordersRide)
    .where(eq(ordersRide.orderId, row.id))
    .limit(1);

  const dbStatus = String(row.status ?? "assigned");
  const pickupOtpVerified = rideRow?.pickupOtpVerifiedAt != null;
  const riderReachedPickupAt = rideRow?.riderReachedPickupAt?.toISOString?.() ?? null;
  const pickupOtpVerifiedAt = rideRow?.pickupOtpVerifiedAt?.toISOString?.() ?? null;
  const pickupWaitSeconds =
    rideRow?.pickupWaitSeconds != null ? Math.max(0, Number(rideRow.pickupWaitSeconds) || 0) : null;
  const pickupWaitFreeMinutes = await resolveRidePickupFreeWaitMinutes({
    checkoutMetadata: row.checkoutMetadata,
    pickupLat: Number(row.pickupLat),
    pickupLng: Number(row.pickupLon),
    rideType: rideRow?.rideType,
  });
  const pickupWaitingChargePerMin = await resolveRidePickupWaitingChargePerMin({
    checkoutMetadata: row.checkoutMetadata,
    pickupLat: Number(row.pickupLat),
    pickupLng: Number(row.pickupLon),
    rideType: rideRow?.rideType,
  });
  const freeBudgetSec = Math.max(0, Math.round(pickupWaitFreeMinutes * 60));
  let estimatedPickupWaitingCharge = 0;
  if (pickupWaitingChargePerMin > 0) {
    let billableSec = 0;
    if (pickupWaitSeconds != null) {
      billableSec = Math.max(0, pickupWaitSeconds - freeBudgetSec);
    } else if (riderReachedPickupAt && !pickupOtpVerifiedAt) {
      const startMs = new Date(riderReachedPickupAt).getTime();
      if (Number.isFinite(startMs)) {
        const elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
        billableSec = Math.max(0, elapsed - freeBudgetSec);
      }
    }
    if (billableSec > 0) {
      estimatedPickupWaitingCharge =
        Math.round(Math.ceil(billableSec / 60) * pickupWaitingChargePerMin * 10) / 10;
    }
  }
  const riderId = row.riderId ?? rideRow?.assignedRiderId ?? null;
  const cancelled = dbStatus === "cancelled" || rideRow?.cancelledAt != null;
  const rideStarted =
    dbStatus === "picked_up" ||
    dbStatus === "in_transit" ||
    dbStatus === "delivered";

  let appStatus = "SEARCHING_RIDER";
  if (cancelled) appStatus = "CANCELLED";
  else if (rideStarted) appStatus = "RIDE_IN_PROGRESS";
  else if (
    riderReachedPickupAt ||
    dbStatus === "reached_user" ||
    (pickupOtpVerified && String(row.currentStatus ?? "").toUpperCase() === "RIDER_AT_PICKUP")
  )
    appStatus = "RIDER_AT_PICKUP";
  else if (
    riderId != null ||
    dbStatus === "accepted" ||
    dbStatus === "reached_store"
  )
    appStatus = "RIDER_ASSIGNED";
  else if (dbStatus === "delivered") appStatus = "DELIVERED";

  const dispatchDeclinedCount = await countDispatchDeclinedForOrder(row.orderId);

  const riderProfile =
    riderId != null
      ? await loadCustomerAssignedRiderProfile(Number(riderId), {
          rideTypeFallback: rideRow?.rideType ?? null,
        })
      : null;

  return {
    orderId: row.orderId,
    coreOrderId: row.id,
    status: String(row.currentStatus ?? dbStatus),
    appStatus,
    riderId: riderId != null ? Number(riderId) : null,
    riderAssigned: riderId != null,
    rider: riderProfile,
    totalAmount: Number(row.grandTotal ?? 0),
    searchExpiresAt: rideRow?.searchExpiresAt?.toISOString?.() ?? null,
    cancelled,
    pickupOtp: row.pickupOtp?.trim() || null,
    rideStarted,
    riderReachedPickupAt,
    pickupOtpVerifiedAt,
    pickupWaitSeconds,
    pickupWaitFreeMinutes,
    pickupWaitingChargePerMin,
    estimatedPickupWaitingCharge,
    awaitingTipBoost: rideRow?.awaitingTipBoost === true,
    dispatchRetryCount: Number(rideRow?.dispatchRetryCount ?? 0),
    dispatchDeclinedCount,
    customerTipAmount: Number(rideRow?.customerTipAmount ?? 0),
    prebookTipAmount: Number(rideRow?.prebookTipAmount ?? 0),
    searchBoostTip1: Number(rideRow?.searchBoostTip1 ?? 0),
    searchBoostTip2: Number(rideRow?.searchBoostTip2 ?? 0),
    estimatedFare: Number(rideRow?.estimatedFare ?? 0),
  };
}

export async function resolveCustomerPkFromSub(sub: string): Promise<number | null> {
  const db = getDb();
  const [customerRow] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerId, sub))
    .limit(1);
  return customerRow?.id ?? null;
}
