/**
 * Parcel order placement — customer courier booking → orders_core + orders_parcel + dispatch.
 */

import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb, getSql } from "../../db/client.js";
import { customers, ordersCore, ordersParcel } from "../../db/schema.js";
import { appendOrderTimeline } from "../../lib/order-placement-timeline.js";
import { maybeStartOrderDispatch } from "../../lib/order-dispatch.service.js";
import { generateFourDigitOtp } from "../../lib/food-order-otps.js";
import { recordOrderCancellation } from "../../lib/record-order-cancellation.js";
import { customerOrderRefWhere } from "../../lib/order-ref-resolve.js";
import { quoteParcelVehicleFare } from "./parcelQuote.service.js";
import { computeBillForParcel } from "../billing/parcelBilling.service.js";
import type { RideVehiclePricingType } from "../rider-payout-pricing/types.js";
import {
  assertCustomerServiceNotBlocked,
  CUSTOMER_SERVICE_BLOCKED_CODE,
} from "../../lib/customer-service-blocks.js";
import { notifyCustomerParcelLifecycle } from "../../lib/customer-lifecycle-notify.js";

export const DEFAULT_PARCEL_SEARCH_TIMEOUT_SEC = 4 * 60;

const CANCELLABLE_STATUSES = new Set(["assigned", "accepted"]);

const VEHICLE_TYPE_BY_CATEGORY: Record<string, string> = {
  "2_wheeler": "two_wheeler",
  "3_wheeler": "auto",
  "4_wheeler_non_ac": "cab",
};

/** Category capacity defaults (matches customer book-screen capacity row). */
const PACKAGE_DEFAULTS_BY_CATEGORY: Record<
  string,
  { weightKg: string; lengthCm: string; widthCm: string; heightCm: string }
> = {
  "2_wheeler": { weightKg: "20", lengthCm: "40", widthCm: "40", heightCm: "40" },
  "3_wheeler": { weightKg: "100", lengthCm: "150", widthCm: "130", heightCm: "130" },
  "4_wheeler_non_ac": { weightKg: "200", lengthCm: "220", widthCm: "140", heightCm: "180" },
};

function resolveParcelPackageDims(input: {
  vehicleCategory: string;
  weightKg?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
}): { weightKg: string; lengthCm: string; widthCm: string; heightCm: string } {
  const defaults =
    PACKAGE_DEFAULTS_BY_CATEGORY[input.vehicleCategory] ??
    PACKAGE_DEFAULTS_BY_CATEGORY["2_wheeler"];
  const numOrDefault = (v: number | null | undefined, fallback: string) =>
    v != null && Number.isFinite(v) && v > 0 ? String(Math.round(v * 100) / 100) : fallback;
  return {
    weightKg: numOrDefault(input.weightKg, defaults.weightKg),
    lengthCm: numOrDefault(input.lengthCm, defaults.lengthCm),
    widthCm: numOrDefault(input.widthCm, defaults.widthCm),
    heightCm: numOrDefault(input.heightCm, defaults.heightCm),
  };
}

export type PlaceParcelOrderInput = {
  customerPk: number;
  pickupAddress: string;
  pickupLabel?: string | null;
  pickupLat: number;
  pickupLng: number;
  dropAddress: string;
  dropLabel?: string | null;
  dropLat: number;
  dropLng: number;
  vehicleCategory: string;
  estimatedFare: number;
  tripKm?: number | null;
  payAt?: "pickup" | "drop";
  receiverName: string;
  receiverMobile: string;
  paymentMethod?: "cash" | "cod" | "online";
  couponCode?: string | null;
  selectedPlatformOfferId?: number | null;
  forceNoAutoOffer?: boolean;
  offerSnapshot?: Record<string, unknown> | null;
  appliedOfferDiscount?: number | null;
  weightKg?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
};

export type PlaceParcelOrderResult = {
  orderId: string;
  formattedOrderId: string | null;
  coreOrderId: number;
  status: string;
  totalAmount: number;
  searchTimeoutSec: number;
  searchExpiresAt: string;
  createdAt: string;
  pickupOtp: string;
};

function sanitizeAddress(value: string): string {
  return value.trim().replace(/\s+/g, " ");
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

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) * 100) / 100;
}

function toIso(value: Date | string | null | undefined, fallback: Date): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return fallback.toISOString();
}

function coordString(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

export async function placeParcelOrder(input: PlaceParcelOrderInput): Promise<PlaceParcelOrderResult> {
  const parcelBlock = await assertCustomerServiceNotBlocked(input.customerPk, "parcel");
  if (parcelBlock.blocked) {
    throw Object.assign(new Error(parcelBlock.reason), {
      statusCode: 403,
      code: CUSTOMER_SERVICE_BLOCKED_CODE,
    });
  }

  const pickupAddress = sanitizeAddress(input.pickupAddress);
  const dropAddress = sanitizeAddress(input.dropAddress);
  if (!pickupAddress || !dropAddress) {
    throw Object.assign(new Error("Pickup and drop addresses are required"), { statusCode: 400 });
  }
  const receiverName = input.receiverName.trim();
  const receiverMobile = input.receiverMobile.replace(/\D/g, "").slice(-10);
  if (!receiverName || receiverMobile.length !== 10) {
    throw Object.assign(new Error("Valid receiver name and 10-digit mobile are required"), {
      statusCode: 400,
    });
  }

  const category = (input.vehicleCategory || "2_wheeler").trim();
  const pricingVehicle = (
    category === "3_wheeler" || category === "4_wheeler_non_ac" ? category : "2_wheeler"
  ) as RideVehiclePricingType;

  const distanceKm =
    input.tripKm != null && Number.isFinite(input.tripKm) && input.tripKm > 0
      ? Math.round(input.tripKm * 100) / 100
      : haversineKm(input.pickupLat, input.pickupLng, input.dropLat, input.dropLng);

  let fare = Math.max(0, Number(input.estimatedFare) || 0);
  let fareQuoteMeta: Record<string, unknown> | null = null;
  try {
    const quote = await quoteParcelVehicleFare({
      pickupLat: input.pickupLat,
      pickupLng: input.pickupLng,
      tripKm: distanceKm,
      vehicleType: pricingVehicle,
    });
    if (quote.ok && quote.eligible && quote.finalFare > 0) {
      fare = Math.round(quote.finalFare);
      fareQuoteMeta = {
        baseFare: quote.baseFare,
        distanceFare: quote.distanceFare,
        finalFare: quote.finalFare,
        pricingGeoLevel: quote.pricingGeoLevel,
        pricingGeoRefId: quote.pricingGeoRefId,
      };
    }
  } catch {
    /* keep client fare */
  }
  if (!(fare > 0)) {
    throw Object.assign(new Error("Could not price this parcel trip"), { statusCode: 400 });
  }

  const searchTimeoutSec = DEFAULT_PARCEL_SEARCH_TIMEOUT_SEC;
  const now = new Date();
  const searchExpiresAt = new Date(now.getTime() + searchTimeoutSec * 1000);
  const paymentMethod = input.paymentMethod === "online" ? "online" : "cash";
  const vehicleType = VEHICLE_TYPE_BY_CATEGORY[category] ?? "two_wheeler";
  const pickupOtp = generateFourDigitOtp();
  const deliveryOtp = generateFourDigitOtp();
  const payAt = paymentMethod === "online" ? null : input.payAt === "drop" ? "drop" : "pickup";
  const pickupLabel = input.pickupLabel?.trim() || pickupAddress;
  const dropLabel = input.dropLabel?.trim() || dropAddress;
  const couponCode = input.couponCode?.trim() || null;
  const platformOfferId =
    input.selectedPlatformOfferId != null && Number.isFinite(input.selectedPlatformOfferId)
      ? Math.trunc(input.selectedPlatformOfferId)
      : null;
  const appliedOfferDiscount = Math.max(0, Number(input.appliedOfferDiscount) || 0);
  const offerSnapshot =
    input.offerSnapshot && typeof input.offerSnapshot === "object"
      ? input.offerSnapshot
      : couponCode || platformOfferId
        ? {
            couponCode,
            platformOfferId,
            appliedOfferDiscount,
          }
        : {};

  const db = getDb();

  // Backend-authoritative bill: run the PARCEL charge/tax/offer pipeline over the slab fare.
  // The slab `fare` is the base; grandTotal = pipeline final_amount (platform/booking fee,
  // surge, GST, and geo-mapped platform offers/coupons). The offer discount is computed
  // server-side here — never trusted from the client.
  let grandTotal = fare;
  let backendOfferDiscount = appliedOfferDiscount;
  let billingSnapshot: Record<string, unknown> | null = null;
  try {
    const bill = await computeBillForParcel(db, {
      customerId: input.customerPk,
      parcelFare: fare,
      distanceKm,
      pickupLat: input.pickupLat,
      pickupLng: input.pickupLng,
      couponCode,
      selectedPlatformOfferId: platformOfferId,
      forceNoAutoOffer: input.forceNoAutoOffer === true,
      vehicleType: category,
      paymentMode: paymentMethod,
    });
    if (bill.ok) {
      grandTotal = Math.max(0, Math.round(Number(bill.billing.final_amount) * 100) / 100);
      backendOfferDiscount = Math.max(0, Math.round(Number(bill.billing.discount_total) * 100) / 100);
      billingSnapshot = bill.snapshot;
      if (billingSnapshot && typeof billingSnapshot === "object") {
        if (platformOfferId != null && platformOfferId > 0) {
          billingSnapshot.parcel_platform_offer_id = platformOfferId;
        }
        if (input.forceNoAutoOffer === true && platformOfferId == null) {
          billingSnapshot.parcel_force_no_auto_offer = true;
        }
      }
    }
  } catch {
    /* fail-open: keep the slab fare as the total if the billing pipeline errors */
  }

  const [customerRow] = await db
    .select({
      name: customers.fullName,
      phone: customers.primaryMobile,
    })
    .from(customers)
    .where(eq(customers.id, input.customerPk))
    .limit(1);

  const senderName = customerRow?.name?.trim() || null;
  const senderMobile = customerRow?.phone?.replace(/\D/g, "").slice(-10) || null;

  const packageDims = resolveParcelPackageDims({
    vehicleCategory: category,
    weightKg: input.weightKg,
    lengthCm: input.lengthCm,
    widthCm: input.widthCm,
    heightCm: input.heightCm,
  });

  const placementSnapshot = {
    serviceType: "PARCEL",
    vehicleCategory: category,
    vehicleTypeRequired: vehicleType,
    paymentMethod,
    payAt,
    estimatedFare: fare,
    tripKm: distanceKm,
    searchTimeoutSec,
    searchExpiresAt: searchExpiresAt.toISOString(),
    pickupLabel,
    dropLabel,
    receiverName,
    receiverMobile,
    couponCode,
    platformOfferId,
    forceNoAutoOffer: input.forceNoAutoOffer === true,
    appliedOfferDiscount: backendOfferDiscount,
    packageDims,
    fareQuote: fareQuoteMeta,
  };

  const result = await db.transaction(async (tx) => {
    const seqResult = await tx.execute(
      sql`SELECT ('GM' || nextval('order_id_seq'))::text as order_id`
    );
    const seqRow = firstRow<{ order_id?: string }>(seqResult);
    const orderIdText = seqRow?.order_id?.trim();
    if (!orderIdText) throw new Error("Failed to generate order_id");

    let insertedCore: {
      id: number;
      createdAt: Date | null;
      formattedOrderId: string | null;
    } | undefined;

    try {
      const [row] = await tx
        .insert(ordersCore)
        .values({
          orderId: orderIdText,
          orderType: "parcel",
          orderSource: "internal",
          customerId: input.customerPk,
          status: "assigned",
          currentStatus: "SEARCHING_RIDER",
          pickupOtp,
          deliveryOtp,
          pickupAddressRaw: pickupAddress,
          pickupLat: coordString(input.pickupLat),
          pickupLon: coordString(input.pickupLng),
          dropAddressRaw: dropAddress,
          dropLat: coordString(input.dropLat),
          dropLon: coordString(input.dropLng),
          deliveryAddress: dropAddress,
          deliveryLatitude: coordString(input.dropLat),
          deliveryLongitude: coordString(input.dropLng),
          deliveryPrimaryContactName: receiverName,
          deliveryPrimaryContactPhone: receiverMobile,
          distanceKm: String(distanceKm),
          fareAmount: String(fare),
          grandTotal: String(grandTotal),
          tipAmount: "0",
          itemTotal: String(fare),
          addonTotal: "0",
          billingSnapshot: billingSnapshot ?? undefined,
          placedAt: now,
          paymentStatus: "pending",
          paymentMethod,
          deliveryType: "delivery",
          checkoutMetadata: {
            ...placementSnapshot,
            pickupFullAddress: pickupAddress,
            dropFullAddress: dropAddress,
            routeDistanceKm: distanceKm,
            offerSnapshot,
            billingSnapshot,
          },
        })
        .returning({
          id: ordersCore.id,
          createdAt: ordersCore.createdAt,
          formattedOrderId: ordersCore.formattedOrderId,
        });
      insertedCore = row;
    } catch (e) {
      const cause = (e as { cause?: { code?: string; message?: string } })?.cause;
      const msg = String(cause?.message || (e as Error).message || "");
      if (cause?.code === "23505" || /duplicate key|unique constraint/i.test(msg)) {
        throw Object.assign(new Error("Could not place parcel — please try again"), {
          statusCode: 409,
          code: "ORDER_ID_CONFLICT",
          cause: e,
        });
      }
      throw e;
    }

    const orderCorePk = insertedCore?.id;
    if (orderCorePk == null) throw new Error("orders_core insert failed");

    await tx.insert(ordersParcel).values({
      orderId: orderCorePk,
      parcelType: category,
      vehicleCategory: category,
      vehicleTypeRequired: vehicleType,
      weightKg: packageDims.weightKg,
      lengthCm: packageDims.lengthCm,
      widthCm: packageDims.widthCm,
      heightCm: packageDims.heightCm,
      receiverName,
      receiverMobile,
      senderName,
      senderMobile,
      pickupLabel,
      pickupAddress,
      pickupLat: coordString(input.pickupLat),
      pickupLon: coordString(input.pickupLng),
      dropLabel,
      dropAddress,
      dropLat: coordString(input.dropLat),
      dropLon: coordString(input.dropLng),
      paymentMethod,
      payAt,
      isCod: paymentMethod === "cash",
      codAmount: paymentMethod === "cash" ? String(grandTotal) : null,
      estimatedFare: String(fare),
      finalFare: String(grandTotal),
      tripDistanceKm: String(distanceKm),
      currency: "INR",
      amountCollected: "0",
      couponCode,
      platformOfferId,
      offerSnapshot,
      appliedOfferDiscount: String(backendOfferDiscount),
      pickupOtp,
      deliveryOtp,
      searchStartedAt: now,
      searchExpiresAt,
      searchTimeoutSec,
      requiresOtpVerification: true,
      instructions: [
        `Receiver: ${receiverName} (+91 ${receiverMobile})`,
        paymentMethod === "cash" ? `Pay at ${payAt}` : "Paid online",
        couponCode ? `Coupon: ${couponCode}` : null,
      ]
        .filter(Boolean)
        .join("; "),
      placementSnapshot,
    });

    await appendOrderTimeline(tx as PostgresJsDatabase<Record<string, unknown>>, {
      orderCorePk,
      status: "SEARCHING_RIDER",
      previousStatus: null,
      actorType: "customer",
      actorId: input.customerPk,
      statusMessage: "Parcel booked — searching for rider",
      occurredAt: now,
      metadata: {
        vehicleCategory: category,
        estimatedFare: fare,
        payAt,
        paymentMethod,
        couponCode,
        platformOfferId,
      },
    });

    return {
      orderId: orderIdText,
      formattedOrderId: insertedCore?.formattedOrderId ?? null,
      coreOrderId: orderCorePk,
      status: "SEARCHING_RIDER",
      totalAmount: grandTotal,
      searchTimeoutSec,
      searchExpiresAt: searchExpiresAt.toISOString(),
      createdAt: toIso(insertedCore?.createdAt, now),
      pickupOtp,
    };
  });

  void maybeStartOrderDispatch(result.coreOrderId).catch(() => undefined);
  void notifyCustomerParcelLifecycle({
    orderIdText: result.orderId,
    templateCode: "PARCEL_ACCEPTED",
  });
  return result;
}

export async function getParcelOrderForCustomer(args: {
  customerPk: number;
  orderRef: string;
}): Promise<{
  orderId: string;
  coreOrderId: number;
  status: string;
  riderAssigned: boolean;
  totalAmount: number;
  cancelled: boolean;
} | null> {
  const db = getDb();
  const ref = args.orderRef.trim();
  const [row] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      riderId: ordersCore.riderId,
      grandTotal: ordersCore.grandTotal,
      customerId: ordersCore.customerId,
      cancelledAt: ordersCore.cancelledAt,
    })
    .from(ordersCore)
    .where(eq(ordersCore.orderId, ref))
    .limit(1);

  if (!row || row.customerId !== args.customerPk) return null;
  return {
    orderId: row.orderId ?? ref,
    coreOrderId: row.id,
    status: row.currentStatus ?? row.status,
    riderAssigned: row.riderId != null,
    totalAmount: Number(row.grandTotal ?? 0),
    cancelled: row.cancelledAt != null || String(row.status).includes("cancel"),
  };
}

export type CancelParcelOrderInput = {
  customerPk: number;
  orderRef: string;
  reasonCode?: string;
  reasonText?: string | null;
  cancelMode?: "manual" | "auto" | "timeout";
  cancelledByType?: "customer" | "system";
};

export async function cancelParcelOrder(input: CancelParcelOrderInput): Promise<{
  orderId: string;
  status: string;
}> {
  const db = getDb();
  const sqlClient = getSql();
  const [row] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      status: ordersCore.status,
      riderId: ordersCore.riderId,
      orderType: ordersCore.orderType,
    })
    .from(ordersCore)
    .where(
      and(customerOrderRefWhere(input.customerPk, input.orderRef), eq(ordersCore.orderType, "parcel"))
    )
    .limit(1);

  if (!row?.id || !row.orderId) {
    throw Object.assign(new Error("Parcel order not found"), { statusCode: 404 });
  }

  const now = new Date();
  const cancelMode = input.cancelMode ?? "manual";
  const cancelledByType =
    input.cancelledByType ?? (cancelMode === "timeout" ? "system" : "customer");
  const reasonCode = input.reasonCode?.trim() || "CUSTOMER_CANCELLED";
  const reasonText =
    input.reasonText?.trim() ||
    (cancelMode === "timeout"
      ? "Rider Not Assigned"
      : "Customer cancelled parcel while searching");

  const status = String(row.status ?? "");
  if (status === "cancelled") {
    return { orderId: row.orderId, status: "CANCELLED" };
  }
  if (!CANCELLABLE_STATUSES.has(status)) {
    throw Object.assign(new Error("Parcel cannot be cancelled in current status"), {
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
      .update(ordersParcel)
      .set({
        cancelledByType,
        cancelledAt: now,
        cancellationReasonCode: reasonCode,
        cancellationReasonText: reasonText,
        updatedAt: now,
      })
      .where(eq(ordersParcel.orderId, row.id));
  });

  await recordOrderCancellation(sqlClient, {
    orderCorePk: row.id,
    cancelledBy: cancelledByType === "system" ? "SYSTEM" : "customer",
    cancelledById: cancelledByType === "customer" ? input.customerPk : null,
    reasonCode: cancelMode === "timeout" ? "AUTO_CANCELLED" : reasonCode,
    reasonText,
    previousStatus: status,
    displayReason: cancelMode === "timeout" ? "Auto Cancelled" : reasonText,
    cancelledByType,
    cancelledByLabel: cancelMode === "timeout" ? "Auto Cancelled" : "Customer",
    cancelMode: cancelMode === "timeout" ? "auto" : cancelMode,
    actionSource: cancelMode === "timeout" ? "parcel_search_timeout" : "parcel_search",
    metadata: { serviceType: "parcel", cancelMode, timeout: cancelMode === "timeout" },
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
